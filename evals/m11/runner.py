"""Shared helpers for M11-C10 eval scripts (vitest shell-outs + M11REPORT)."""
from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
NODE = shutil.which("node")


def run_vitest(*paths: str, test_filter: str | None = None, timeout_s: int = 300) -> subprocess.CompletedProcess:
    """Run vitest on the given test file paths from the repo root."""
    cmd = [NODE, str(ROOT / "node_modules" / "vitest" / "vitest.mjs"), "run", *paths]
    if test_filter:
        cmd += ["-t", test_filter]
    return subprocess.run(
        cmd, capture_output=True, text=True, cwd=ROOT, timeout=timeout_s,
    )


def vitest_passed(proc: subprocess.CompletedProcess, expected_tests: int | None = None) -> tuple[bool, str]:
    """Interpret a vitest run: PASS iff exit 0 and (optionally) test counts match."""
    if proc.returncode != 0:
        return False, f"vitest exit={proc.returncode}; tail: {proc.stdout[-500:]} {proc.stderr[-300:]}"
    if expected_tests is not None:
        import re
        m = re.search(r"Tests\s+(\d+) passed", proc.stdout)
        passed = int(m.group(1)) if m else 0
        if passed < expected_tests:
            return False, f"expected >= {expected_tests} passing tests, saw {passed}"
    return True, ""


def emit(case_id: str, status: str, name: str, detail: dict) -> None:
    print(f'M11REPORT:{json.dumps({"case_id": case_id, "name": name, "status": status, "detail": detail}, ensure_ascii=False)}')
