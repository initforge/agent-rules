#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
_spec = importlib.util.spec_from_file_location("external_receipt", ROOT / "automation" / "verify-external-receipt.py")
assert _spec and _spec.loader
_module = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_module)
validate = _module.validate


def main() -> int:
    base = {
        "provider": "github",
        "project": "org/repo",
        "run_id": "123",
        "target_ref": "main",
        "requested_sha": "abc",
        "observed_sha": "abc",
        "status": "completed",
        "conclusion": "success",
        "target_environment": "staging",
        "query_backed": True,
        "adapter_verified": True,
        "adapter": "github-actions",
        "source": "provider-api",
    }
    assert not validate(base, expected_sha="abc", environment="staging")
    assert "observed-sha-mismatch" in validate({**base, "observed_sha": "def"})
    deployment = {
        **base,
        "kind": "deployment",
        "deployment_id": "d1",
        "deployment_url": "https://staging.example",
        "deployed_sha": "abc",
        "smoke": [{"name": "health", "status": "PASS"}],
        "rollback_target": "previous",
        "rollback_evidence": "run-122",
    }
    assert not validate(deployment, expected_sha="abc", environment="staging")
    assert "smoke-proof-missing-or-failed" in validate({**deployment, "smoke": []})
    assert "smoke-proof-missing-or-failed" in validate({**deployment, "smoke": ["garbage"]})
    assert "query-not-backed" in validate({**base, "query_backed": False})
    print("PASS: external CI/deployment receipt contracts")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
