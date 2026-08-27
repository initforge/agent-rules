#!/usr/bin/env python3
"""
Codex thin lifecycle hook (REQ-008).
Receives UserPromptSubmit from Codex, routes via canonical CLI transport
`agent-rules route-native --stdin`, and returns additionalContext.
Zero Python semantic routing; all decisions flow through the canonical router.
"""
from __future__ import annotations
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path


def find_agent_rules_cli() -> list[str]:
    """Locate agent-rules binary or node + packaged cli entry."""
    cli_bin = shutil.which("agent-rules") or shutil.which("agent-rules.cmd")
    if cli_bin:
        return [cli_bin, "route-native", "--stdin"]

    # Fallback to local checkout packages/cli if running in repo
    repo_cli = Path(__file__).resolve().parents[3] / "packages" / "cli" / "dist" / "index.js"
    if repo_cli.is_file():
        return [sys.executable if "node" in sys.executable else "node", str(repo_cli), "route-native", "--stdin"]

    return ["agent-rules", "route-native", "--stdin"]


def route_native_turn(prompt: str, session_id: str, cwd: str) -> dict | None:
    """Call canonical router via stdin/stdout transport."""
    cmd = find_agent_rules_cli()
    payload = json.dumps({
        "protocol_version": "2.0",
        "host": "codex",
        "session_id": session_id,
        "turn_id": f"turn-{os.getpid()}-{os.urandom(4).hex()}",
        "cwd": cwd,
        "prompt": prompt,
        "host_facts": {"client": "interactive"},
    })

    try:
        proc = subprocess.run(
            cmd,
            input=payload,
            capture_output=True,
            text=True,
            encoding="utf-8",
            timeout=10,
        )
        if proc.returncode == 0 and proc.stdout.strip():
            return json.loads(proc.stdout)
    except Exception as exc:
        sys.stderr.write(f"agent-rules codex hook error: {exc}\n")
    return None


def main() -> None:
    raw_input = ""
    if not sys.stdin.isatty():
        raw_input = sys.stdin.read().strip()

    payload: dict = {}
    if raw_input:
        try:
            payload = json.loads(raw_input)
        except Exception:
            payload = {}

    event = payload.get("event") or payload.get("type") or (sys.argv[1] if len(sys.argv) > 1 else "")
    prompt = payload.get("prompt") or payload.get("userMessage") or payload.get("message") or ""
    session_id = payload.get("session_id") or payload.get("sessionId") or f"codex-{os.getpid()}"
    cwd = payload.get("cwd") or payload.get("workspaceRoot") or os.getcwd()

    if prompt and (event in ("UserPromptSubmit", "prompt", "input", "") or not event):
        capsule = route_native_turn(str(prompt), str(session_id), str(cwd))
        if capsule and isinstance(capsule.get("context"), dict) and capsule["context"].get("rendered"):
            rendered = capsule["context"]["rendered"]
            print(json.dumps({"additionalContext": rendered, "decision": "allow"}))
            return

    print(json.dumps({"decision": "allow"}))


if __name__ == "__main__":
    main()
