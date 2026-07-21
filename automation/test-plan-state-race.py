#!/usr/bin/env python3
"""Cross-process generation/atomic-write regression for the shared plan lock."""
from __future__ import annotations

import multiprocessing as mp
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "platforms" / "shared" / "scripts"))
from plan_guard import _write_state, load_json  # noqa: E402


def writer(path: str, result: "mp.Queue[str]") -> None:
    try:
        _write_state(Path(path), {"plan_id": "race", "status": "IN_PROGRESS", "generation": 0})
    except RuntimeError:
        result.put("stale")
    else:
        result.put("ok")


def main() -> int:
    ctx = mp.get_context("spawn")
    with tempfile.TemporaryDirectory(prefix="plan-race-") as holder:
        path = Path(holder) / ".agent" / "plans" / "race" / "state.json"
        queue = ctx.Queue()
        processes = [ctx.Process(target=writer, args=(str(path), queue)) for _ in range(2)]
        for process in processes:
            process.start()
        for process in processes:
            process.join(15)
            if process.exitcode != 0:
                raise AssertionError(f"writer exited {process.exitcode}")
        results = sorted(queue.get(timeout=2) for _ in processes)
        if results != ["ok", "stale"]:
            raise AssertionError(f"unexpected race outcomes: {results}")
        if load_json(path).get("generation") != 1:
            raise AssertionError("race left an invalid generation")
        if list(path.parent.glob("*.tmp")) or path.with_name("state.json.lock").exists():
            raise AssertionError("race left lock/temp artifacts")
    print("PASS: cross-process plan state race fencing")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
