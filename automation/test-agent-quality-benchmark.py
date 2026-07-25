#!/usr/bin/env python3
"""Regression suite for evidence-first benchmark contracts and reports."""
from __future__ import annotations

import argparse
import copy
import subprocess
import sys
import tempfile
from pathlib import Path

import agent_quality as quality
from agent_quality import (
    BENCHMARK_DIR,
    DEFAULT_CORPUS,
    DEFAULT_GRAPH,
    ContractError,
    aggregate_quality_report,
    load_json,
    read_records,
    render_markdown,
    run_routing_benchmark,
    validate_corpus,
    validate_live_results,
    validate_trace_records,
    write_json,
)


ROOT = Path(__file__).resolve().parents[1]
FIXTURES = BENCHMARK_DIR / "fixtures"

sys.path.insert(0, str(ROOT / "automation"))
from conformance.routing import run_all as conformance_run, check_corpus_integrity, check_fixture_oracles
from telemetry.collector import TelemetryCollector
from evaluations.controlled import compare_variants, make_blank_dimensions
from evaluations.native_eval import make_capability_receipt, produce_native_result
from outcome.tracker import OutcomeTracker
from benchmarks.compat.reader_v1 import convert_v1_live_record, convert_v1_report


def profiled_record(base: dict, case: dict, run_id: str) -> dict:
    profiles = load_json(quality.DEFAULT_EVIDENCE_PROFILES)["profiles"]
    profile_name = case["claim_profile"]
    profile = profiles[profile_name]
    dimensions = set(profile["required_dimensions"])
    dimensions.update(profile.get("conditional_dimensions", {}).keys())
    item = copy.deepcopy(base)
    item["run_id"] = run_id
    item["case_id"] = case["id"]
    item["claim_profile"] = profile_name
    item["proof_dimensions"] = sorted(dimensions)
    item["evidence"] = [{
        "type": "command",
        "kind": "custom-runtime",
        "label": "profile contract fixture",
        "status": "PASS",
        "ref": "automation/test-agent-quality-benchmark.py",
        "dimensions": sorted(dimensions),
    }]
    return item


def contracts_only() -> None:
    corpus = load_json(DEFAULT_CORPUS)
    graph = load_json(DEFAULT_GRAPH)
    counts = validate_corpus(corpus, graph)
    if counts["total"] < 30:
        raise AssertionError("benchmark corpus is unexpectedly small")
    normal = next(case for case in corpus["cases"] if case["id"] == "live-normal-multifile")
    if normal["workspace"].get("fixture") != "normal-multifile":
        raise AssertionError("live-normal-multifile fixture binding drifted")
    print(
        "PASS: benchmark contracts "
        f"({counts['total']} cases; {counts['deterministic']} deterministic; {counts['live']} live)"
    )


