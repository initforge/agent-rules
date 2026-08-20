#!/usr/bin/env python3
"""M11-C10 cases 2, 6, 7 — nonterminal continuation, crash/restart idempotency,
and the controlled multi-service fixture.

Evidence:
  - C5 autopilot-m11 suite: WAITING_EXTERNAL/RETRY_SCHEDULED never terminate the
    run (case 2: missing tool / CI failure / provider outage / reversible
    ambiguity continue without owner questions); journal idempotent replay,
    stale-lease revocation without work loss, stop-hook checkpoint, terminal
    gate (case 6).
  - C6 topology-compiler public-ingress journey fixture: ingress/frontend/API/
    DB/queue/worker/migration/seed/async/restart/rollback/cleanup (case 7).
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from runner import emit, run_vitest, vitest_passed  # noqa: E402

C5 = "packages/engine/test/autopilot-m11.test.ts"
C6 = "packages/engine/test/topology-compiler.test.ts"


def main() -> int:
    c5 = run_vitest(C5)
    ok_c5, why_c5 = vitest_passed(c5)
    c6 = run_vitest(C6, test_filter="drives the fixture through the public port")
    ok_c6, why_c6 = vitest_passed(c6, expected_tests=1)

    print("M11-C10 case 2 — nonterminal continuation (missing tool/CI/provider/ambiguity):")
    print(f"  C5 autopilot nonterminal+idempotency suite: {'PASS' if ok_c5 else 'FAIL'}")
    if not ok_c5:
        print(f"    {why_c5}")
    print("M11-C10 case 6 — crash/replay/stale-lease/restart no duplicate/lost work:")
    print(f"  C5 journal idempotency + stale-lease + stop-hook: {'PASS' if ok_c5 else 'FAIL'}")
    print("M11-C10 case 7 — controlled multi-service fixture (C6 public-ingress journey):")
    print(f"  ingress/api/db/queue/worker/migration/seed/async/restart/rollback: {'PASS' if ok_c6 else 'FAIL'}")
    if not ok_c6:
        print(f"    {why_c6}")

    emit("M11-C10-C2", "PASS" if ok_c5 else "FAIL", "nonterminal-continuation", {
        "evidence": [C5], "covers": ["missing-tool", "CI-failure", "provider-outage", "reversible-ambiguity"],
    })
    emit("M11-C10-C6", "PASS" if ok_c5 else "FAIL", "crash-restart-no-dup-loss", {
        "evidence": [C5], "covers": ["crash-before-dispatch", "crash-after-dispatch", "lost-response",
                                     "stale-lease", "compact", "restart", "reboot", "duplicate-receipt"],
    })
    emit("M11-C10-C7", "PASS" if ok_c6 else "FAIL", "multi-service-fixture", {
        "evidence": [C6], "covers": ["ingress", "frontend", "api", "db", "queue", "worker",
                                     "migration", "seed", "async-journey", "restart", "rollback"],
    })
    return 0 if (ok_c5 and ok_c6) else 2


if __name__ == "__main__":
    sys.exit(main())
