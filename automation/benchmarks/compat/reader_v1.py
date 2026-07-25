"""Compatibility reader for v1 benchmark reports.

Reads old-format reports and converts to the new multidimensional evaluation format.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


SUPPORTED_VERSIONS = {1}


def read_v1_report(path: str | Path) -> dict[str, Any]:
    """Read a v1 report and return it as-is."""
    data = json.loads(Path(path).read_text(encoding="utf-8-sig"))
    version = data.get("version", 1)
    if version not in SUPPORTED_VERSIONS:
        raise ValueError(f"unsupported report version: {version}")
    return data


def convert_v1_live_record(record: dict[str, Any]) -> dict[str, Any]:
    """Convert a v1 live result record to the new evaluation dimension format."""
    scores = record.get("scores", {})
    friction = record.get("friction", [])
    evidence = record.get("evidence", [])
    passing = [e for e in evidence if e.get("status") == "PASS"]
    dims = {
        "completion": {"value": record.get("outcome", "NOT_RUN").lower(), "evidence": record.get("notes", "")},
        "requirement_coverage": {"value": None, "covered": 0, "total": 0, "evidence": f"scores={scores}"},
        "false_pass_rate": {
            "value": 1.0 if record.get("outcome") == "PASS" and bool(record.get("owner_correction")) else 0.0,
            "count": 1 if record.get("owner_correction") else 0,
            "total": 1, "evidence": "",
        },
        "owner_correction_rate": {
            "value": 1.0 if bool(record.get("owner_correction")) else 0.0,
            "corrected": 1 if record.get("owner_correction") else 0,
            "total": 1, "evidence": "",
        },
        "escaped_regression": {
            "value": 1 if record.get("outcome") == "FAIL" and not bool(record.get("owner_correction")) else 0,
            "evidence": "",
        },
        "evidence_completeness": {
            "value": len(passing) / len(evidence) if evidence else None,
            "evidence": f"{len(passing)}/{len(evidence)} passing",
        },
        "rework_loops": {"value": len(friction), "evidence": "; ".join(friction) if friction else ""},
        "wall_time_seconds": {"value": record.get("duration_seconds"), "evidence": ""},
        "input_tokens": {
            "total": record.get("input_tokens"),
            "cached": record.get("cached_input_tokens"),
            "uncached": record.get("uncached_input_tokens"),
            "evidence": "",
        },
        "output_tokens": {
            "total": record.get("output_tokens"),
            "reasoning": record.get("reasoning_output_tokens"),
            "evidence": "",
        },
        "subagent_input_tokens": {
            "total": record.get("subagent_input_tokens"),
            "cached": record.get("subagent_cached_input_tokens"),
            "evidence": "",
        },
        "subagent_output_tokens": {
            "total": record.get("subagent_output_tokens"),
            "reasoning": record.get("subagent_reasoning_output_tokens"),
            "evidence": "",
        },
        "tool_calls": {"total": record.get("tool_calls", 0), "failures": 0, "retries": 0, "evidence": ""},
        "context_sources": {"count": 0, "estimated_size": None, "sources": [], "evidence": ""},
        "subagent_lifecycle": {"spawned": 0, "handoffs": 0, "evidence": ""},
        "verification": {
            "tests_executed": None, "tests_passed": None, "tests_failed": None,
            "evidence": f"{len(passing)} evidence items",
        },
        "changed_files": {"files": 0, "lines": 0, "evidence": ""},
        "acceptance": {"value": "unknown", "evidence": ""},
    }
    return {
        "schema_version": 1,
        "eval_id": f"compat-{record.get('run_id', '?')}-{record.get('case_id', '?')}-{record.get('variant', '?')}",
        "case_id": record.get("case_id", "?"),
        "variant": record.get("variant", "unknown"),
        "repository_sha": "unknown",
        "task": "",
        "environment": record.get("platform", "unknown"),
        "tools_available": record.get("tools_available", []),
        "model_snapshot": record.get("model_version") or record.get("model"),
        "dimensions": dims,
        "outcome": record.get("outcome", "NOT_RUN"),
        "evidence_kind": record.get("evidence_kind", "synthetic"),
        "ts": datetime.now(timezone.utc).isoformat(),
        "duration_seconds": record.get("duration_seconds"),
        "notes": f"converted from v1 live record (run_id={record.get('run_id', '?')})",
    }


def convert_v1_report(report: dict[str, Any]) -> dict[str, Any]:
    """Convert a full v1 quality report to the new format."""
    return {
        "schema_version": 1,
        "type": "converted_v1",
        "original_version": report.get("version", 1),
        "generated_at": report.get("generated_at", ""),
        "routing_summary": report.get("routing", {}),
        "live": {
            "total_records": report.get("live", {}).get("total_records", 0),
            "empirical_runs": report.get("live", {}).get("empirical_runs", 0),
            "recommendation": report.get("recommendation", ""),
            "by_variant": report.get("live", {}).get("by_variant", {}),
            "comparable_triplets": report.get("live", {}).get("comparable_triplets", 0),
            "comparable_cases": report.get("live", {}).get("comparable_cases", 0),
        },
        "trace_warnings": report.get("trace", {}).get("warnings", []),
        "friction": report.get("friction", []),
    }
