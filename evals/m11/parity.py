#!/usr/bin/env python3
"""M11-C10 case 8 — seeded browser defects caught (8-case matrix).

Aggregates the C7 paired browser parity proof: the non-vision compiler must FAIL
each of the eight AM-0019 §12 seeded defects — missing control, hierarchy,
overflow, spacing, style, focus order, console and network errors. Both REF and
TGT pages are opened per case (two-context lease).
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from runner import emit, run_vitest, vitest_passed  # noqa: E402

C7 = "packages/engine/test/parity-runner.test.ts"
SEEDS = ["missing-control", "hierarchy", "overflow", "spacing", "style", "focus-order", "console-error", "network-error"]


def main() -> int:
    proc = run_vitest(C7, test_filter="seed", timeout_s=600)
    ok, why = vitest_passed(proc, expected_tests=8)

    # Verify each seed name actually appeared in the executed test titles.
    executed = proc.stdout if proc.returncode == 0 else ""
    seen = [s for s in SEEDS if s in executed]
    missing = [s for s in SEEDS if s not in executed]

    print("M11-C10 case 8 — 8 seeded browser defects caught by non-vision parity compiler:")
    for s in SEEDS:
        print(f"  {s:<16}: {'caught' if s in seen else 'NOT SEEN'}")
    print(f"  parity-runner seeded matrix: {'PASS' if ok else 'FAIL'}")
    if not ok:
        print(f"    {why}")
    if missing:
        print(f"    WARNING: seeds not executed by filter: {missing}")

    passed = ok and not missing
    emit("M11-C10-C8", "PASS" if passed else "FAIL", "seeded-defect-parity", {
        "seeds": {s: ("caught" if s in seen else "not-seen") for s in SEEDS},
        "evidence": [C7],
    })
    return 0 if passed else 2


if __name__ == "__main__":
    sys.exit(main())
