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


def contracts_only() -> None:
    corpus = load_json(DEFAULT_CORPUS)
    graph = load_json(DEFAULT_GRAPH)
    counts = validate_corpus(corpus, graph)
    if counts["total"] < 30:
        raise AssertionError("benchmark corpus is unexpectedly small")
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
                       "output_tokens": 10, "tool_calls": 3, "turn_count": 2, "tool_output_chars": 20})
    empirical_report = aggregate_quality_report(corpus, routing_report, empirical, trace)
    if empirical_report["recommendation"] != "INSUFFICIENT_EVIDENCE" or empirical_report["live"]["comparable_triplets"] != 1:
        raise AssertionError("small empirical sample was not recognized as insufficient")
    if empirical_report["live"]["by_variant"]["baseline"]["average_uncached_input_tokens"] != 40:
        raise AssertionError("token efficiency metrics were not aggregated")
    empirical[-1]["outcome"] = "FAIL"
    failed_report = aggregate_quality_report(corpus, routing_report, empirical, trace)
    if failed_report["recommendation"] != "INVESTIGATE":
        raise AssertionError("failed empirical evidence did not trigger INVESTIGATE")
    live_case_ids = [case["id"] for case in corpus["cases"] if case["evaluator"] == "live"][:6]
    sufficient = []
    for repetition in range(2):
        for case_id in live_case_ids:
            for record in live:
                item = copy.deepcopy(record)
                item["evidence_kind"] = "empirical"
                item["platform"] = "codex"
                item["run_id"] = f"threshold-{repetition}-{case_id}"
                item["case_id"] = case_id
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


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--contracts-only", action="store_true")
    parser.add_argument("--routing-only", action="store_true")
    parser.add_argument("--live-only", action="store_true")
    parser.add_argument("--report-only", action="store_true")
    parser.add_argument("--output")
    parser.add_argument("--output-dir")
    args = parser.parse_args()
    selected = any((args.contracts_only, args.routing_only, args.live_only, args.report_only))

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
    except (AssertionError, ContractError, OSError, ValueError) as exc:
        print(f"FAIL: {exc}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
