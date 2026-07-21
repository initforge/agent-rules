#!/usr/bin/env python3
"""Focused regression checks for plan state durability and generation fencing."""
from __future__ import annotations

import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "platforms" / "shared" / "scripts"))

from plan_guard import _write_state, load_json  # noqa: E402


def main() -> int:
    with tempfile.TemporaryDirectory(prefix="plan-state-") as holder:
        path = Path(holder) / ".agent" / "plans" / "demo" / "state.json"
        first = {"plan_id": "demo", "status": "IN_PROGRESS", "generation": 0}
        _write_state(path, first)
        if load_json(path).get("generation") != 1:
            raise AssertionError("first state write did not establish generation 1")
        stale = {"plan_id": "demo", "status": "DONE", "generation": 0}
        try:
            _write_state(path, stale)
        except RuntimeError:
            pass
        else:
            raise AssertionError("stale generation write was accepted")
        if load_json(path).get("status") != "IN_PROGRESS":
            raise AssertionError("stale writer overwrote durable state")
        if list(path.parent.glob("*.tmp")):
            raise AssertionError("atomic write left temporary files behind")
    print("PASS: plan state lock/atomic generation checks")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
