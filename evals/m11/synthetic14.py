#!/usr/bin/env python3
"""M11-C10 case 3 — engine schedules 14 conflict-free synthetic tasks without wave barriers.

Re-runs the C2 dispatch-ready-set proof (AM-0019 §12) as an aggregate check:
the specific 14-task antichain test plus the full dispatch-ready-set suite.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from runner import emit, run_vitest, vitest_passed  # noqa: E402

C2 = "packages/engine/test/dispatch-ready-set.test.ts"


def main() -> int:
    # 1) The exact 14-task, no-wave-barrier test by name.
    exact = run_vitest(C2, test_filter="dispatches all 14 in one call across two logical waves")
    ok_exact, why_exact = vitest_passed(exact, expected_tests=1)

    # 2) Full C2 suite (14-task + conflicts + pool ceilings + waiting nonterminal).
    full = run_vitest(C2)
    ok_full, why_full = vitest_passed(full)

    print("M11-C10 case 3 — 14 conflict-free synthetic tasks, no wave barriers (C2 proof):")
    print(f"  exact 14-task test   : {'PASS' if ok_exact else 'FAIL'}")
    print(f"  full C2 suite        : {'PASS' if ok_full else 'FAIL'}")
    if not ok_exact:
        print(f"    {why_exact}")
    if not ok_full:
        print(f"    {why_full}")

    ok = ok_exact and ok_full
    emit("M11-C10-C3", "PASS" if ok else "FAIL", "synthetic-14-schedule", {
        "exact_14_task_test": "PASS" if ok_exact else "FAIL",
        "full_c2_suite": "PASS" if ok_full else "FAIL",
        "evidence": [C2],
    })
    return 0 if ok else 2


if __name__ == "__main__":
    sys.exit(main())
