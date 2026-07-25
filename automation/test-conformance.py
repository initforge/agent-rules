#!/usr/bin/env python3
"""Run model-free conformance checks. Suitable for PR CI without model calls."""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from conformance.routing import run_all, ConformanceError


def main() -> int:
    try:
        report = run_all()
        if report["conformance"] != "PASS":
            routing = report.get("routing", {})
            failed = routing.get("failed", 0)
            issues = report.get("fixture_issues", [])
            print(f"CONFORMANCE: {report['conformance']}")
            if failed:
                print(f"  Routing failures: {failed}/{routing.get('total', 0)}")
            if issues:
                for issue in issues:
                    print(f"  Fixture issue: {issue}")
            return 1
        print(f"CONFORMANCE: PASS ({report['corpus']['total']} cases)")
        return 0
    except (ConformanceError, OSError, ValueError) as exc:
        print(f"CONFORMANCE: FAIL - {exc}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
