#!/usr/bin/env python3
"""
Grok pre-prompt thin hook (REQ-008).
Receives prompt payload from Grok host, routes via canonical CLI transport
`agent-rules route-native --stdin`, and returns injected context.
"""
from __future__ import annotations
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path


def find_agent_rules_cli() -> list[str]:
    cli_bin = shutil.which("agent-rules") or shutil.which("agent-rules.cmd")
    if cli_bin:
        return [cli_bin, "route-native", "--stdin"]

    repo_cli = Path(__file__).resolve().parents[3] / "packages" / "cli" / "dist" / "index.js"
    if repo_cli.is_file():
        return [sys.executable if "node" in sys.executable else "node", str(repo_cli), "route-native", "--stdin"]

    return ["agent-rules", "route-native", "--stdin"]


def main() -> None:
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except AttributeError:
        pass

    raw_input = ""
    if not sys.stdin.isatty():
        raw_input = sys.stdin.read().strip()

    payload: dict = {}
    if raw_input:
        try:
            payload = json.loads(raw_input)
        except Exception:
            payload = {}

    prompt = payload.get("prompt") or payload.get("userMessage") or payload.get("message") or ""
    session_id = payload.get("session_id") or payload.get("sessionId") or f"grok-{os.getpid()}"
    cwd = payload.get("cwd") or payload.get("workspaceRoot") or os.getcwd()

    if prompt:
        cmd = find_agent_rules_cli()
        req_data = json.dumps({
            "protocol_version": "2.0",
            "host": "grok",
            "session_id": str(session_id),
            "turn_id": f"turn-{os.getpid()}-{os.urandom(4).hex()}",
            "cwd": str(cwd),
            "prompt": str(prompt),
            "host_facts": {"client": "interactive"},
        })

        try:
            proc = subprocess.run(
                cmd,
                input=req_data,
                capture_output=True,
                text=True,
                encoding="utf-8",
                timeout=10,
            )
            if proc.returncode == 0 and proc.stdout.strip():
                capsule = json.loads(proc.stdout)
                rendered = capsule.get("context", {}).get("rendered", "")
                if rendered:
                    print(json.dumps({"additionalContext": rendered, "decision": "allow"}, ensure_ascii=False))
                    return
        except Exception as exc:
            sys.stderr.write(f"agent-rules grok hook error: {exc}\n")

    print(json.dumps({"decision": "allow"}))


if __name__ == "__main__":
    main()
