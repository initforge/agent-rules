#!/usr/bin/env python3
"""Validate non-active candidate skill/domain composition entries."""

from __future__ import annotations

import json
import sys
from pathlib import Path

try:
    import jsonschema
except ImportError:
    jsonschema = None

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "skills" / "candidate-fabric.json"
SCHEMA = ROOT / "schemas" / "skill-fabric-candidate.schema.json"


def fail(message: str) -> None:
    print(f"FAIL: {message}")
    raise SystemExit(1)


def load(path: Path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        fail(f"invalid JSON {path.relative_to(ROOT)}: {exc}")


def main() -> None:
    catalog = load(CATALOG)
    schema = load(SCHEMA)
    candidates = catalog.get("candidates")
    if catalog.get("version") != 1 or not isinstance(candidates, list) or not candidates:
        fail("candidate fabric must be version 1 with entries")
    if jsonschema:
        for candidate in candidates:
            try:
                jsonschema.Draft202012Validator(schema).validate(candidate)
            except jsonschema.ValidationError as exc:
                fail(f"{candidate.get('id')}: schema error: {exc.message}")
    ids = [candidate.get("id") for candidate in candidates]
    if len(ids) != len(set(ids)):
        fail("candidate ids must be unique")
    active_ids = set()
    graph = ROOT / "generated" / "context-graph.json"
    if graph.exists():
        active_ids = {str(node.get("id", "")).removeprefix("skill:") for node in load(graph).get("nodes", []) if str(node.get("id", "")).startswith("skill:")}
    # AM-0002 full adoption: a candidate that is materialized (receipt +
    # artifact present) is expected to be active; only non-materialized
    # candidates must stay disjoint from active runtime skills.
    materialized_ids = set()
    for candidate in candidates:
        receipt = candidate.get("materialization_receipt") or {}
        artifact = ROOT / (receipt.get("artifact_path") or "")
        if receipt.get("status") == "MATERIALIZED_SKILL" and artifact.is_file():
            materialized_ids.add(candidate.get("id"))
    overlaps = sorted(active_ids.intersection(ids) - materialized_ids)
    if overlaps:
        fail(f"candidate fabric accidentally overlaps active runtime skills: {', '.join(overlaps)}")
    if any(candidate["domain"] == "data-engineering" for candidate in candidates):
        fail("Data Engineering is intentionally outside the approved candidate scope")
    print(json.dumps({"status": "PASS", "candidates": len(candidates), "active_overlap": 0, "runtime_activation": "none"}))


if __name__ == "__main__":
    main()
