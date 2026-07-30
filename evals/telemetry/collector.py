"""Telemetry event collector aligned with OpenTelemetry GenAI conventions.
Schema-driven self-validation — loads telemetry.schema.json and validates dynamically.
No hardcoded constant drift from canonical schema."""
from __future__ import annotations

import hashlib
import json
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
TELEMETRY_SCHEMA = ROOT / "evals" / "fixtures" / "telemetry.schema.json"

# ── Private: derived from canonical schema on first load ──
_SCHEMA: dict[str, Any] | None = None
_REQUIRED_FIELDS: frozenset[str] = frozenset()
_ALLOWED_ENUMS: dict[str, frozenset[str]] = {}
_SHA256_RE = re.compile(r"^[a-f0-9]{64}$")
_URI_RE = re.compile(r"^[a-z][a-z0-9+.-]*://")
_RFC3339_RE = re.compile(
    r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$"
)


def _load_schema() -> dict[str, Any]:
    """Load canonical schema once. Fail-closed: raises if missing or parse error."""
    global _SCHEMA, _REQUIRED_FIELDS, _ALLOWED_ENUMS
    if _SCHEMA is not None:
        return _SCHEMA
    path = TELEMETRY_SCHEMA
    if not path.is_file():
        raise RuntimeError(f"telemetry schema not found: {path}")
    try:
        _SCHEMA = json.loads(path.read_text(encoding="utf-8"))
        _REQUIRED_FIELDS = frozenset(_SCHEMA.get("required", []))
        props = _SCHEMA.get("properties", {})
        for key, prop in props.items():
            if "enum" in prop:
                _ALLOWED_ENUMS[key] = frozenset(prop["enum"])
        return _SCHEMA
    except Exception as exc:
        raise RuntimeError(f"telemetry schema parse failed: {exc}") from exc


def _resolve_ref(schema: dict[str, Any], root: dict[str, Any], visited: frozenset[str] | None = None) -> dict[str, Any]:
    """Resolve $ref against root schema. Handles #/path/segments and recursive refs safely."""
    if "$ref" not in schema:
        return schema
    ref = schema["$ref"]
    if not isinstance(ref, str) or not ref.startswith("#/"):
        return schema
    # Build visited key to prevent infinite recursion
    visited_key = ref
    if visited is not None and visited_key in visited:
        raise ValueError(f"circular $ref: {ref}")
    new_visited = (visited or frozenset()) | {visited_key}
    parts = ref[2:].split("/")
    resolved: Any = root
    for p in parts:
        if isinstance(resolved, dict) and p in resolved:
            resolved = resolved[p]
        else:
            return schema  # can't resolve, return original
    if not isinstance(resolved, dict):
        return schema
    # Resolve nested refs recursively
    return _resolve_ref(resolved, root, new_visited)


def _validate_against_schema(obj: dict[str, Any], schema: dict[str, Any], path: str = "", _visited: frozenset[str] | None = None) -> None:
    """Recursive JSON Schema subset validator — covers required, enum, type, pattern,
    minLength, minItems, const, $ref, additionalProperties, and nested objects/arrays.
    Drives fully from canonical schema file, not hardcoded constants."""
    if _SCHEMA is None:
        return
    # Resolve $ref before processing
    schema = _resolve_ref(schema, _SCHEMA, _visited)

    required = schema.get("required", [])
    for field in required:
        if field not in obj:
            raise ValueError(f"telemetry [{path}]: missing required field '{field}'")

    properties = schema.get("properties", {})
    additional = schema.get("additionalProperties", True)

    if not additional:
        for key in list(obj.keys()):
            if key not in properties:
                raise ValueError(f"telemetry [{path}]: unexpected field '{key}'")

    for key, value in list(obj.items()):
        if key not in properties:
            if not additional:
                raise ValueError(f"telemetry [{path}]: unexpected field '{key}'")
            continue
        prop = properties[key]
        _validate_field(key, value, prop, path, _visited)


