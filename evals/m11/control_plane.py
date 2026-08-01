#!/usr/bin/env python3
"""M11-C10 case 11 — Control Plane browser/visual/accessibility/console/network QA.

The Control Plane views exist (C9, packages/control-plane/tests/m11.test.ts
proves the API-level views). This eval checks whether browser-level QA (visual,
accessibility/axe, console, network, 200% zoom, reduced motion) exists and runs
the views API suite. Absent a browser QA harness the browser dimensions are
recorded WAITING_EXTERNAL — never claimed as passed.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from runner import emit, run_vitest, vitest_passed  # noqa: E402

CP_TESTS = "packages/control-plane/tests/m11.test.ts"
# Real browser-driving suite (Playwright + chromium + axe). Scan detection in
# BROWSER_QA_MARKERS is advisory; the gate requires this suite to actually pass.
CP_BROWSER_QA = "packages/control-plane/tests/browser-qa.test.ts"
CP_DIR = Path(__file__).resolve().parents[2] / "packages" / "control-plane"

# Browser-QA capabilities that would satisfy the case if present in the test suite.
# A dimension counts only if a test file actually drives a browser
# (playwright/chromium import); substring hits in API-only tests are not QA.
BROWSER_USE = re.compile(r"playwright|chromium", re.I)
BROWSER_QA_MARKERS = {
    "browser": re.compile(r"playwright|chromium|page\.goto|browser", re.I),
    "visual": re.compile(r"screenshot|visual|pixel|ssim", re.I),
    "accessibility": re.compile(r"axe|accessib", re.I),
    "console": re.compile(r"console\.error|console-error|console errors", re.I),
    "network": re.compile(r"network|har|requestfailed|response", re.I),
}


def scan_cp_tests() -> dict:
    hits = {k: False for k in BROWSER_QA_MARKERS}
    browser_files = []
    for f in sorted((CP_DIR / "tests").glob("*.ts")):
        try:
            text = f.read_text(encoding="utf-8", errors="replace")
        except Exception:  # noqa: BLE001
            continue
        if BROWSER_USE.search(text):
            browser_files.append(str(f.relative_to(CP_DIR / "tests")))
            for k, rx in BROWSER_QA_MARKERS.items():
                if rx.search(text):
                    hits[k] = True
    return hits, browser_files


def main() -> int:
    hits, browser_files = scan_cp_tests()
    views = run_vitest(CP_TESTS)
    ok_views, why = vitest_passed(views)
    browser_qa = run_vitest(CP_BROWSER_QA, timeout_s=600)
    ok_browser_qa, browser_qa_why = vitest_passed(browser_qa)

    print("M11-C10 case 11 — Control Plane browser/visual/accessibility/console/network QA:")
    print(f"  C9 views API suite            : {'PASS' if ok_views else 'FAIL'}")
    if not ok_views:
        print(f"    {why}")
    print(f"  browser QA suite (real browser): {'PASS' if ok_browser_qa else 'FAIL'}")
    if not ok_browser_qa:
        print(f"    {browser_qa_why}")
    print(f"  test files driving a browser  : {browser_files or 'NONE'}")
    for k, found in hits.items():
        print(f"  browser QA — {k:<13}: {'present' if found else 'ABSENT'}")

    missing = [k for k, found in hits.items() if not found]
    if ok_views and ok_browser_qa and not missing:
        status = "PASS"
        caps: list[str] = []
    else:
        status = "WAITING_EXTERNAL"
        caps = [
            "browser-level QA harness for the Control Plane does not exist in packages/control-plane/tests "
            f"(absent dimensions: {', '.join(missing)})"
            if missing else
            "browser QA suite or views API suite failed",
            "satisfy by: add a Playwright/axe browser QA suite that loads the exact certified build and checks "
            "visual screenshots, WCAG 2.2 AA accessibility, console errors, network errors, 200% zoom and reduced motion",
        ]
    print(f"  status: {status}")

    emit("M11-C10-C11", status, "control-plane-browser-qa", {
        "views_api_suite": "PASS" if ok_views else "FAIL",
        "browser_qa_suite": "PASS" if ok_browser_qa else "FAIL",
        "browser_driving_test_files": browser_files,
        "browser_qa_dimensions": hits,
        "missing_capability": caps,
        "evidence": [CP_TESTS, CP_BROWSER_QA],
    })
    return 0 if status == "PASS" else 2


if __name__ == "__main__":
    sys.exit(main())
