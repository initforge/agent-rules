#!/usr/bin/env python3
"""Evidence-first benchmark utilities for agent-rules.

The module evaluates deterministic routing and validates externally collected
live-agent evidence. It never invokes an agent, mutates runtime configuration,
or promotes benchmark findings into living context.
"""
from __future__ import annotations

import hashlib
import json
import tempfile
from collections import Counter, defaultdict
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Iterator

try:
    import jsonschema
except ImportError:  # pragma: no cover - exercised only on minimal Python hosts
    jsonschema = None


ROOT = Path(__file__).resolve().parents[1]
BENCHMARK_DIR = ROOT / "automation" / "benchmarks"
DEFAULT_CORPUS = BENCHMARK_DIR / "agent-quality-benchmark.json"
DEFAULT_CORPUS_SCHEMA = BENCHMARK_DIR / "agent-quality-benchmark.schema.json"
DEFAULT_LIVE_SCHEMA = BENCHMARK_DIR / "live-result.schema.json"
DEFAULT_TRACE_SCHEMA = ROOT / "automation" / "trace-schema.json"
DEFAULT_GRAPH = ROOT / "05-generated" / "context-graph.json"


class ContractError(ValueError):
    """Raised when benchmark evidence violates a canonical contract."""


def load_json(path: str | Path) -> Any:
    return json.loads(Path(path).read_text(encoding="utf-8-sig"))


def canonical_hash(value: Any) -> str:
    body = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(body.encode("utf-8")).hexdigest()


def validate_schema(instance: Any, schema_path: str | Path) -> None:
    if jsonschema is None:
        _fallback_validate(instance, Path(schema_path).name)
        return
    schema = load_json(schema_path)
    validator = jsonschema.Draft202012Validator(
        schema,
        format_checker=jsonschema.FormatChecker(),
    )
    errors = sorted(validator.iter_errors(instance), key=lambda item: list(item.absolute_path))
    if errors:
        details = []
        for error in errors[:10]:
            location = "/".join(str(part) for part in error.absolute_path) or "<root>"
            details.append(f"{location}: {error.message}")
        raise ContractError("; ".join(details))


def _require_keys(instance: dict[str, Any], required: set[str], label: str) -> None:
    missing = sorted(required - set(instance))
    if missing:
        raise ContractError(f"{label}: missing required keys {missing}")


def _fallback_validate(instance: Any, schema_name: str) -> None:
    """Portable essential checks when jsonschema is unavailable.

    Canonical JSON schemas remain authoritative. This fallback protects the
    critical shape, score bounds, privacy boundary, and timestamps using only
    the Python standard library.
    """
    if not isinstance(instance, dict):
        raise ContractError(f"{schema_name}: expected object")
    if schema_name == "agent-quality-benchmark.schema.json":
        _require_keys(instance, {"version", "description", "score_scale", "decision_thresholds", "cases"}, "corpus")
        if not isinstance(instance["cases"], list) or len(instance["cases"]) < 30:
            raise ContractError("corpus: cases must contain at least 30 entries")
        for index, case in enumerate(instance["cases"]):
            _require_keys(case, {"id", "class", "evaluator", "prompt", "workspace"}, f"case[{index}]")
            if case["evaluator"] == "deterministic":
                _require_keys(case, {"expected"}, f"case[{index}]")
            elif case["evaluator"] == "live":
                _require_keys(case, {"required_behavior", "scoring_dimensions", "variants"}, f"case[{index}]")
            else:
                raise ContractError(f"case[{index}]: unknown evaluator {case['evaluator']}")
        return
    if schema_name == "live-result.schema.json":
        required = {
            "run_id", "case_id", "variant", "evidence_kind", "platform", "model", "reasoning_effort",
            "tools_available", "started_at", "finished_at", "outcome", "scores",
            "evidence", "owner_correction", "friction",
        }
        allowed = required | {
            "model_version", "duration_seconds", "input_tokens", "output_tokens",
            "cached_input_tokens", "uncached_input_tokens", "reasoning_output_tokens",
            "tool_calls", "turn_count", "tool_output_chars", "max_input_tokens", "termination", "notes",
        }
        _require_keys(instance, required, "live result")
        unknown = sorted(set(instance) - allowed)
        if unknown:
            raise ContractError(f"live result: unknown/privacy-sensitive keys {unknown}")
        for field in ("started_at", "finished_at"):
            try:
                datetime.fromisoformat(str(instance[field]).replace("Z", "+00:00"))
            except ValueError as exc:
                raise ContractError(f"live result: invalid {field}") from exc
        scores = instance.get("scores")
        expected_scores = {"scope", "correctness", "safety", "verification", "communication"}
        if not isinstance(scores, dict) or set(scores) != expected_scores:
            raise ContractError("live result: scores must contain exactly five dimensions")
        if any(not isinstance(value, int) or value < 0 or value > 4 for value in scores.values()):
            raise ContractError("live result: scores must be integers from 0 to 4")
        return
    if schema_name == "trace-schema.json":
        _require_keys(
            instance,
            {"ts", "lane", "status", "task_summary", "files_changed", "verification", "friction"},
            "trace",
        )
        return
    raise ContractError(f"no portable validator for {schema_name}")


