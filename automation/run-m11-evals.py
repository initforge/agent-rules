#!/usr/bin/env python3
"""Run the M11-C10 eval suite (AM-0019 §12) and aggregate a per-case matrix.

Each evals/m11/*.py prints a machine-readable `M11REPORT:{...}` line; this runner
collects them and prints a PASS / FAIL / WAITING_EXTERNAL / HONEST_UNAVAILABLE
matrix. Statuses are taken from the reports, never from the subprocess exit code.

Exit codes:
  0  all required cases PASS
  1  any case FAIL or an eval errored
  2  no FAIL/ERROR but at least one case is WAITING_EXTERNAL or HONEST_UNAVAILABLE
     (run is amber — those cases are explicitly NOT green)

Usage: python3 automation/run-m11-evals.py [--offline] [--skip-build]
  --offline     do not invoke live model calls in live_concurrency
  --skip-build  do not rebuild packages/engine before the performance gate
"""
import json
import os
import re
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
EVALS = os.path.join(ROOT, "evals", "m11")

CASES = [
    ("coverage.py",        "M11-C10-C1",   "semantic coverage (31 effective requirements)"),
    ("synthetic14.py",     "M11-C10-C3",   "14 conflict-free tasks, no wave barriers"),
    ("conflicts.py",       "M11-C10-C5",   "conflict rejection (ownership/api/migration/lockfile/generated)"),
    ("resilience.py",      "M11-C10-C2",   "nonterminal continuation (missing tool/CI/provider/ambiguity)"),
    ("resilience.py",      "M11-C10-C6",   "crash/restart no duplicate or lost work"),
    ("resilience.py",      "M11-C10-C7",   "controlled multi-service fixture"),
    ("parity.py",          "M11-C10-C8",   "8 seeded browser defects caught"),
    ("performance.py",     "M11-C10-PERF", "performance gates (latency/utilization/idle/throughput/e2e)"),
    ("live_concurrency.py","M11-C10-C4",   "Tier-A >=8 concurrent native children"),
    ("attestation.py",     "M11-C10-C9",   "Tier-A + Grok attestation binds exact HEAD"),
    ("antigravity.py",     "M11-C10-C10",  "Antigravity out-of-ownership mutation rejected"),
    ("control_plane.py",   "M11-C10-C11",  "Control Plane browser/visual/a11y/console/network QA"),
    ("adversarial.py",     "M11-C10-C12",  "adversarial counterexample compiler (M11-R30)"),
]

# One script per eval file; resilience.py emits reports for C2/C6/C7 in one run.
SCRIPTS = {
    "coverage.py": ("coverage.py", ["M11-C10-C1"]),
    "synthetic14.py": ("synthetic14.py", ["M11-C10-C3"]),
    "conflicts.py": ("conflicts.py", ["M11-C10-C5"]),
    "resilience.py": ("resilience.py", ["M11-C10-C2", "M11-C10-C6", "M11-C10-C7"]),
    "parity.py": ("parity.py", ["M11-C10-C8"]),
    "performance.py": ("performance.py", ["M11-C10-PERF"]),
    "live_concurrency.py": ("live_concurrency.py", ["M11-C10-C4"]),
    "attestation.py": ("attestation.py", ["M11-C10-C9"]),
    "antigravity.py": ("antigravity.py", ["M11-C10-C10"]),
    "control_plane.py": ("control_plane.py", ["M11-C10-C11"]),
    "adversarial.py": ("adversarial.py", ["M11-C10-C12"]),
}

# Reports are single-line JSON; do not let dot match newlines (multi-report evals
# would otherwise be swallowed by one greedy span).
REPORT_RE = re.compile(r"M11REPORT:(\{.*\})", re.M)


