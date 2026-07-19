#!/usr/bin/env python3
"""Executable conformance suite for graph-backed progressive routing."""
from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "platforms" / "shared" / "scripts"))

from context_router import load_graph, route  # noqa: E402


def fail(case_id: str, message: str) -> None:
    raise AssertionError(f"{case_id}: {message}")


def workspace_for(case: dict) -> tuple[tempfile.TemporaryDirectory[str], Path]:
    holder = tempfile.TemporaryDirectory(prefix="route-case-")
    workspace = Path(holder.name)
    kind = case["workspace"]["kind"]
    if kind == "harness":
        return holder, ROOT
    if case["workspace"].get("has_5fedu_context"):
        context = workspace / "context" / "5fedu"
        context.mkdir(parents=True)
        (context / "00-context-map.md").write_text("fixture", encoding="utf-8")
    return holder, workspace


def main() -> int:
    graph = load_graph(ROOT / "05-generated" / "context-graph.json")
    cases_doc = json.loads((ROOT / "automation" / "context-route-cases.json").read_text(encoding="utf-8-sig"))
    if int(cases_doc.get("version", 0)) < 3:
        raise AssertionError("route fixture contract must be version 3+")

    graph_ids = {str(node["id"]) for node in graph["nodes"]}
    seen: set[str] = set()
    for case in cases_doc["cases"]:
        case_id = str(case["id"])
        if case_id in seen:
            fail(case_id, "duplicate case id")
        seen.add(case_id)
        expected = case["expect"]
        for node_id in expected.get("context_nodes", []):
            if node_id not in graph_ids:
                fail(case_id, f"expected context node is absent from graph: {node_id}")

        holder, workspace = workspace_for(case)
        try:
            decision = route(case["prompt"], [workspace], graph)
        finally:
            holder.cleanup()

        if decision.get("primary") != expected.get("primary"):
            fail(case_id, f"primary={decision.get('primary')!r}; expected {expected.get('primary')!r}")

        required = set(decision.get("required_skills") or [])
        supporting = set(decision.get("supporting_skills") or [])
        stack = set(decision.get("stack") or [])
        context_nodes = set(decision.get("context_nodes") or [])
        intents = set(decision.get("intent_signals") or [])

        missing_required = set(expected.get("required_skills", [])) - required
        if missing_required:
            fail(case_id, f"missing required skills: {sorted(missing_required)}")
        missing_supporting = set(expected.get("supporting_skills", [])) - supporting
        if missing_supporting:
            fail(case_id, f"missing supporting skills: {sorted(missing_supporting)}")
        forbidden = set(expected.get("forbidden_skills", [])) & stack
        if forbidden:
            fail(case_id, f"forbidden skills loaded: {sorted(forbidden)}")
        missing_context = set(expected.get("context_nodes", [])) - context_nodes
        if missing_context:
            fail(case_id, f"missing context nodes: {sorted(missing_context)}")
        missing_intents = set(expected.get("intent_signals", [])) - intents
        if missing_intents:
            fail(case_id, f"missing intent signals: {sorted(missing_intents)}")

    print(f"PASS: graph context router conformance ({len(seen)} cases)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