def routing_only(output: str | None) -> dict:
    existing = subprocess.run(
        [sys.executable, str(ROOT / "automation" / "test-context-router.py")],
        cwd=ROOT,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    if existing.returncode:
        raise AssertionError(existing.stdout + existing.stderr)
    corpus = load_json(DEFAULT_CORPUS)
    report = run_routing_benchmark(corpus)
    failures = [case for case in report["cases"] if not case["pass"]]
    if failures:
        details = "; ".join(f"{case['case_id']}: {case['failures']}" for case in failures)
        raise AssertionError(details)
    if output:
        write_json(output, report)
    print(f"PASS: evidence routing benchmark ({report['summary']['passed']}/{report['summary']['total']})")
    return report


def live_only() -> list[dict]:
    corpus = load_json(DEFAULT_CORPUS)
    valid = read_records([FIXTURES / "live-valid.jsonl"])
    validate_live_results(valid, corpus)
    invalid = read_records([FIXTURES / "live-invalid.jsonl"])
    try:
        validate_live_results(invalid, corpus)
    except ContractError:
        pass
    else:
        raise AssertionError("invalid live result fixture was accepted")
    duplicate = [valid[0], copy.deepcopy(valid[0])]
    try:
        validate_live_results(duplicate, corpus)
    except ContractError:
        pass
    else:
        raise AssertionError("duplicate live result key was accepted")
    false_pass = read_records([FIXTURES / "false-pass-invalid.jsonl"])
    for record in false_pass:
        try:
            validate_live_results([record], corpus)
        except ContractError:
            pass
        else:
            raise AssertionError(f"build-only deep-behavior fixture was accepted: {record['case_id']}")
    live_cases = [case for case in corpus["cases"] if case["evaluator"] == "live"]
    for case in live_cases:
        record = profiled_record(valid[0], case, f"build-only-{case['id']}")
        record["evidence"][0]["kind"] = "build"
        try:
            validate_live_results([record], corpus)
        except ContractError:
            pass
        else:
            raise AssertionError(f"build-only evidence was accepted for live case: {case['id']}")
    ui_missing_reference = copy.deepcopy(
        next(record for record in false_pass if record["case_id"] == "live-5fedu-ui-parity")
    )
    ui_missing_reference["evidence"][0]["kind"] = "browser-test"
    ui_missing_reference["evidence"][0]["dimensions"].remove("reference")
    ui_missing_reference["proof_dimensions"].remove("reference")
    try:
        validate_live_results([ui_missing_reference], corpus)
    except ContractError:
        pass
    else:
        raise AssertionError("5fedu parity proof without reference dimension was accepted")
    inconsistent_tokens = copy.deepcopy(valid[0])
    inconsistent_tokens.update({
        "input_tokens": 100,
        "cached_input_tokens": 80,
        "uncached_input_tokens": 30,
    })
    try:
        validate_live_results([inconsistent_tokens], corpus)
    except ContractError:
        pass
    else:
        raise AssertionError("inconsistent cached/uncached token accounting was accepted")

    previous = quality.jsonschema
    try:
        quality.jsonschema = None
        quality.validate_schema(valid[0], quality.DEFAULT_LIVE_SCHEMA)
        try:
            quality.validate_schema(invalid[0], quality.DEFAULT_LIVE_SCHEMA)
        except ContractError:
            pass
        else:
            raise AssertionError("portable fallback accepted invalid live result")
    finally:
        quality.jsonschema = previous
    print(f"PASS: live-result contracts ({len(valid)} valid; invalid fixture rejected)")
    return valid


def report_only(output_dir: str | None, routing_report: dict | None = None) -> None:
    corpus = load_json(DEFAULT_CORPUS)
    routing_report = routing_report or run_routing_benchmark(corpus)
    live = read_records([FIXTURES / "live-valid.jsonl"])
    trace = read_records([FIXTURES / "trace-valid.jsonl"])
    warnings = validate_trace_records(trace)
    if warnings:
        raise AssertionError(warnings)
    report = aggregate_quality_report(corpus, routing_report, live, trace)
    if report["recommendation"] != "NO_CHANGE":
        raise AssertionError(f"fixture recommendation={report['recommendation']}; expected NO_CHANGE")
    if report["live"]["empirical_runs"] != 0 or report["live"]["synthetic_runs"] != len(live):
        raise AssertionError("synthetic fixtures were counted as empirical evidence")
    empirical = copy.deepcopy(live)
    for record in empirical:
        record["evidence_kind"] = "empirical"
        record["platform"] = "codex"
        record.update({"input_tokens": 100, "cached_input_tokens": 60, "uncached_input_tokens": 40,
                       "output_tokens": 10, "subagent_input_tokens": 25, "subagent_output_tokens": 5,
                       "subagent_cached_input_tokens": 10, "subagent_uncached_input_tokens": 15,
                       "reasoning_output_tokens": 4, "subagent_reasoning_output_tokens": 2,
                       "tool_calls": 3, "turn_count": 2, "tool_output_chars": 20})
    empirical_report = aggregate_quality_report(corpus, routing_report, empirical, trace)
    if empirical_report["recommendation"] != "INSUFFICIENT_EVIDENCE" or empirical_report["live"]["comparable_triplets"] != 1:
        raise AssertionError("small empirical sample was not recognized as insufficient")
    if empirical_report["live"]["by_variant"]["baseline"]["average_uncached_input_tokens"] != 40:
        raise AssertionError("token efficiency metrics were not aggregated")
    if empirical_report["live"]["by_variant"]["baseline"]["average_total_input_tokens"] != 125:
        raise AssertionError("main plus subagent token costs were not aggregated")
    if empirical_report["live"]["by_variant"]["baseline"]["average_total_cached_input_tokens"] != 70:
        raise AssertionError("main plus subagent cached tokens were not aggregated")
    if empirical_report["live"]["by_variant"]["baseline"]["average_total_uncached_input_tokens"] != 55:
        raise AssertionError("main plus subagent uncached tokens were not aggregated")
    if empirical_report["live"]["by_variant"]["baseline"]["average_total_reasoning_output_tokens"] != 6:
        raise AssertionError("main plus subagent reasoning tokens were not aggregated")
    false_pass_record = copy.deepcopy(empirical[0])
    false_pass_record["owner_correction"] = True
    false_pass_report = aggregate_quality_report(corpus, routing_report, [false_pass_record], trace)
    if false_pass_report["live"]["known_false_passes"] != 1:
        raise AssertionError("owner-corrected PASS was not counted as a known false PASS")
    empirical[-1]["outcome"] = "FAIL"
    failed_report = aggregate_quality_report(corpus, routing_report, empirical, trace)
    if failed_report["recommendation"] != "INVESTIGATE":
        raise AssertionError("failed empirical evidence did not trigger INVESTIGATE")
    live_cases = [case for case in corpus["cases"] if case["evaluator"] == "live"][:6]
    sufficient = []
    for repetition in range(2):
        for case in live_cases:
            for record in live:
                item = profiled_record(
                    record,
                    case,
                    f"threshold-{repetition}-{case['id']}",
                )
                item["evidence_kind"] = "empirical"
                item["platform"] = "codex"
                sufficient.append(item)
    sufficient_report = aggregate_quality_report(corpus, routing_report, sufficient, trace)
    if sufficient_report["recommendation"] != "KEEP":
        raise AssertionError("sufficient clean evidence did not trigger KEEP")
    target = Path(output_dir or ROOT / ".agent" / "benchmarks" / "self-test")
    write_json(target / "report.json", report)
    target.mkdir(parents=True, exist_ok=True)
    (target / "REPORT.md").write_text(render_markdown(report), encoding="utf-8")
    if not (target / "REPORT.md").read_text(encoding="utf-8").startswith("# Agent quality evidence report"):
        raise AssertionError("Markdown report was not generated")
    print(f"PASS: quality report fixture -> {target}")


def conformance_only() -> None:
    report = conformance_run()
    if report["conformance"] != "PASS":
        raise AssertionError(f"conformance failed: {report}")
    counts = check_corpus_integrity()
    if counts["total"] < 30:
        raise AssertionError(f"corpus too small: {counts['total']}")
    issues = check_fixture_oracles()
    if issues:
        raise AssertionError(f"fixture oracle issues: {issues}")
    print("PASS: conformance checks (model-free, PR CI ready)")


def telemetry_only() -> None:
    collector = TelemetryCollector()
    ev = collector.build_event(
        event_type="session.end",
        platform="codex",
        model="gpt-5.6-terra",
        effort="medium",
        role="main",
        task="conformance test",
        repository_revision="abc123",
        outcome="PASS",
        input_tokens=100,
        output_tokens=50,
        cached_input_tokens=60,
        uncached_input_tokens=40,
        reasoning_tokens=10,
    )
    eid = collector.record(ev)
    if len(eid) != 64:
        raise AssertionError(f"unexpected event_id length: {len(eid)}")
    if len(collector.events) != 1:
        raise AssertionError("collector did not record event")
    with tempfile.TemporaryDirectory(prefix="telemetry-test-") as holder:
        out = Path(holder) / "events.jsonl"
        collector.flush(out)
        if not out.is_file():
            raise AssertionError("telemetry flush did not write file")
    empty = TelemetryCollector()
    if empty.events:
        raise AssertionError("fresh collector should be empty")
    print("PASS: telemetry collector and exporter")


def evaluations_only() -> None:
    corpus = load_json(DEFAULT_CORPUS)
    records = read_records([FIXTURES / "live-valid.jsonl"])
    results = compare_variants(records, corpus)
    if not results:
        raise AssertionError("no evaluation results produced")
    for r in results:
        dims = r.get("dimensions", {})
        if "completion" not in dims or "tool_calls" not in dims:
            raise AssertionError(f"missing dimensions: {list(dims)}")
    receipt = make_capability_receipt(
        case_id="live-advisory-no-mutation",
        observed_model="test-model",
        observed_effort="medium",
        outcome="PASS",
        platform="codex",
    )
    if "receipt_id" not in receipt or "claim_hash" not in receipt:
        raise AssertionError("capability receipt missing required fields")
    records[0]["evidence_kind"] = "empirical"
    records[0]["platform"] = "codex"
    native_results = []
    for case in corpus["cases"]:
        if case.get("evaluator") == "live":
            for rec in records:
                rec["case_id"] = case["id"]
                native_results.append(produce_native_result(case, rec))
            break
    if native_results:
        nr = native_results[0]
        if "capability_receipt" not in nr:
            raise AssertionError("native evaluation missing capability receipt")
        if nr["evidence_kind"] != "empirical":
            raise AssertionError("native evaluation evidence_kind must be empirical")
    blank = make_blank_dimensions()
    expected_keys = {"completion", "requirement_coverage", "false_pass_rate", "owner_correction_rate",
                     "escaped_regression", "evidence_completeness", "rework_loops", "wall_time_seconds",
                     "input_tokens", "output_tokens", "subagent_input_tokens", "subagent_output_tokens",
                     "tool_calls", "context_sources", "subagent_lifecycle", "verification", "changed_files", "acceptance"}
    if set(blank) != expected_keys:
        raise AssertionError(f"blank dimensions mismatch: extra={set(blank) - expected_keys}, missing={expected_keys - set(blank)}")
    print("PASS: evaluations layer (controlled + native)")


def outcome_only() -> None:
    records = read_records([FIXTURES / "live-valid.jsonl"])
    tracker = OutcomeTracker()
    tracker.extend(records)
    agg = tracker.aggregate()
    if agg["total_records"] != 3:
        raise AssertionError(f"expected 3 records, got {agg['total_records']}")
    if tracker.records is records:
        records[0]["outcome"] = "FAIL"
        if tracker.records[0]["outcome"] == "FAIL":
            raise AssertionError("tracker returned live reference, not copy")
    markdown = tracker.render_markdown()
    if not markdown.startswith("# Outcome Report"):
        raise AssertionError("markdown header missing")
    print("PASS: outcome tracking")


def compat_only() -> None:
    records = read_records([FIXTURES / "live-valid.jsonl"])
    converted = [convert_v1_live_record(r) for r in records]
    if len(converted) != 3:
        raise AssertionError(f"expected 3 converted records, got {len(converted)}")
    for c in converted:
        if "dimensions" not in c or "completion" not in c.get("dimensions", {}):
            raise AssertionError("converted record missing dimensions")
        if c.get("eval_id", "").startswith("compat-") is False:
            raise AssertionError("converted record missing compat prefix")
    print("PASS: v1 compatibility reader")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--contracts-only", action="store_true")
    parser.add_argument("--routing-only", action="store_true")
    parser.add_argument("--live-only", action="store_true")
    parser.add_argument("--report-only", action="store_true")
    parser.add_argument("--conformance-only", action="store_true")
    parser.add_argument("--telemetry-only", action="store_true")
    parser.add_argument("--evaluations-only", action="store_true")
    parser.add_argument("--outcome-only", action="store_true")
    parser.add_argument("--compat-only", action="store_true")
    parser.add_argument("--output")
    parser.add_argument("--output-dir")
    args = parser.parse_args()
    selected = any((args.contracts_only, args.routing_only, args.live_only, args.report_only,
                    args.conformance_only, args.telemetry_only, args.evaluations_only,
                    args.outcome_only, args.compat_only))

    try:
        if args.contracts_only or not selected:
            contracts_only()
        routing_report = None
        if args.routing_only or not selected:
            routing_report = routing_only(args.output)
        if args.live_only or not selected:
            live_only()
        if args.report_only or not selected:
            report_only(args.output_dir, routing_report)
        if args.conformance_only or not selected:
            conformance_only()
        if args.telemetry_only or not selected:
            telemetry_only()
        if args.evaluations_only or not selected:
            evaluations_only()
        if args.outcome_only or not selected:
            outcome_only()
        if args.compat_only or not selected:
            compat_only()
    except (AssertionError, ContractError, OSError, ValueError) as exc:
        print(f"FAIL: {exc}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
