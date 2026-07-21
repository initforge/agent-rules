#!/usr/bin/env python3
"""Provider-neutral validation for imported CI/deployment evidence.

The adapter validates identity and terminal proof only; it never stores raw
logs or credentials and it does not claim that an unqueried JSON blob came
from a provider. Provider adapters may enrich this normalized receipt first.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path


def validate(receipt: dict, *, expected_sha: str = "", environment: str = "") -> list[str]:
    errors: list[str] = []
    required = ("provider", "project", "run_id", "target_ref", "requested_sha", "observed_sha", "status", "conclusion", "target_environment")
    for key in required:
        if not str(receipt.get(key, "")).strip():
            errors.append(f"missing:{key}")
    # A receipt is admissible only when a provider adapter queried the
    # provider.  Self-authored JSON/stdout claims are never authoritative.
    if receipt.get("query_backed") is not True:
        errors.append("query-not-backed")
    if receipt.get("adapter_verified") is not True:
        errors.append("adapter-not-verified")
    for key in ("adapter", "source"):
        if not str(receipt.get(key, "")).strip():
            errors.append(f"missing:{key}")
    if receipt.get("status") not in {"completed", "complete"}:
        errors.append("status-not-terminal")
    if str(receipt.get("conclusion", "")).lower() not in {"success", "passed"}:
        errors.append("conclusion-not-success")
    requested = str(receipt.get("requested_sha", ""))
    observed = str(receipt.get("observed_sha", ""))
    if requested and observed and requested != observed:
        errors.append("observed-sha-mismatch")
    if expected_sha and requested != expected_sha:
        errors.append("requested-sha-mismatch")
    if environment and str(receipt.get("target_environment")) != environment:
        errors.append("environment-mismatch")
    if receipt.get("kind") == "deployment":
        for key in ("deployment_id", "deployment_url", "deployed_sha"):
            if not str(receipt.get(key, "")).strip():
                errors.append(f"missing:{key}")
        if receipt.get("deployed_sha") and receipt.get("deployed_sha") != requested:
            errors.append("deployed-sha-mismatch")
        smoke = receipt.get("smoke")
        if (
            not isinstance(smoke, list)
            or not smoke
            or any(not isinstance(item, dict) for item in smoke)
            or any(item.get("status") != "PASS" for item in smoke)
        ):
            errors.append("smoke-proof-missing-or-failed")
        if not str(receipt.get("rollback_target", "")).strip() or not str(receipt.get("rollback_evidence", "")).strip():
            errors.append("rollback-proof-missing")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("receipt", type=Path)
    parser.add_argument("--sha", default="")
    parser.add_argument("--environment", default="")
    args = parser.parse_args()
    value = json.loads(args.receipt.read_text(encoding="utf-8-sig"))
    if not isinstance(value, dict):
        print("EXTERNAL_EVIDENCE_FAIL: root must be an object")
        return 1
    errors = validate(value, expected_sha=args.sha, environment=args.environment)
    if errors:
        print("EXTERNAL_EVIDENCE_FAIL: " + ",".join(errors))
        return 1
    print("EXTERNAL_EVIDENCE_PASS: provider receipt identity/terminal proof valid")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
