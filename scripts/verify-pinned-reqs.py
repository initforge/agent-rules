#!/usr/bin/env python3
"""Verify requirements.txt is fully pinned with hashes and CI workflow uses --require-hashes.

Exit non-zero if any requirement lacks a version pin, a hash, or if the
quality workflow's pip install step is missing --require-hashes.
"""
import re, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent
REQS = REPO / "requirements.txt"
WORKFLOW = REPO / ".github" / "workflows" / "quality.yml"

errors = []

# ── 1. Check requirements.txt ────────────────────────────────────────────
if not REQS.exists():
    errors.append(f"MISSING: {REQS}")
else:
    text = REQS.read_text()
    lines = text.splitlines()

    # strip comment / blank lines for active requirement scanning
    active = [l for l in lines if l.strip() and not l.strip().startswith("#")]

    # Merge continuation lines (backslash at end)
    merged = []
    buf = ""
    for l in active:
        if buf:
            buf += " " + l.strip()
        else:
            buf = l.strip()
        if not l.rstrip().endswith("\\"):
            merged.append(buf)
            buf = ""
    if buf:
        merged.append(buf)

    for i, line in enumerate(merged, 1):
        if line.startswith("#") or not line.strip():
            continue
        if "==" not in line.split(" --")[0]:
            errors.append(f"{REQS}:{i} — not pinned with == (found loose spec): {line}")
            continue
        # Check for at least one --hash=sha256:...
        if "--hash=sha256:" not in line:
            errors.append(f"{REQS}:{i} — missing hash: {line}")

# ── 2. Check workflow for --require-hashes ───────────────────────────────
if not WORKFLOW.exists():
    errors.append(f"MISSING: {WORKFLOW}")
else:
    wf_text = WORKFLOW.read_text()
    if "pip install" in wf_text and "--require-hashes" not in wf_text:
        errors.append(f"{WORKFLOW} — pip install step missing --require-hashes")

# ── Report ───────────────────────────────────────────────────────────────
for e in errors:
    print(f"FAIL: {e}", file=sys.stderr)

if errors:
    print(f"\n{len(errors)} violation(s) found", file=sys.stderr)
    sys.exit(1)

print("OK: all requirements pinned with hashes, workflow uses --require-hashes")
