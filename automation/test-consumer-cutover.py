#!/usr/bin/env python3
"""Regression tests for the consumer cutover audit."""
from __future__ import annotations

import importlib.util
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "automation" / "audit-consumer-cutover.py"


def load_module():
    spec = importlib.util.spec_from_file_location("consumer_cutover", SCRIPT)
    if spec is None or spec.loader is None:
        raise AssertionError("cannot load consumer cutover audit")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main() -> int:
    module = load_module()
    report = module.audit(ROOT)
    assert report["schema"] == "harness/consumer-cutover-audit/v1"
    assert report["status"] == "CUTOVER_CLEAN_WITH_COMPATIBILITY_SURFACES", report
    assert report["legacyConsumers"] == [], report
    assert any(item["id"] == "LEGACY-WORK-LEDGER" for item in report["legacyOwners"]), report
    assert all(item["status"] == "COMPATIBILITY_FACADE" for item in report["compatibilityFacades"]), report
    assert report["terminal"] == "REQUIRES_DELETE_REVIEW"

    # A tiny synthetic tree proves that a marked facade is ignored while an
    # unmarked production import is surfaced as a cutover finding.
    with tempfile.TemporaryDirectory(prefix="consumer-cutover-") as temp:
        root = Path(temp)
        (root / "packages/kernel/src").mkdir(parents=True)
        (root / "packages/engine/src").mkdir(parents=True)
        (root / "packages/kernel/src/ledger.ts").write_text("export class WorkLedger {}\n", encoding="utf-8")
        (root / "packages/engine/src/ledger.ts").write_text(
            "// Compatibility facade delegating to canonical kernel\nexport * from '@initforge/agent-rules-kernel/ledger.js';\n",
            encoding="utf-8",
        )
        (root / "packages/engine/src/app.ts").write_text(
            "import { WorkLedger } from '@initforge/agent-rules-kernel/ledger.js';\n",
            encoding="utf-8",
        )
        synthetic = module.audit(root)
        assert synthetic["status"] == "REVIEW_REQUIRED", synthetic
        assert synthetic["legacyConsumers"][0]["consumer"] == "packages/engine/src/app.ts", synthetic

    print("consumer-cutover: PASS (canonical owners, explicit facades, legacy consumer detection)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
