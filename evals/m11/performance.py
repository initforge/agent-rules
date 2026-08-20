#!/usr/bin/env python3
"""M11-C10 performance gates (AM-0019 §12) — wrapper around performance.ts.

The measurement itself runs in Node against the compiled engine artifact
(packages/engine/dist/dispatch-ready-set.js) so the numbers describe the shipped
artifact. `performance.ts` prints the human table and the M11REPORT line.
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from runner import emit  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "evals" / "m11" / "performance.ts"
REPORT_RE = re.compile(r"M11REPORT:(\{.*\})", re.S)


def main() -> int:
    if not SCRIPT.is_file():
        raise SystemExit(f"ERROR: performance.ts not found: {SCRIPT}")
    proc = subprocess.run(["node", str(SCRIPT)], capture_output=True, text=True, cwd=ROOT, timeout=180)
    print(proc.stdout)
    if proc.stderr:
        print(proc.stderr[:800])
    m = REPORT_RE.search(proc.stdout)
    if not m:
        print("ERROR: no M11REPORT line from performance.ts")
        emit("M11-C10-PERF", "ERROR", "performance-gates", {"method": "performance.ts emitted no report"})
        return 1
    report = json.loads(m.group(1))
    print(f'M11REPORT:{json.dumps(report)}')
    # exit 2 = a measured gate missed its target; 0 = all measured gates pass.
    return 0 if report.get("status") == "PASS" else 2


if __name__ == "__main__":
    sys.exit(main())
