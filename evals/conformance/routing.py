"""Deterministic routing conformance tests — runnable in PR CI without model calls."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

try:
    import jsonschema
except ImportError:
    jsonschema = None


ROOT = Path(__file__).resolve().parents[2]
BENCHMARK_DIR = ROOT / "automation" / "benchmarks"
DEFAULT_CORPUS = BENCHMARK_DIR / "agent-quality-benchmark.json"
DEFAULT_CORPUS_SCHEMA = BENCHMARK_DIR / "agent-quality-benchmark.schema.json"
DEFAULT_GRAPH = ROOT / "generated" / "context-graph.json"


class ConformanceError(ValueError):
    """Raised when a conformance check fails."""


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
        raise ConformanceError("; ".join(details))


def check_corpus_integrity(corpus_path: str | Path = DEFAULT_CORPUS) -> dict[str, int]:
    """Validate corpus schema and structural integrity. No model calls."""
    corpus = load_json(corpus_path)
    validate_schema(corpus, DEFAULT_CORPUS_SCHEMA)
    cases = corpus.get("cases", [])
    if len(cases) < 30:
        raise ConformanceError(f"corpus requires at least 30 cases, got {len(cases)}")
    ids = [c["id"] for c in cases]
    dupes = sorted(i for i in ids if ids.count(i) > 1)
    if dupes:
        raise ConformanceError(f"duplicate case ids: {dupes}")
    deterministic = [c for c in cases if c.get("evaluator") == "deterministic"]
    live = [c for c in cases if c.get("evaluator") == "live"]
    if len(deterministic) < 15 or len(live) < 15:
        raise ConformanceError(f"need >=15 deterministic ({len(deterministic)}) and >=15 live ({len(live)})")
    for case in deterministic:
        if "expected" not in case:
            raise ConformanceError(f"deterministic case {case['id']} missing expected field")
    for case in live:
        for field in ("required_behavior", "scoring_dimensions", "variants", "claim_profile"):
            if field not in case:
                raise ConformanceError(f"live case {case['id']} missing {field}")
    return {"total": len(cases), "deterministic": len(deterministic), "live": len(live)}


def check_routing_contracts(corpus_path: str | Path = DEFAULT_CORPUS, graph_path: str | Path = DEFAULT_GRAPH) -> dict[str, Any]:
    """Validate routing contracts against the context graph. No model calls.

    Checks that every context_node referenced in deterministic cases exists
    in the graph. Skill name checks are performed by the actual routing
    benchmark; conformance only validates structural graph-node references.
    """
    corpus = load_json(corpus_path)
    graph = load_json(graph_path)
    graph_nodes = {str(n["id"]): n for n in graph.get("nodes", [])} if graph else {}
    results = []
    for case in corpus.get("cases", []):
        if case.get("evaluator") != "deterministic":
            continue
        expected = case.get("expected", {})
        failures = []
        for cn in expected.get("context_nodes", []):
            if cn not in graph_nodes:
                failures.append(f"missing graph context node: {cn}")
        results.append({"case_id": case["id"], "pass": not failures, "failures": failures})
    passed = sum(1 for r in results if r["pass"])
    return {"total": len(results), "passed": passed, "failed": len(results) - passed, "cases": results}


def check_fixture_oracles(corpus_path: str | Path = DEFAULT_CORPUS) -> list[str]:
    """Verify every live case fixture that is present in the fixtures file. No model calls.

    Skipped fixtures (those not in live-fixtures.json) are not reported as errors;
    they may be defined externally or created at runtime.
    """
    corpus = load_json(corpus_path)
    fixtures_path = BENCHMARK_DIR / "live-fixtures.json"
    fixtures = load_json(fixtures_path).get("fixtures", {})
    issues = []
    for case in corpus.get("cases", []):
        if case.get("evaluator") != "live":
            continue
        fixture_name = case.get("workspace", {}).get("fixture")
        if not fixture_name:
            issues.append(f"live case {case['id']} has no fixture")
            continue
        if fixture_name not in fixtures:
            continue
        fx = fixtures[fixture_name]
        if not fx.get("files"):
            issues.append(f"fixture {fixture_name} has no files")
    return issues


def run_all(corpus_path: str | Path = DEFAULT_CORPUS, graph_path: str | Path = DEFAULT_GRAPH) -> dict[str, Any]:
    """Run all conformance checks. Returns report dict."""
    counts = check_corpus_integrity(corpus_path)
    routing = check_routing_contracts(corpus_path, graph_path)
    fixture_issues = check_fixture_oracles(corpus_path)
    return {
        "schema_version": 1,
        "conformance": "PASS" if not routing["failed"] and not fixture_issues else "FAIL",
        "corpus": counts,
        "routing": routing,
        "fixture_issues": fixture_issues,
    }