def _validate_field(name: str, value: Any, prop: dict[str, Any], parent_path: str = "", _visited: frozenset[str] | None = None) -> None:
    """Validate a single field against its schema property."""
    cur_path = f"{parent_path}.{name}" if parent_path else name
    # Resolve $ref in the property itself (e.g., items.$ref)
    if _SCHEMA is not None:
        prop = _resolve_ref(prop, _SCHEMA, _visited)
    prop_type = prop.get("type")
    enum_vals = prop.get("enum")
    ref = prop.get("$ref")

    # Handle nullable: type could be ["string", "null"]
    types = [prop_type] if isinstance(prop_type, str) else (prop_type or [])

    # null check
    if value is None:
        if "null" in types:
            return
        raise ValueError(f"telemetry [{cur_path}]: expected {types}, got null")

    # enum
    if enum_vals is not None:
        if value not in enum_vals:
            raise ValueError(
                f"telemetry [{cur_path}]: '{value}' not in allowed values "
                f"{sorted(enum_vals)}"
            )
        return

    # const
    const_val = prop.get("const")
    if const_val is not None:
        if value != const_val:
            raise ValueError(f"telemetry [{cur_path}]: expected const {const_val}, got {value}")
        return

    # Type checks
    effective_type = types[0] if types else None
    if effective_type == "string":
        if not isinstance(value, str):
            raise ValueError(f"telemetry [{cur_path}]: expected string, got {type(value).__name__}")
        min_len = prop.get("minLength", 0)
        if len(value) < min_len:
            raise ValueError(f"telemetry [{cur_path}]: string length {len(value)} < {min_len}")
        pattern = prop.get("pattern")
        if pattern and not re.match(pattern, value):
            raise ValueError(f"telemetry [{cur_path}]: does not match pattern /{pattern}/")
        fmt = prop.get("format")
        if fmt == "date-time":
            if not _RFC3339_RE.match(value):
                raise ValueError(f"telemetry [{cur_path}]: '{value}' is not RFC 3339 format")
        if fmt == "uri":
            if not _URI_RE.match(value):
                raise ValueError(f"telemetry [{cur_path}]: '{value}' is not a valid URI")
    elif effective_type == "integer":
        if not isinstance(value, int) or isinstance(value, bool):
            raise ValueError(f"telemetry [{cur_path}]: expected integer, got {type(value).__name__}")
        minimum = prop.get("minimum")
        if minimum is not None and value < minimum:
            raise ValueError(f"telemetry [{cur_path}]: {value} < minimum {minimum}")
    elif effective_type == "object":
        if not isinstance(value, dict):
            raise ValueError(f"telemetry [{cur_path}]: expected object, got {type(value).__name__}")
        _validate_against_schema(value, prop, cur_path, _visited)
    elif effective_type == "array":
        if not isinstance(value, list):
            raise ValueError(f"telemetry [{cur_path}]: expected array, got {type(value).__name__}")
        min_items = prop.get("minItems")
        if min_items is not None and len(value) < min_items:
            raise ValueError(f"telemetry [{cur_path}]: array length {len(value)} < minItems {min_items}")
        items_schema = prop.get("items")
        if items_schema:
            for i, item in enumerate(value):
                _validate_field(f"{name}[{i}]", item, items_schema, parent_path, _visited)
    elif effective_type == "boolean":
        if not isinstance(value, bool):
            raise ValueError(f"telemetry [{cur_path}]: expected boolean, got {type(value).__name__}")


# ── Attestation-specific privacy: only strict allowed non-sensitive fields ──
ATTESTATION_ALLOWED_FIELDS = frozenset({
    "schema_version", "event_id", "event_type", "ts",
    "platform", "host_version", "model", "model_resolved",
    "model_observed", "effort", "role", "session_id",
    "repository_revision", "outcome", "attestation",
})
"""attestation.collected events are PRUNED (non-allowed fields silently stripped):
task, error, attributes, tools, context_sources, subagent, verification, duration_ms,
assignment_id, and any other non-listed fields are removed before validation.
Raw evidence keys (raw_*) are REJECTED (raise ValueError) — they must never appear."""


def _prune_attestation_event(event: dict[str, Any]) -> dict[str, Any]:
    """Strict allowlist: reject any field not in ATTESTATION_ALLOWED_FIELDS."""
    pruned = {}
    for key in ATTESTATION_ALLOWED_FIELDS:
        if key in event:
            pruned[key] = event[key]
    return pruned


def _reject_raw_in_attestation(event: dict[str, Any]) -> None:
    """Reject any raw/PII content in attestation events before storage."""
    if event.get("event_type") != "attestation.collected":
        return
    # Reject raw content at top level
    for key in list(event.keys()):
        kl = key.lower()
        if kl.startswith("raw") or kl in ("raw_evidence", "raw_probe", "raw_bytes"):
            raise ValueError(f"privacy: attestation must not contain raw field '{key}'")
    # Reject raw content in attestation payload
    att = event.get("attestation", {})
    if not isinstance(att, dict):
        return
    for k in list(att.keys()):
        kl = k.lower()
        if kl.startswith("raw") or kl in ("raw_evidence", "raw_probe", "raw_bytes"):
            raise ValueError(f"privacy: attestation must not contain raw field '{k}'")


def load_json(path: str | Path) -> Any:
    return json.loads(Path(path).read_text(encoding="utf-8-sig"))


def event_id(payload: dict[str, Any]) -> str:
    """SHA-256 of canonical JSON for deduplication."""
    body = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(body.encode("utf-8")).hexdigest()


class TelemetryCollector:
    """Collects telemetry events and writes to storage.
    Validates against canonical telemetry.schema.json on every record()."""

    def __init__(self, output_path: str | Path | None = None):
        self._events: list[dict[str, Any]] = []
        self._output_path = Path(output_path) if output_path else None
        # Preload schema
        _load_schema()

    def record(self, event: dict[str, Any]) -> str:
        """Validate against canonical schema, enforce attestation privacy, record.
        Returns event_id."""
        # Generate defaults before any processing
        event.setdefault("schema_version", 1)
        event.setdefault("ts", datetime.now(timezone.utc).isoformat())
        event.setdefault("event_id", event_id(event))

        # For attestation events: REJECT raw evidence FIRST (fail-closed before prune),
        # then prune non-allowed fields silently
        if event.get("event_type") == "attestation.collected":
            # V7: reject raw BEFORE prune — raw evidence must never be processed
            _reject_raw_in_attestation(event)
            event = _prune_attestation_event(event)
            # Recompute event_id AFTER pruning (binds only allowed fields)
            event["event_id"] = event_id(event)

        # V5: ALL events validate against full canonical schema (including attestation)
        schema = _load_schema()
        _validate_against_schema(event, schema)

        eid = event.get("event_id")
        event["event_id"] = eid
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
        attestation: dict[str, Any] | None = None,
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
        if attestation:
            ev["attestation"] = attestation
        ev["event_id"] = event_id(ev)
        return ev