"""Native evaluation through the actual platform adapter with capability receipts."""
from __future__ import annotations

import hashlib
import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from . import controlled as eval_ctl

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_CORPUS = ROOT / "automation" / "benchmarks" / "agent-quality-benchmark.json"


def load_json(path: str | Path) -> Any:
    return json.loads(Path(path).read_text(encoding="utf-8-sig"))


def make_capability_receipt(
    case_id: str,
    observed_model: str,
    observed_effort: str,
    outcome: str,
    platform: str,
    verifier: str = "native-eval",
) -> dict[str, Any]:
    """Create a verifiable capability receipt for a native evaluation run."""
    claim = f"{case_id}:{platform}:{observed_model}:{observed_effort}:{outcome}"
    receipt = {
        "receipt_id": f"cap-{uuid.uuid4().hex[:12]}",
        "case_id": case_id,
        "claim_hash": hashlib.sha256(claim.encode("utf-8")).hexdigest(),
        "observed_model": observed_model,
        "observed_effort": observed_effort,
        "outcome": outcome,
        "platform": platform,
        "captured_at": datetime.now(timezone.utc).isoformat(),
        "verifier": verifier,
    }
    return receipt


def produce_native_result(
    case: dict[str, Any],
    record: dict[str, Any],
    platform: str = "codex",
    fixed_sha: str = "unknown",
) -> dict[str, Any]:
    """Generate a native evaluation result with capability receipt from a live run record."""
    dims = eval_ctl.from_live_record(record, case)
    receipt = make_capability_receipt(
        case_id=case["id"],
        observed_model=record.get("model", "unknown"),
        observed_effort=record.get("reasoning_effort", "medium"),
        outcome=record.get("outcome", "NOT_RUN"),
        platform=platform,
    )
    result = {
        "schema_version": 1,
        "eval_id": f"native-{record.get('run_id', '?')}-{case['id']}",
        "case_id": case["id"],
        "variant": "native",
        "variant_label": "native-adapter",
        "repository_sha": fixed_sha,
        "task": case.get("prompt", ""),
        "environment": platform,
        "tools_available": record.get("tools_available", []),
        "model_snapshot": record.get("model_version") or record.get("model"),
        "dimensions": dims,
        "outcome": record.get("outcome", "NOT_RUN"),
        "evidence_kind": "empirical",
        "capability_receipt": receipt,
        "ts": datetime.now(timezone.utc).isoformat(),
        "duration_seconds": record.get("duration_seconds"),
    }
    eval_ctl.validate_schema(result, eval_ctl.EVAL_SCHEMA)
    return result


def evaluate_live_records_native(
    records: list[dict[str, Any]],
    corpus_path: str | Path = DEFAULT_CORPUS,
    fixed_sha: str = "unknown",
) -> list[dict[str, Any]]:
    """Convert empirical live records to native evaluation results with capability receipts.

    Synthetic fixtures are never reported as empirical native results.
    """
    corpus = load_json(corpus_path)
    live_cases = {c["id"]: c for c in corpus.get("cases", []) if c.get("evaluator") == "live"}
    results: list[dict[str, Any]] = []
    for rec in records:
        if rec.get("evidence_kind") != "empirical":
            continue
        case = live_cases.get(rec.get("case_id", ""))
        if not case:
            continue
        platform = rec.get("platform", "unknown")
        result = produce_native_result(case, rec, platform=platform, fixed_sha=fixed_sha)
        results.append(result)
    return results
