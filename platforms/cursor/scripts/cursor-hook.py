#!/usr/bin/env python3
"""Cursor native hook receipt adapter; observational and fail-open."""
from __future__ import annotations
import hashlib, json, os, sys
from datetime import datetime, timezone
from pathlib import Path
HOME = Path(os.environ.get("CURSOR_HOME") or os.environ.get("HARNESS_RUNTIME_HOME") or Path.home() / ".cursor")
def telemetry(payload: dict, event: str) -> dict:
    actor = str(payload.get("actor") or payload.get("agent_role") or os.environ.get("AGENT_RULES_ACTOR") or "").lower()
    actor = actor if actor in {"main", "worker"} else "unknown"
    tool = str(payload.get("tool") or payload.get("toolName") or "unknown")
    outcome = "UNVERIFIED" if actor == "unknown" else ("VIOLATION" if actor == "main" and payload.get("policy_violation") else "ALLOW")
    return {"event": event, "session_id": payload.get("conversation_id") or payload.get("conversationId") or "unknown", "actor": actor, "assignment_id": str(payload.get("assignment_id") or payload.get("assignmentId") or "unknown"), "tool": tool, "tool_class": "domain_tool" if tool != "unknown" else "host_event", "timestamp": datetime.now(timezone.utc).isoformat(), "outcome": outcome}
def retain_telemetry(event: dict) -> tuple[dict, str]:
    record={"schema_version":1,"platform":"cursor",**event}
    event_id=hashlib.sha256(json.dumps(record, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    record["event_id"]=event_id
    ref=f"skill-state/telemetry-events.jsonl#{event_id}"
    path=HOME/"skill-state"/"telemetry-events.jsonl"; path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a",encoding="utf-8") as stream: stream.write(json.dumps(record,sort_keys=True)+"\n")
    return record, ref
def main() -> None:
    if os.environ.get("AGENT_RULES_ADAPTER_PROBE") == "1": print("{}"); return
    try:
        payload = json.loads(sys.stdin.read() or "{}")
        health = HOME / "skill-state" / "hook-health.json"
        current = json.loads(health.read_text(encoding="utf-8")) if health.exists() else {}
        event, ref=retain_telemetry(telemetry(payload, sys.argv[1] if len(sys.argv)>1 else "unknown"))
        current.update({"platform":"cursor", "status":"NATIVE_OBSERVED", "trust_state":"unattested", "native_receipt":{**event, "event_ref":ref, "script_hash":hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}, "latest_event_ref":ref})
        health.parent.mkdir(parents=True, exist_ok=True)
        health.write_text(json.dumps(current, indent=2) + "\n", encoding="utf-8")
    except Exception: pass
    print("{}")
if __name__ == "__main__": main()
