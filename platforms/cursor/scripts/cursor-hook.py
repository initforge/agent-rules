#!/usr/bin/env python3
"""Cursor native hook receipt adapter; observational and fail-open."""
from __future__ import annotations
import hashlib, json, os, sys
from datetime import datetime, timezone
from pathlib import Path
HOME = Path(os.environ.get("CURSOR_HOME") or os.environ.get("HARNESS_RUNTIME_HOME") or Path.home() / ".cursor")
def main() -> None:
    if os.environ.get("AGENT_RULES_ADAPTER_PROBE") == "1": print("{}"); return
    try:
        payload = json.loads(sys.stdin.read() or "{}")
        health = HOME / "skill-state" / "hook-health.json"
        current = json.loads(health.read_text(encoding="utf-8")) if health.exists() else {}
        current.update({"platform":"cursor", "status":"NATIVE_OBSERVED", "trust_state":"unattested", "native_receipt":{"event":sys.argv[1] if len(sys.argv)>1 else "unknown", "session_id":payload.get("conversation_id") or payload.get("conversationId") or "unknown", "at":datetime.now(timezone.utc).isoformat(), "script_hash":hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}})
        health.parent.mkdir(parents=True, exist_ok=True)
        health.write_text(json.dumps(current, indent=2) + "\n", encoding="utf-8")
    except Exception: pass
    print("{}")
if __name__ == "__main__": main()