def validate_corpus(corpus: dict[str, Any], graph: dict[str, Any] | None = None) -> dict[str, int]:
    validate_schema(corpus, DEFAULT_CORPUS_SCHEMA)
    case_ids = [str(case["id"]) for case in corpus["cases"]]
    duplicates = sorted(case_id for case_id, count in Counter(case_ids).items() if count > 1)
    if duplicates:
        raise ContractError(f"duplicate benchmark case ids: {duplicates}")

    deterministic = [case for case in corpus["cases"] if case["evaluator"] == "deterministic"]
    live = [case for case in corpus["cases"] if case["evaluator"] == "live"]
    if len(deterministic) < 15 or len(live) < 15:
        raise ContractError("benchmark requires at least 15 deterministic and 15 live cases")

    if graph is not None:
        graph_ids = {str(node["id"]) for node in graph.get("nodes", [])}
        for case in deterministic:
            for node_id in case.get("expected", {}).get("context_nodes", []):
                if node_id not in graph_ids:
                    raise ContractError(f"{case['id']}: missing graph context node {node_id}")
    return {"total": len(case_ids), "deterministic": len(deterministic), "live": len(live)}


@contextmanager
def benchmark_workspace(case: dict[str, Any]) -> Iterator[Path]:
    workspace = case["workspace"]
    if workspace["kind"] == "harness":
        yield ROOT
        return
    with tempfile.TemporaryDirectory(prefix="agent-quality-") as holder:
        root = Path(holder)
        if workspace.get("has_5fedu_context"):
            context = root / "context" / "5fedu"
            context.mkdir(parents=True)
            (context / "00-context-map.md").write_text("fixture", encoding="utf-8")
        yield root


def _route_token_estimate(decision: dict[str, Any], graph: dict[str, Any]) -> int:
    nodes = {str(node["id"]): node for node in graph.get("nodes", [])}
    selected_ids = [f"skill:{slug}" for slug in decision.get("stack", [])]
    selected_ids.extend(decision.get("context_nodes", []))
    return sum(int(nodes[node_id].get("token_estimate", 0)) for node_id in set(selected_ids) if node_id in nodes)


def _check_route(case: dict[str, Any], decision: dict[str, Any]) -> list[str]:
    expected = case["expected"]
    failures: list[str] = []
    if decision.get("primary") != expected.get("primary"):
        failures.append(f"primary={decision.get('primary')!r}; expected={expected.get('primary')!r}")

    actual_stack = set(decision.get("stack") or [])
    actual_required = set(decision.get("required_skills") or [])
    actual_supporting = set(decision.get("supporting_skills") or [])
    actual_context = set(decision.get("context_nodes") or [])
    actual_intents = set(decision.get("intent_signals") or [])
    checks = (
        ("required skills", set(expected.get("required_skills", [])) - actual_required),
        ("supporting skills", set(expected.get("supporting_skills", [])) - actual_supporting),
        ("context nodes", set(expected.get("context_nodes", [])) - actual_context),
        ("intent signals", set(expected.get("intent_signals", [])) - actual_intents),
        ("forbidden skills", set(expected.get("forbidden_skills", [])) & actual_stack),
    )
    for label, values in checks:
        if values:
            failures.append(f"{label}: {sorted(values)}")
    return failures


