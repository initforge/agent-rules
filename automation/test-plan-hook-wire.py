#!/usr/bin/env python3
"""Exercise adapter Stop wire formats; this is deliberately not native proof."""
from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SHARED = ROOT / "platforms" / "shared" / "scripts"
CODEX_GATE = Path(os.environ.get("PLAN_HOOK_CODEX_GATE") or ROOT / "platforms" / "codex" / "scripts" / "skill-gate.py")
GROK_GATE = Path(os.environ.get("PLAN_HOOK_GROK_GATE") or CODEX_GATE)
ANTIGRAVITY_GATE = Path(
    os.environ.get("PLAN_HOOK_ANTIGRAVITY_GATE")
    or ROOT / "platforms" / "antigravity" / "scripts" / "antigravity-skill-gate.py"
)
sys.path.insert(0, str(SHARED))

from plan_guard import load_json, write_admission  # noqa: E402


PROMPT = """Execute full plan
## Phase P1
1. implement first contract
2. verify first contract
## Phase P2
3. implement second contract
"""


def run(command: list[str], payload: dict, env: dict[str, str]) -> tuple[dict, str]:
    proc = subprocess.run(
        command,
        input=json.dumps(payload),
        text=True,
        encoding="utf-8",
        capture_output=True,
        env={**os.environ, **env},
        check=False,
    )
    if proc.returncode != 0:
        raise AssertionError(f"hook failed: {proc.stderr}")
    raw = proc.stdout.strip()
    return (json.loads(raw) if raw else {}), proc.stderr


def write_plan_state(workspace: Path, admission_id: str, status: str = "IN_PROGRESS") -> Path:
    path = workspace / ".agent" / "plans" / "wire-plan" / "state.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(
            {
                "plan_id": "wire-plan",
                "admission_id": admission_id,
                "execution_mode": "continuous",
                "status": status,
                "plan_hash": "plan-v1",
                "current_phase": None if status == "DONE" else "P1",
                "blockers": [],
                "phases": [
                    {"id": "P1", "status": "DONE" if status == "DONE" else "IN_PROGRESS", "contract_hash": "a"},
                    {"id": "P2", "status": "DONE" if status == "DONE" else "PENDING", "contract_hash": "b"},
                ],
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    return path


def main() -> int:
    with tempfile.TemporaryDirectory(prefix="plan-hook-wire-") as holder:
        base = Path(holder)
        workspace = base / "workspace"
        workspace.mkdir()
        codex_home = base / "codex-home"
        sid = "wire-session"
        codex_env = {
            "CODEX_HOME": str(codex_home),
            "CODEX_PROJECT_DIR": str(workspace),
            "AGENT_RULES_HOOK_PLATFORM": "codex",
            "AGENT_RULES_ADAPTER_PROBE": "1",
            "CODEX_HOOK_EVENT": "UserPromptSubmit",
        }
        prompt_out, _ = run(
            [sys.executable, str(CODEX_GATE)],
            {"hookEventName": "UserPromptSubmit", "session_id": sid, "cwd": str(workspace), "prompt": PROMPT},
            codex_env,
        )
        admission_path = workspace / ".agent" / "plans" / "_admission" / f"{sid}.json"
        if not admission_path.is_file() or "Mega-plan admitted" not in json.dumps(prompt_out):
            raise AssertionError(f"Codex admission wire failed: {prompt_out}")
        admission = load_json(admission_path)
        state_path = write_plan_state(workspace, admission["admission_id"])

        codex_env["CODEX_HOOK_EVENT"] = "Stop"
        codex_stop, _ = run(
            [sys.executable, str(CODEX_GATE)],
            {"hookEventName": "Stop", "session_id": sid, "cwd": str(workspace)},
            codex_env,
        )
        if codex_stop.get("continue") is not False or "next=P1" not in codex_stop.get("stopReason", ""):
            raise AssertionError(f"Codex Stop wire failed: {codex_stop}")

        grok_home = base / "grok-home"
        grok_env = {
            "GROK_HOME": str(grok_home),
            "GROK_WORKSPACE_ROOT": str(workspace),
            "AGENT_RULES_HOOK_PLATFORM": "grok",
            "GROK_HOOK_EVENT": "Stop",
        }
        grok_stop, _ = run(
            [sys.executable, str(GROK_GATE)],
            {"hookEventName": "Stop", "session_id": sid, "cwd": str(workspace)},
            grok_env,
        )
        if grok_stop.get("decision") != "continue":
            raise AssertionError(f"Grok Stop wire failed: {grok_stop}")

        antigravity_home = base / "antigravity-home"
        anti_env = {"GEMINI_CONFIG_HOME": str(antigravity_home), "GEMINI_SESSION_ID": sid, "AGENT_RULES_ADAPTER_PROBE": "1"}
        anti_stop, _ = run(
            [sys.executable, str(ANTIGRAVITY_GATE), "Stop"],
            {"conversationId": sid, "fullyIdle": True, "terminationReason": "model_stop", "workspacePaths": [str(workspace)]},
            anti_env,
        )
        if anti_stop.get("decision") != "continue":
            raise AssertionError(f"Antigravity Stop wire failed: {anti_stop}")

        done = json.loads(state_path.read_text(encoding="utf-8"))
        done["status"] = "DONE"
        done["current_phase"] = None
        for phase in done["phases"]:
            phase["status"] = "DONE"
        state_path.write_text(json.dumps(done, indent=2) + "\n", encoding="utf-8")
        codex_done, _ = run(
            [sys.executable, str(CODEX_GATE)],
            {"hookEventName": "Stop", "session_id": sid, "cwd": str(workspace)},
            codex_env,
        )
        if codex_done:
            raise AssertionError(f"Codex DONE should allow silently: {codex_done}")

    print("PASS: Codex/Grok/Antigravity plan Stop wire formats")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
