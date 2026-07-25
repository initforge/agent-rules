"""Telemetry event collector aligned with OpenTelemetry GenAI conventions."""
from __future__ import annotations

import hashlib
import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

try:
    import jsonschema
except ImportError:
    jsonschema = None


ROOT = Path(__file__).resolve().parents[2]
TELEMETRY_SCHEMA = ROOT / "automation" / "benchmarks" / "telemetry.schema.json"


def load_json(path: str | Path) -> Any:
    return json.loads(Path(path).read_text(encoding="utf-8-sig"))


def event_id(payload: dict[str, Any]) -> str:
    """SHA-256 of canonical JSON for deduplication."""
    body = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(body.encode("utf-8")).hexdigest()


class TelemetryCollector:
    """Collects telemetry events and writes to storage."""

    def __init__(self, output_path: str | Path | None = None):
        self._events: list[dict[str, Any]] = []
        self._output_path = Path(output_path) if output_path else None

    def record(self, event: dict[str, Any]) -> str:
        """Validate and record an event. Returns event_id."""
        eid = event.get("event_id") or event_id(event)
        event["event_id"] = eid
        event.setdefault("schema_version", 1)
        event.setdefault("ts", datetime.now(timezone.utc).isoformat())
        self._events.append(event)
        return eid

    def flush(self, path: str | Path | None = None) -> None:
        """Write all buffered events to JSONL."""
        target = Path(path) if path else self._output_path
        if target is None:
            return
        target.parent.mkdir(parents=True, exist_ok=True)
        body = "".join(json.dumps(e, ensure_ascii=False, sort_keys=True) + "\n" for e in self._events)
        target.write_text(body, encoding="utf-8")
        self._events.clear()

    @property
    def events(self) -> list[dict[str, Any]]:
        return list(self._events)

    @staticmethod
    def build_event(
        event_type: str,
        platform: str,
        model: str,
        effort: str | None,
        role: str,
        task: str,
        repository_revision: str,
        outcome: str,
        *,
        host_version: str = "unknown",
        model_resolved: str | None = None,
        model_observed: str | None = None,
        session_id: str | None = None,
        assignment_id: str | None = None,
        input_tokens: int | None = None,
        output_tokens: int | None = None,
        cached_input_tokens: int | None = None,
        uncached_input_tokens: int | None = None,
        reasoning_tokens: int | None = None,
        tools: list[dict[str, Any]] | None = None,
        context_sources: list[dict[str, Any]] | None = None,
        subagent_spawned: int | None = None,
        subagent_handoffs: int | None = None,
        subagent_input_tokens: int | None = None,
        subagent_output_tokens: int | None = None,
        tests_executed: int | None = None,
        tests_passed: int | None = None,
        tests_failed: int | None = None,
        duration_ms: int | None = None,
        error: str | None = None,
        attributes: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        ev = {
            "schema_version": 1,
            "event_type": event_type,
            "platform": platform,
            "host_version": host_version,
            "model": model,
            "effort": effort,
            "role": role,
            "task": task,
            "repository_revision": repository_revision,
            "outcome": outcome,
            "ts": datetime.now(timezone.utc).isoformat(),
        }
        ev["session_id"] = session_id or uuid.uuid4().hex[:16]
        if assignment_id:
            ev["assignment_id"] = assignment_id
        if model_resolved:
            ev["model_resolved"] = model_resolved
        if model_observed:
            ev["model_observed"] = model_observed
        gen_ai = {"system": platform}
        for name, val in [
            ("request.model", model),
            ("response.model", model_resolved),
            ("observed.model", model_observed),
            ("usage.input_tokens", input_tokens),
            ("usage.output_tokens", output_tokens),
            ("usage.cached_input_tokens", cached_input_tokens),
            ("usage.uncached_input_tokens", uncached_input_tokens),
            ("usage.reasoning_tokens", reasoning_tokens),
        ]:
            if val is not None:
                gen_ai[name] = val
        ev["gen_ai"] = gen_ai
        if tools:
            ev["tools"] = tools
        if context_sources:
            ev["context_sources"] = context_sources
            ev["context_estimated_size"] = sum(
                s.get("estimated_tokens", 0) or 0 for s in context_sources
            )
        subagent: dict[str, Any] = {}
        if subagent_spawned is not None:
            subagent["spawned"] = subagent_spawned
            subagent["handoffs"] = subagent_handoffs or 0
        if subagent_input_tokens is not None:
            subagent["input_tokens"] = subagent_input_tokens
        if subagent_output_tokens is not None:
            subagent["output_tokens"] = subagent_output_tokens
        if subagent:
            ev["subagent"] = subagent
        verification: dict[str, Any] = {}
        if tests_executed is not None:
            verification["tests_executed"] = tests_executed
            verification["tests_passed"] = tests_passed or 0
            verification["tests_failed"] = tests_failed or 0
        if verification:
            ev["verification"] = verification
        if duration_ms is not None:
            ev["duration_ms"] = duration_ms
        if error:
            ev["error"] = error
        if attributes:
            ev["attributes"] = attributes
        ev["event_id"] = event_id(ev)
        return ev