def run_case(script: str, extra_args: list[str], timeout_s: int) -> tuple[int, list[dict]]:
    path = os.path.join(EVALS, script)
    if not os.path.exists(path):
        print(f"MISSING: {script}")
        return 1, []
    proc = subprocess.run(
        [sys.executable, path] + extra_args,
        cwd=ROOT, timeout=timeout_s, stdin=subprocess.DEVNULL,
        capture_output=True, text=True,
    )
    reports = []
    for m in REPORT_RE.finditer(proc.stdout):
        try:
            reports.append(json.loads(m.group(1)))
        except json.JSONDecodeError:
            pass
    if proc.stdout.strip():
        print(proc.stdout.rstrip())
    if proc.returncode not in (0, 2):
        tail = (proc.stdout + proc.stderr)[-400:]
        print(f"  (eval {script} exit={proc.returncode}) tail: {tail}")
    return proc.returncode, reports


def main() -> int:
    offline = "--offline" in sys.argv
    skip_build = "--skip-build" in sys.argv

    if not skip_build:
        print("== building packages/engine (performance gate measures the compiled artifact) ==")
        build = subprocess.run(["npm", "run", "build", "-w", "packages/engine"], cwd=ROOT, capture_output=True, text=True)
        if build.returncode != 0:
            print(f"engine build FAILED: {build.stdout[-400:]}{build.stderr[-400:]}")
            return 1
        print("engine build OK")

    extra = ["--offline"] if offline else []
    results: list[dict] = []
    label_by_case = {case_id: label for _, case_id, label in CASES}
    for script, case_ids in SCRIPTS.values():
        print(f"== {', '.join(case_ids)} ({script}) ==")
        started = time.monotonic()
        _, reports = run_case(script, extra, timeout_s=900)
        elapsed = time.monotonic() - started
        for case_id in case_ids:
            report = next((r for r in reports if r.get("case_id") == case_id), None)
            if report is None:
                report = {"case_id": case_id, "name": label_by_case.get(case_id, ""), "status": "ERROR", "detail": f"no M11REPORT from {script}"}
            report.setdefault("label", label_by_case.get(case_id, ""))
            report["elapsed_s"] = round(elapsed, 1)
            results.append(report)
        print(f"  -> {[r['status'] for r in reports if r.get('case_id') in case_ids] or 'ERROR'}")

    print("\n== M11-C10 per-case result matrix ==")
    counts = {"PASS": 0, "FAIL": 0, "WAITING_EXTERNAL": 0, "HONEST_UNAVAILABLE": 0, "ERROR": 0}
    for r in results:
        status = r.get("status")
        counts[status] = counts.get(status, 0) + 1
        print(f"  {r.get('case_id','?'):<14} {status:<18} {r.get('label','')} ({r.get('elapsed_s')}s)")
    print(f"\n  PASS={counts['PASS']} FAIL={counts['FAIL']} WAITING_EXTERNAL={counts['WAITING_EXTERNAL']} "
          f"HONEST_UNAVAILABLE={counts['HONEST_UNAVAILABLE']} ERROR={counts['ERROR']}")

    # Surface honest-unavailable metrics carried inside report details.
    unavailable = []

    def _scan_unavailable(prefix, value):
        if isinstance(value, dict):
            if value.get("status") == "HONEST_UNAVAILABLE":
                unavailable.append(f"{prefix}: {value.get('method', '')}")
                return
            for k, v in value.items():
                _scan_unavailable(f"{prefix}/{k}" if prefix else k, v)
        elif isinstance(value, list):
            for i, v in enumerate(value):
                _scan_unavailable(f"{prefix}[{i}]", v)

    for r in results:
        body = r.get("detail")
        if body is None:
            body = {k: v for k, v in r.items() if k not in ("case_id", "name", "label", "status", "elapsed_s")}
        _scan_unavailable(r.get("case_id", "?"), body)
    if unavailable:
        print("\n  HONEST_UNAVAILABLE items (not fabricated):")
        for u in unavailable:
            print(f"    - {u}")

    if counts.get("FAIL") or counts.get("ERROR"):
        sys.exit(1)
    if counts.get("WAITING_EXTERNAL") or counts.get("HONEST_UNAVAILABLE"):
        print("  AMBER: at least one case is WAITING_EXTERNAL/HONEST_UNAVAILABLE — that case is NOT green.")
        sys.exit(2)
    print("  All required M11-C10 cases PASS.")
    sys.exit(0)


if __name__ == "__main__":
    main()
