#!/usr/bin/env python3
"""Adversarial, project-neutral admission fixtures for mega-plan intake."""
from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SHARED = ROOT / "platforms" / "shared" / "scripts"
sys.path.insert(0, str(SHARED))

from plan_guard import detect_mega_plan, load_json, write_admission  # noqa: E402


def main() -> int:
    one_pass = """Execute this one-pass completion on the same working tree; one continuous task, no handoff.

## P0 — intake
- lock scope
- inventory source
## P1 — implementation
1. implement boundary
2. verify boundary
## P2 — release
- run release checks
```md
## P99 ignored
- do not count this fenced item
```
"""
    detected = detect_mega_plan(one_pass)
    if not detected or detected["execution_mode"] != "continuous":
        raise AssertionError(f"one-pass intent was not continuous: {detected}")
    if len(detected["source_items"]) != 5:
        raise AssertionError(f"fenced or non-actionable text leaked into inventory: {detected}")

    huge = "Implement this plan\n## Task\n" + "\n".join(f"- item {i}" for i in range(1, 161))
    huge_detected = detect_mega_plan(huge)
    if not huge_detected or len(huge_detected["source_items"]) != 160:
        raise AssertionError("large source inventory was truncated or deduplicated")

    review = "Review this plan only\n## Task\n" + "\n".join(f"- item {i}" for i in range(1, 12))
    if detect_mega_plan(review) is not None:
        raise AssertionError("review-only prompt was admitted")

    with tempfile.TemporaryDirectory(prefix="plan-input-") as holder:
        root = Path(holder)
        admission = write_admission(root, "synthetic", one_pass)
        if not admission:
            raise AssertionError("admission artifact was not created")
        body = admission.read_text(encoding="utf-8")
        record = load_json(admission)
        if "password" in body.lower() or "first" in body.lower():
            raise AssertionError("admission artifact leaked raw source text")
        if record.get("execution_mode") != "continuous":
            raise AssertionError("admission lost continuous mode")
        if len(record.get("source_items", [])) != 5:
            raise AssertionError("admission source inventory mismatch")
        if record.get("source_set_hash") and len(record["source_set_hash"]) != 64:
            raise AssertionError("source_set_hash is not SHA-256")

    print("PASS: adversarial mega-plan admission fixtures")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
