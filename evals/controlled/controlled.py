"""Controlled evaluations comparing harness variants under fixed conditions."""
from __future__ import annotations

import json
import uuid
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

try:
    import jsonschema
except ImportError:
    jsonschema = None


ROOT = Path(__file__).resolve().parents[2]
FIXTURES_DIR = ROOT / "evals" / "fixtures"
EVAL_SCHEMA = FIXTURES_DIR / "evaluation-result.schema.json"
DEFAULT_CORPUS = FIXTURES_DIR / "agent-quality-benchmark.json"


def load_json(path: str | Path) -> Any:
    return json.loads(Path(path).read_text(encoding="utf-8-sig"))


def validate_schema(instance: Any, schema_path: str | Path) -> None:
    if jsonschema is None:
        return
    schema = load_json(schema_path)
    validator = jsonschema.Draft202012Validator(schema)
    errors = sorted(validator.iter_errors(instance), key=lambda e: list(e.absolute_path))
    if errors:
        details = [f"{'/'.join(str(p) for p in e.absolute_path) or '<root>'}: {e.message}" for e in errors[:10]]
        raise ValueError("; ".join(details))


def make_blank_dimensions() -> dict[str, Any]:
    return {
        "completion": {"value": "not_run", "evidence": ""},
        "requirement_coverage": {"value": None, "covered": 0, "total": 0, "evidence": ""},
        "false_pass_rate": {"value": None, "count": 0, "total": 0, "evidence": ""},
        "owner_correction_rate": {"value": None, "corrected": 0, "total": 0, "evidence": ""},
        "escaped_regression": {"value": None, "evidence": ""},
        "evidence_completeness": {"value": None, "evidence": ""},
        "rework_loops": {"value": None, "evidence": ""},
        "wall_time_seconds": {"value": None, "evidence": ""},
        "input_tokens": {"total": None, "cached": None, "uncached": None, "evidence": ""},
        "output_tokens": {"total": None, "reasoning": None, "evidence": ""},
        "subagent_input_tokens": {"total": None, "cached": None, "evidence": ""},
        "subagent_output_tokens": {"total": None, "reasoning": None, "evidence": ""},
        "tool_calls": {"total": 0, "failures": 0, "retries": 0, "evidence": ""},
        "context_sources": {"count": 0, "estimated_size": None, "sources": [], "evidence": ""},
        "subagent_lifecycle": {"spawned": 0, "handoffs": 0, "evidence": ""},
        "verification": {"tests_executed": None, "tests_passed": None, "tests_failed": None, "evidence": ""},
        "changed_files": {"files": 0, "lines": 0, "evidence": ""},
        "acceptance": {"value": "unknown", "evidence": ""},
    }