def run_routing_benchmark(
    corpus: dict[str, Any],
    graph_path: str | Path = DEFAULT_GRAPH,
) -> dict[str, Any]:
    import sys

    scripts = ROOT / "platforms" / "shared" / "scripts"
    if str(scripts) not in sys.path:
        sys.path.insert(0, str(scripts))
    from context_router import load_graph, route  # type: ignore

    graph = load_graph(graph_path)
    counts = validate_corpus(corpus, graph)
    results: list[dict[str, Any]] = []
    for case in corpus["cases"]:
        if case["evaluator"] != "deterministic":
            continue
        with benchmark_workspace(case) as workspace:
            decision = route(case["prompt"], [workspace], graph)
        failures = _check_route(case, decision)
        results.append(
            {
                "case_id": case["id"],
                "pass": not failures,
                "failures": failures,
                "expected": case["expected"],
                "actual": {
                    "primary": decision.get("primary"),
                    "required_skills": decision.get("required_skills", []),
                    "supporting_skills": decision.get("supporting_skills", []),
                    "stack": decision.get("stack", []),
                    "context_nodes": decision.get("context_nodes", []),
                    "intent_signals": decision.get("intent_signals", []),
                },
                "route_tokens": _route_token_estimate(decision, graph),
            }
        )
    passed = sum(1 for result in results if result["pass"])
    return {
        "version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "corpus_hash": canonical_hash(corpus),
        "graph_hash": graph.get("graph_hash"),
        "corpus_counts": counts,
        "summary": {"total": len(results), "passed": passed, "failed": len(results) - passed},
        "cases": results,
    }


def read_records(paths: Iterable[str | Path]) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for raw in paths:
        path = Path(raw)
        if path.suffix.lower() == ".jsonl":
            for line_number, line in enumerate(path.read_text(encoding="utf-8-sig").splitlines(), start=1):
                if not line.strip():
                    continue
                try:
                    record = json.loads(line)
                except json.JSONDecodeError as exc:
                    raise ContractError(f"{path}:{line_number}: {exc}") from exc
                if not isinstance(record, dict):
                    raise ContractError(f"{path}:{line_number}: expected object")
                records.append(record)
        else:
            value = load_json(path)
            if isinstance(value, list):
                records.extend(value)
            elif isinstance(value, dict):
                records.append(value)
            else:
                raise ContractError(f"{path}: expected object or array")
    return records


def validate_live_results(records: list[dict[str, Any]], corpus: dict[str, Any]) -> None:
    live_cases = {case["id"]: case for case in corpus["cases"] if case["evaluator"] == "live"}
    seen: set[tuple[str, str, str]] = set()
    for index, record in enumerate(records):
        validate_schema(record, DEFAULT_LIVE_SCHEMA)
        case_id = str(record["case_id"])
        if case_id not in live_cases:
            raise ContractError(f"record {index}: unknown or non-live case_id {case_id}")
        if record["variant"] not in live_cases[case_id]["variants"]:
            raise ContractError(f"record {index}: variant {record['variant']} not allowed for {case_id}")
        started = datetime.fromisoformat(str(record["started_at"]).replace("Z", "+00:00"))
        finished = datetime.fromisoformat(str(record["finished_at"]).replace("Z", "+00:00"))
        if finished < started:
            raise ContractError(f"record {index}: finished_at precedes started_at")
        if record["outcome"] == "PASS" and not any(item.get("status") == "PASS" for item in record["evidence"]):
            raise ContractError(f"record {index}: PASS requires at least one passing evidence item")
        if record["evidence_kind"] == "empirical" and record["platform"] == "fixture":
            raise ContractError(f"record {index}: fixture platform cannot be empirical evidence")
        key = (str(record["run_id"]), case_id, str(record["variant"]))
        if key in seen:
            raise ContractError(f"duplicate live result key: {key}")
        seen.add(key)


