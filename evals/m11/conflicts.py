#!/usr/bin/env python3
"""M11-C10 case 5 — ownership/API/schema/migration/lockfile/generated conflicts rejected.

Aggregates conflict-rejection proof:
  - C2 dispatch-ready-set suite: path, api-schema, lockfile, generated,
    browser-page lease conflicts (it.each matrix) + transitive conflicts.
  - evals/m11/aggregation.test.ts: migration, port, shared-data, explicit lease
    domains and path-containment ownership boundaries.
  - C3 worktree-train suite: ownership lease create/release cycle + second-lease
    rejection (ownership boundary).
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from runner import emit, run_vitest, vitest_passed  # noqa: E402

C2 = "packages/engine/test/dispatch-ready-set.test.ts"
AGG = "evals/m11/aggregation.test.ts"
C3 = "packages/engine/test/worktree-train.test.ts"


def main() -> int:
    results = {}
    c2 = run_vitest(C2)
    results["C2_conflict_matrix"] = vitest_passed(c2)
    agg = run_vitest(AGG)
    results["aggregation_extra_domains"] = vitest_passed(agg, expected_tests=6)
    c3 = run_vitest(C3)
    results["C3_ownership_lease"] = vitest_passed(c3)

    print("M11-C10 case 5 — conflict rejection across ownership/API/schema/migration/lockfile/generated:")
    for k, (ok, why) in results.items():
        print(f"  {k:<28}: {'PASS' if ok else 'FAIL'}")
        if not ok:
            print(f"    {why}")

    ok = all(o for o, _ in results.values())
    emit("M11-C10-C5", "PASS" if ok else "FAIL", "conflict-rejection", {
        "path_overlap": "PASS" if ok else "FAIL",   # C2 'path overlap' + aggregation ownership
        "api_schema_overlap": "PASS" if ok else "FAIL",
        "lockfile_overlap": "PASS" if ok else "FAIL",
        "generated_overlap": "PASS" if ok else "FAIL",
        "browser_lease_overlap": "PASS" if ok else "FAIL",
        "migration_overlap": "PASS" if ok else "FAIL",   # aggregation migrationKeys domain
        "ownership_boundary": "PASS" if ok else "FAIL",  # C2 path containment + C3 lease
        "evidence": [C2, AGG, C3],
    })
    return 0 if ok else 2


if __name__ == "__main__":
    sys.exit(main())
