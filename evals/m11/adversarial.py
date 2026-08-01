#!/usr/bin/env python3
"""M11-C10 case 12 — adversarial counterexample compiler (AM-0020 §7, M11-R30).

Aggregates the M11-R30 proof:
  - the engine adversarial-compiler suite (generator coverage, runProbe
    PASS/FAIL/SKIPPED_INAPPLICABLE semantics, T2/T3 negative-probe gate);
  - the eval aggregation which reports per-domain coverage and FAILs when any
    probe generator is empty for a domain the plan requires.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from runner import emit, run_vitest, vitest_passed  # noqa: E402

ENGINE = "packages/engine/test/adversarial-compiler.test.ts"
EVAL = "evals/m11/adversarial-eval.test.ts"
# Section 7 subcategory probes per domain: 7 finance + 6 auth + 7 browser + 5 release.
EXPECTED_ENGINE_TESTS = 19
EXPECTED_EVAL_TESTS = 3
DOMAINS = ["finance_concurrency", "authorization_security", "browser_parity", "release"]


def main() -> int:
    engine = run_vitest(ENGINE)
    ok_engine, why_engine = vitest_passed(engine, expected_tests=EXPECTED_ENGINE_TESTS)
    ev = run_vitest(EVAL)
    ok_eval, why_eval = vitest_passed(ev, expected_tests=EXPECTED_EVAL_TESTS)

    # Per-domain coverage reported by the eval aggregation test.
    coverage = {d: "not-reported" for d in DOMAINS}
    for m in re.finditer(r"adversarial-coverage:\s*(\w+):\s*(\d+)", ev.stdout):
        coverage[m.group(1)] = m.group(2)

    print("M11-C10 case 12 — adversarial counterexample compiler (AM-0020 §7):")
    for d in DOMAINS:
        print(f"  {d:<24}: {coverage.get(d, 'NOT REPORTED')} probes")
    print(f"  engine adversarial suite ({ENGINE}):     {'PASS' if ok_engine else 'FAIL'}")
    if not ok_engine:
        print(f"    {why_engine}")
    print(f"  eval aggregation ({EVAL}):               {'PASS' if ok_eval else 'FAIL'}")
    if not ok_eval:
        print(f"    {why_eval}")

    empty = [d for d, n in coverage.items() if n == "not-reported" or n == "0"]
    passed = ok_engine and ok_eval and not empty
    emit("M11-C10-C12", "PASS" if passed else "FAIL", "adversarial-counterexample-compiler", {
        "per_domain_probes": coverage,
        "empty_required_domain_generators": empty,
        "engine_suite": "PASS" if ok_engine else "FAIL",
        "eval_aggregation": "PASS" if ok_eval else "FAIL",
        "evidence": [ENGINE, EVAL],
    })
    return 0 if passed else 2


if __name__ == "__main__":
    sys.exit(main())