def from_live_record(record: dict[str, Any], case: dict[str, Any]) -> dict[str, Any]:
    """Convert a live benchmark record to a multidimensional evaluation result."""
    dims = make_blank_dimensions()
    outcome = record.get("outcome", "NOT_RUN")
    completion_map = {"PASS": "pass", "PARTIAL": "partial", "BLOCKED": "blocked", "FAIL": "failed", "NOT_RUN": "not_run"}
    dims["completion"] = {"value": completion_map.get(outcome, outcome.lower()), "evidence": record.get("notes", "")}
    scores = record.get("scores", {})
    req_total = len(case.get("required_behavior", []))
    req_covered = sum(1 for _ in case.get("required_behavior", []))
    dims["requirement_coverage"] = {
        "value": req_covered / req_total if req_total > 0 else None,
        "covered": req_covered, "total": req_total,
        "evidence": f"scores={scores}" if scores else "",
    }
    if record.get("evidence_kind") == "empirical":
        oc = bool(record.get("owner_correction"))
        dims["owner_correction_rate"] = {"value": 1.0 if oc else 0.0, "corrected": 1 if oc else 0, "total": 1, "evidence": ""}
        if outcome == "PASS" and oc:
            dims["false_pass_rate"] = {"value": 1.0, "count": 1, "total": 1, "evidence": "owner-corrected PASS"}
    evidence_items = record.get("evidence", [])
    passing = [e for e in evidence_items if e.get("status") == "PASS"]
    dims["evidence_completeness"] = {
        "value": len(passing) / len(evidence_items) if evidence_items else None,
        "evidence": f"{len(passing)}/{len(evidence_items)} passing",
    }
    friction = record.get("friction", [])
    dims["rework_loops"] = {"value": len(friction), "evidence": "; ".join(friction) if friction else ""}
    dims["wall_time_seconds"] = {"value": record.get("duration_seconds"), "evidence": ""}
    input_t = record.get("input_tokens")
    cached_t = record.get("cached_input_tokens")
    uncached_t = record.get("uncached_input_tokens")
    dims["input_tokens"] = {"total": input_t, "cached": cached_t, "uncached": uncached_t, "evidence": ""}
    output_t = record.get("output_tokens")
    reasoning_t = record.get("reasoning_output_tokens")
    dims["output_tokens"] = {"total": output_t, "reasoning": reasoning_t, "evidence": ""}
    sa_input = record.get("subagent_input_tokens")
    sa_output = record.get("subagent_output_tokens")
    dims["subagent_input_tokens"] = {"total": sa_input, "cached": record.get("subagent_cached_input_tokens"), "evidence": ""}
    dims["subagent_output_tokens"] = {"total": sa_output, "reasoning": record.get("subagent_reasoning_output_tokens"), "evidence": ""}
    dims["tool_calls"] = {"total": record.get("tool_calls", 0), "failures": 0, "retries": 0, "evidence": ""}
    dims["verification"] = {
        "tests_executed": None, "tests_passed": None, "tests_failed": None,
        "evidence": f"{len(passing)} evidence items",
    }
    return dims


def compare_variants(
    records: list[dict[str, Any]],
    corpus: dict[str, Any] | None = None,
    fixed_sha: str = "unknown",
    fixed_task: str = "multi-variant",
) -> list[dict[str, Any]]:
    """Group records by case+run and produce multidimensional comparison."""
    if corpus is None:
        corpus = load_json(DEFAULT_CORPUS)
    live_cases = {c["id"]: c for c in corpus.get("cases", []) if c.get("evaluator") == "live"}
    groups: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for rec in records:
        groups[(rec.get("run_id", "?"), rec.get("case_id", "?"))].append(rec)
    results: list[dict[str, Any]] = []
    for (run_id, case_id), group in groups.items():
        case = live_cases.get(case_id, {})
        for rec in group:
            dims = from_live_record(rec, case)
            result = {
                "schema_version": 1,
                "eval_id": f"{run_id}-{case_id}-{rec.get('variant', '?')}",
                "case_id": case_id,
                "variant": rec.get("variant", "unknown"),
                "repository_sha": fixed_sha,
                "task": fixed_task or case.get("prompt", ""),
                "environment": rec.get("platform", "unknown"),
                "tools_available": rec.get("tools_available", []),
                "model_snapshot": rec.get("model_version") or rec.get("model"),
                "dimensions": dims,
                "outcome": rec.get("outcome", "NOT_RUN"),
                "evidence_kind": rec.get("evidence_kind", "synthetic"),
                "ts": datetime.now(timezone.utc).isoformat(),
                "duration_seconds": rec.get("duration_seconds"),
            }
            validate_schema(result, EVAL_SCHEMA)
            results.append(result)
    return results


def summarize_comparison(eval_results: list[dict[str, Any]]) -> dict[str, Any]:
    """Produce a summary across all evaluation results."""
    if not eval_results:
        return {"total": 0, "note": "no evaluation results"}
    by_variant: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for r in eval_results:
        by_variant[r.get("variant", "?")].append(r)
    summary: dict[str, Any] = {}
    for variant, items in by_variant.items():
        passes = sum(1 for r in items if r["outcome"] == "PASS")
        summary[variant] = {
            "runs": len(items),
            "pass": passes,
            "fail": len(items) - passes,
        }
    return summary
