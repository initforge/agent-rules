#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SHARED = ROOT / "platforms" / "shared" / "scripts"
sys.path.insert(0, str(SHARED))

from plan_guard import detect_mega_plan, evaluate_stop, load_json, text_hash, write_admission  # noqa: E402


def write_state(root: Path, value: dict, plan_id: str = "demo") -> Path:
    path = root / ".agent" / "plans" / plan_id / "state.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")
    return path


def main() -> int:
    small = "Implement typo fix\n- update one file"
    if detect_mega_plan(small) is not None:
        raise AssertionError("small task triggered admission")
    nine_items = "Implement this plan\n## Contract\n" + "\n".join(f"- action {index}" for index in range(1, 10))
    if not detect_mega_plan(nine_items) or len(detect_mega_plan(nine_items)["source_items"]) != 9:
        raise AssertionError("nine-item free-form plan was not admitted")
    full_vietnamese = "Làm hết kế hoạch\n## Task\n- việc một\n- việc hai\n- việc ba"
    if (detect_mega_plan(full_vietnamese) or {}).get("execution_mode") != "continuous":
        raise AssertionError("explicit Vietnamese full-run plan was not continuous")
    unicode_full = "Hãy thực thi một task liên tục, không handoff\n## Task\n- việc một\n- việc hai\n- việc ba"
    if (detect_mega_plan(unicode_full) or {}).get("execution_mode") != "continuous":
        raise AssertionError("UTF-8 Vietnamese full-run intent was not continuous")
    one_pass = "Implement one-pass completion\n## Task\n- a\n- b\n- c"
    if (detect_mega_plan(one_pass) or {}).get("execution_mode") != "continuous":
        raise AssertionError("one-pass completion intent was not continuous")
    range_mismatch = "Execute full plan\n# Phase 0-15\n" + "\n".join(
        f"## P{index}\n- work {index}" for index in range(12)
    )
    range_detected = detect_mega_plan(range_mismatch) or {}
    if range_detected.get("execution_mode") != "continuous" or not range_detected.get("structural_anomalies"):
        raise AssertionError("declared-vs-actual phase range anomaly was not recorded")
    repeated = detect_mega_plan("Implement full plan\n## Task\n- repeat\n- repeat\n- final") or {}
    if repeated.get("source_item_count") != 3 or not repeated.get("duplicate_source_hashes"):
        raise AssertionError("repeated source items were silently dropped")
    six_files = "Implement update for a.py b.py c.py d.py e.py f.py"
    if not detect_mega_plan(six_files):
        raise AssertionError("six-file execution was not admitted")
    review_only = "Review this plan\n## Contract\n" + "\n".join(f"- item {index}" for index in range(1, 10))
    if detect_mega_plan(review_only) is not None:
        raise AssertionError("plan review without execution intent was admitted")
    plan = """Execute full plan
## Phase P1
1. first change
2. second change
## Phase P2
3. third change
```text
## Phase ignored
4. ignored item
```
"""
    detected = detect_mega_plan(plan)
    if not detected or detected["execution_mode"] != "continuous" or len(detected["source_items"]) != 3:
        raise AssertionError(detected)
    with tempfile.TemporaryDirectory(prefix="plan-guard-") as holder:
        root = Path(holder)
        admission_path = write_admission(root, "session-1", plan)
        if not admission_path:
            raise AssertionError("admission was not written")
        admission = load_json(admission_path)
        body = admission_path.read_text(encoding="utf-8")
        if "first change" in body or len(admission["source_items"]) != 3:
            raise AssertionError("admission leaked source text or lost items")
        hook_state: dict = {}
        missing = evaluate_stop(root, "session-1", hook_state)
        if missing["action"] != "continue":
            raise AssertionError(missing)
        write_state(
            root,
            {
                "admission_id": "older-admission",
                "execution_mode": "continuous",
                "status": "IN_PROGRESS",
                "phases": [{"id": "OLD", "status": "IN_PROGRESS", "contract_hash": "old"}],
            },
        )
        mismatched = evaluate_stop(root, "session-1", {})
        if "no initialized PAF state" not in mismatched.get("reason", ""):
            raise AssertionError("new admission incorrectly attached to an older active state")
        state = {
            "plan_id": "demo",
            "admission_id": admission["admission_id"],
            "execution_mode": "continuous",
            "status": "IN_PROGRESS",
            "plan_hash": text_hash("plan-v1"),
            "current_phase": "P1",
            "blockers": [],
            "phases": [
                {"id": "P1", "status": "IN_PROGRESS", "contract_hash": "a"},
                {"id": "P2", "status": "PENDING", "contract_hash": "b"},
            ],
        }
        path = write_state(root, state)
        first = evaluate_stop(root, "session-1", hook_state)
        if first["action"] != "continue":
            raise AssertionError(first)

        # Exact per-session binding wins over unrelated open plans.
        other = dict(state)
        other["plan_id"] = "other"
        other["admission_id"] = "unrelated"
        write_state(root, other, "other")
        binding = root / ".agent" / "plans" / "_active" / "session-1.json"
        binding.parent.mkdir(parents=True, exist_ok=True)
        binding.write_text(json.dumps({"owner_session_id": "session-1", "plan_id": "demo", "state_path": str(path)}), encoding="utf-8")
        bound = evaluate_stop(root, "session-1", {})
        if bound["action"] != "continue" or "Multiple active" in bound.get("reason", ""):
            raise AssertionError("session binding did not isolate the active plan")
        state["execution_mode"] = "phase"
        write_state(root, state)
        if evaluate_stop(root, "session-1", {})["action"] != "allow":
            raise AssertionError("phase-by-phase mode was forced to continue")
        state["execution_mode"] = "continuous"
        write_state(root, state)
        state["phases"][0]["status"] = "DONE"
        state["current_phase"] = "P2"
        write_state(root, state)
        progressed = evaluate_stop(root, "session-1", hook_state)
        if progressed["action"] != "continue" or hook_state["plan_guard"]["no_progress_stops"] != 1:
            raise AssertionError(progressed)
        for _ in range(3):
            exhausted = evaluate_stop(root, "session-1", hook_state)
        if exhausted["action"] != "allow" or load_json(path).get("enforcement_status") != "ENFORCEMENT_EXHAUSTED":
            raise AssertionError(exhausted)
        state["enforcement_status"] = ""
        state["phases"] = [
            {"id": "P1", "status": "IN_PROGRESS", "contract_hash": "a"},
            {"id": "P2", "status": "PENDING", "contract_hash": "b"},
        ]
        state["current_phase"] = "P1"
        state["status"] = "BLOCKED"
        state["blockers"] = [{"phase": "P2", "reason": "credential missing", "evidence": "AUTH_TOKEN is absent"}]
        write_state(root, state)
        independent = evaluate_stop(root, "session-1", {})
        if independent["action"] != "continue" or "next=P1" not in independent.get("reason", ""):
            raise AssertionError("BLOCKED phase incorrectly stopped an independent open phase")
        state["status"] = "BLOCKED"
        state["blockers"] = [
            {"phase": "P1", "reason": "credential missing", "evidence": "AUTH_TOKEN is absent"},
            {"phase": "P2", "reason": "credential missing", "evidence": "AUTH_TOKEN is absent"},
        ]
        write_state(root, state)
        if evaluate_stop(root, "session-1", {})["action"] != "allow":
            raise AssertionError("fully phase-blocked plan was not allowed")
        state["blockers"] = [{"phase": "P2", "reason": "credential missing"}]
        write_state(root, state)
        if evaluate_stop(root, "session-1", {})["action"] != "continue":
            raise AssertionError("BLOCKED without evidence escaped enforcement")
        state["status"] = "DONE"
        state["blockers"] = []
        write_state(root, state)
        if evaluate_stop(root, "session-1", {})["action"] != "allow":
            raise AssertionError("DONE state was not allowed")
        path.write_text("{broken", encoding="utf-8")
        corrupt = evaluate_stop(root, "session-1", {})
        refreshed_admission = load_json(admission_path)
        if corrupt["action"] != "allow" or refreshed_admission.get("enforcement_status") != "ENFORCEMENT_EXHAUSTED":
            raise AssertionError("corrupt state did not fail-open with exhaustion marker")
        # A legacy progress/ledger file must not silently bypass plan tracking.
        legacy_root = root / "legacy-workspace"
        legacy = legacy_root / ".agent" / "ledger" / "legacy.md"
        legacy.parent.mkdir(parents=True, exist_ok=True)
        legacy.write_text("Status: IN_PROGRESS\n- [ ] legacy acceptance\n", encoding="utf-8")
        legacy_decision = evaluate_stop(legacy_root, "legacy-session", {})
        if legacy_decision["action"] != "continue" or "Legacy open plan artifacts" not in legacy_decision.get("reason", ""):
            raise AssertionError("legacy open ledger bypassed plan guard")
    print("PASS: mega-plan admission and Stop guard contracts")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
