#!/usr/bin/env python3
"""
Antigravity PreInvocation thin hook (REQ-008).
Receives PreInvocation from Antigravity IDE, routes via canonical CLI transport
`agent-rules route-native --stdin`, and returns ephemeralMessage.
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

    event = (sys.argv[1] if len(sys.argv) > 1 else "").strip()
    raw_input = ""
    if not sys.stdin.isatty():
        raw_input = sys.stdin.read().strip()

    payload: dict = {}
    if raw_input:
        try:
            payload = json.loads(raw_input)
        except Exception:
            payload = {}

    if event == "PreInvocation" or not event:
        prompt = payload.get("prompt") or payload.get("userMessage") or payload.get("message") or ""
        session_id = payload.get("conversationId") or payload.get("session_id") or f"antigravity-{os.getpid()}"
        cwd = payload.get("workspaceRoot") or payload.get("cwd") or os.getcwd()

        if prompt:
            cmd = find_agent_rules_cli()
            req_data = json.dumps({
                "protocol_version": "2.0",
                "host": "antigravity",
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
                        out = {"injectSteps": [{"ephemeralMessage": rendered}]}
                        print(json.dumps(out, ensure_ascii=False))
                        return
            except Exception as exc:
                sys.stderr.write(f"agent-rules antigravity hook error: {exc}\n")

    print("{}")


if __name__ == "__main__":
    main()