def validate_trace_records(records: list[dict[str, Any]]) -> list[str]:
    warnings: list[str] = []
    for index, record in enumerate(records):
        try:
            validate_schema(record, DEFAULT_TRACE_SCHEMA)
        except ContractError as exc:
            warnings.append(f"trace[{index}]: {exc}")
    return warnings


def aggregate_quality_report(
    corpus: dict[str, Any],
    routing_report: dict[str, Any] | None,
    live_results: list[dict[str, Any]],
    trace_records: list[dict[str, Any]],
) -> dict[str, Any]:
    validate_corpus(corpus)
    validate_live_results(live_results, corpus)
    trace_warnings = validate_trace_records(trace_records)

    empirical_results = [result for result in live_results if result["evidence_kind"] == "empirical"]
    synthetic_results = [result for result in live_results if result["evidence_kind"] == "synthetic"]
    by_variant: dict[str, dict[str, Any]] = {}
    for variant in ("baseline", "core", "full"):
        selected = [result for result in empirical_results if result["variant"] == variant]
        score_values = [score for result in selected for score in result["scores"].values()]
        def average_metric(name: str) -> float | None:
            values = [float(result[name]) for result in selected if isinstance(result.get(name), (int, float))]
            return round(sum(values) / len(values), 3) if values else None
        by_variant[variant] = {
            "runs": len(selected),
            "pass": sum(result["outcome"] == "PASS" for result in selected),
            "partial": sum(result["outcome"] == "PARTIAL" for result in selected),
            "blocked": sum(result["outcome"] == "BLOCKED" for result in selected),
            "fail": sum(result["outcome"] == "FAIL" for result in selected),
            "owner_corrections": sum(bool(result["owner_correction"]) for result in selected),
            "average_score": round(sum(score_values) / len(score_values), 3) if score_values else None,
            "average_duration_seconds": average_metric("duration_seconds"),
            "average_input_tokens": average_metric("input_tokens"),
            "average_cached_input_tokens": average_metric("cached_input_tokens"),
            "average_uncached_input_tokens": average_metric("uncached_input_tokens"),
            "average_output_tokens": average_metric("output_tokens"),
            "average_tool_calls": average_metric("tool_calls"),
            "average_turn_count": average_metric("turn_count"),
            "average_tool_output_chars": average_metric("tool_output_chars"),
        }

    comparable_groups = 0
    comparable_case_ids: set[str] = set()
    groups: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for result in empirical_results:
        groups[(str(result["run_id"]), str(result["case_id"]))].append(result)
    for grouped in groups.values():
        if {result["variant"] for result in grouped} != {"baseline", "core", "full"}:
            continue
        signatures = {
            (
                result["platform"],
                result["model"],
                result.get("model_version", ""),
                result["reasoning_effort"],
                tuple(sorted(result["tools_available"])),
            )
            for result in grouped
        }
        if len(signatures) == 1:
            comparable_groups += 1
            comparable_case_ids.add(str(grouped[0]["case_id"]))

    friction = Counter(
        item
        for result in empirical_results
        for item in result.get("friction", [])
        if str(item).strip()
    )
    routing_failed = int((routing_report or {}).get("summary", {}).get("failed", 0))
    thresholds = corpus["decision_thresholds"]
    minimum_cases = int(thresholds["minimum_comparable_cases"])
    minimum_triplets = int(thresholds["minimum_comparable_triplets"])
    if routing_failed:
        recommendation = "ROLLBACK"
    elif any(result["outcome"] in {"FAIL", "PARTIAL"} or result["owner_correction"] for result in empirical_results):
        recommendation = "INVESTIGATE"
    elif not empirical_results or comparable_groups == 0:
        recommendation = "NO_CHANGE"
    elif comparable_groups < minimum_triplets or len(comparable_case_ids) < minimum_cases:
        recommendation = "INSUFFICIENT_EVIDENCE"
    else:
        recommendation = "KEEP"

    return {
        "version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "corpus_hash": canonical_hash(corpus),
        "routing": (routing_report or {}).get("summary", {"total": 0, "passed": 0, "failed": 0}),
        "live": {
            "total_records": len(live_results),
            "empirical_runs": len(empirical_results),
            "synthetic_runs": len(synthetic_results),
            "unique_cases": len({result["case_id"] for result in empirical_results}),
            "comparable_triplets": comparable_groups,
            "comparable_cases": len(comparable_case_ids),
            "decision_thresholds": {
                "minimum_comparable_cases": minimum_cases,
                "minimum_comparable_triplets": minimum_triplets,
            },
            "by_variant": by_variant,
        },
        "trace": {"records": len(trace_records), "warnings": trace_warnings},
        "friction": [{"name": name, "count": count} for name, count in friction.most_common()],
        "recommendation": recommendation,
        "promotion_candidates": [],
    }


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Agent quality evidence report",
        "",
        f"- Generated: {report['generated_at']}",
        f"- Recommendation: **{report['recommendation']}**",
        f"- Routing: {report['routing']['passed']}/{report['routing']['total']} passed",
        f"- Live evidence: {report['live']['empirical_runs']} empirical runs across {report['live']['unique_cases']} cases",
        f"- Synthetic contract records excluded from evidence: {report['live']['synthetic_runs']}",
        f"- Comparable baseline/core/full triplets: {report['live']['comparable_triplets']}",
        f"- Comparable cases: {report['live']['comparable_cases']}",
        f"- KEEP threshold: {report['live']['decision_thresholds']['minimum_comparable_cases']} cases and "
        f"{report['live']['decision_thresholds']['minimum_comparable_triplets']} triplets",
        f"- Trace: {report['trace']['records']} records; {len(report['trace']['warnings'])} advisory warnings",
        "",
        "## Variant comparison",
        "",
        "| Variant | Runs | PASS | PARTIAL | BLOCKED | FAIL | Owner corrections | Average score |",
        "|---|---:|---:|---:|---:|---:|---:|---:|",
    ]
    for variant, values in report["live"]["by_variant"].items():
        average = "—" if values["average_score"] is None else f"{values['average_score']:.3f}"
        lines.append(
            f"| {variant} | {values['runs']} | {values['pass']} | {values['partial']} | "
            f"{values['blocked']} | {values['fail']} | {values['owner_corrections']} | {average} |"
        )
    lines.extend([
        "", "## Efficiency (average per empirical run)", "",
        "| Variant | Input | Cached input | Uncached input | Output | Tool calls | Turns | Tool output (chars) |",
        "|---|---:|---:|---:|---:|---:|---:|---:|",
    ])
    for variant, values in report["live"]["by_variant"].items():
        def show(name: str) -> str:
            value = values.get(name)
            return "—" if value is None else f"{value:,.0f}"
        lines.append(
            f"| {variant} | {show('average_input_tokens')} | {show('average_cached_input_tokens')} | "
            f"{show('average_uncached_input_tokens')} | {show('average_output_tokens')} | "
            f"{show('average_tool_calls')} | {show('average_turn_count')} | {show('average_tool_output_chars')} |"
        )
    lines.extend(["", "## Friction", ""])
    if report["friction"]:
        lines.extend(f"- {item['name']}: {item['count']}" for item in report["friction"])
    else:
        lines.append("- No repeated friction in the supplied live evidence.")
    if report["trace"]["warnings"]:
        lines.extend(["", "## Advisory trace warnings", ""])
        lines.extend(f"- {warning}" for warning in report["trace"]["warnings"])
    lines.extend(
        [
            "",
            "## Decision rule",
            "",
            "This report never promotes a rule automatically. Review repeated friction through the context evolution promotion gate.",
            "",
        ]
    )
    return "\n".join(lines)


def write_json(path: str | Path, value: Any) -> None:
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def write_jsonl(path: str | Path, records: Iterable[dict[str, Any]]) -> None:
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    body = "".join(json.dumps(record, ensure_ascii=False, sort_keys=True) + "\n" for record in records)
    target.write_text(body, encoding="utf-8")
