#!/usr/bin/env python3
"""Claude Code UserPromptSubmit hook — inject agent-rules context as additionalContext.

Reads one JSON hook payload from stdin and writes the Claude Code hook contract
JSON to stdout. Missing or unreadable context fails open with `{}` so a broken
install never blocks a prompt.

Wire via settings-hooks.template.json (substitute __PYTHON__ / __CLAUDE_HOME__).
"""
from __future__ import annotations

import json
import os
import sys


def main() -> int:
    # Claude expects UTF-8 JSON; Windows Python may otherwise use cp1252.
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except AttributeError:
        pass
    try:
        json.load(sys.stdin)
    except (ValueError, OSError):
        pass  # payload is advisory; context delivery is the only job
    home = os.environ.get("CLAUDE_CONFIG_DIR") or os.path.expanduser("~/.claude")
    rule_file = os.path.join(home, "rules", "agent-rules-context.md")
    if not os.path.isfile(rule_file):
        sys.stdout.write("{}")
        return 0
    try:
        with open(rule_file, encoding="utf-8") as f:
            context = f.read()
    except OSError:
        sys.stdout.write("{}")
        return 0
    payload = {
        "hookSpecificOutput": {
            "hookEventName": "UserPromptSubmit",
            "additionalContext": context,
        }
    }
    sys.stdout.write(json.dumps(payload, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
