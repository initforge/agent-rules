#!/usr/bin/env python3
"""Executable conformance suite for graph-backed progressive routing."""
from __future__ import annotations

import importlib.util
import json
import shutil
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ROUTER_PATH = ROOT / "automation" / "context-graph-router.py"
spec = importlib.util.spec_from_file_location("context_graph_router", ROUTER_PATH)
if spec is None or spec.loader is None:
    raise ImportError(f"cannot load {ROUTER_PATH}")
router = importlib.util.module_from_spec(spec)
spec.loader.exec_module(router)
load_graph = router.load_graph
route = router.route
MANAGED_LEAN_PACK = {
    "README.md": "profiles/5fedu/README.md",
    "behaviors/activation.md": "profiles/5fedu/behaviors/activation.md",
    "rules/business.md": "profiles/5fedu/rules/business.md",
    "rules/data-auth.md": "profiles/5fedu/rules/data-auth.md",
    "rules/permissions.md": "profiles/5fedu/rules/permissions.md",
    "module-mapping/modules.yaml": "profiles/5fedu/module-mapping/modules.yaml",
    "module-mapping/ui-contracts.md": "profiles/5fedu/module-mapping/ui-contracts.md",
}


def fail(case_id: str, message: str) -> None:
    raise AssertionError(f"{case_id}: {message}")


def materialize_workspace_facts(workspace: Path, facts: dict) -> None:
    """Materialize only current structured facts; retired context maps are never fixtures."""
    pack = facts.get("lean_pack")
    if pack is None and facts.get("has_5fedu_context"):
        pack = "valid"
    context = workspace / "context" / "5fedu"
    if pack in {"valid", "hash-tampered"}:
        for relative, source in MANAGED_LEAN_PACK.items():
            target = context / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / source, target)
        if pack == "hash-tampered":
            (context / "behaviors" / "activation.md").write_text("tampered", encoding="utf-8")
    elif pack in {"empty", "partial", "junk-readme-or-legacy-map"}:
        context.mkdir(parents=True)
        if pack == "partial":
            shutil.copyfile(ROOT / MANAGED_LEAN_PACK["README.md"], context / "README.md")
        elif pack == "junk-readme-or-legacy-map":
            (context / "README.md").write_text("junk", encoding="utf-8")
    elif pack == "ancestor-symlink":
        outside = workspace / "outside-context"
        outside.mkdir()
        (workspace / "context").symlink_to(outside, target_is_directory=True)
    if facts.get("profile_marker"):
        marker = workspace / ".agent" / "profiles" / "5fedu.enabled"
        marker.parent.mkdir(parents=True)
        marker.write_bytes(b"")


def workspace_for(case: dict) -> tuple[tempfile.TemporaryDirectory[str], Path]:
    holder = tempfile.TemporaryDirectory(prefix="route-case-")
    workspace = Path(holder.name)
    kind = case["workspace"]["kind"]
    if kind == "harness":
        return holder, ROOT
    materialize_workspace_facts(workspace, case["workspace"])
    return holder, workspace


def main() -> int:
    graph = load_graph(ROOT / "generated" / "context-graph.json")
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
        if decision.get("routing_mode") != "strict" or decision.get("router_source") != "context-graph":
            fail(case_id, "router must default to strict graph routing")

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
        if "exact_context_nodes" in expected:
            exact_context = sorted(str(node_id) for node_id in expected["exact_context_nodes"])
            if sorted(context_nodes) != exact_context:
                fail(case_id, f"context nodes={sorted(context_nodes)!r}; expected {exact_context!r}")
        if case_id.startswith("5fedu-ui") and any("profiles/5fedu/projects/" in str(node_id) for node_id in context_nodes):
            fail(case_id, "legacy 5fedu projects node leaked into module-parity route")
        missing_intents = set(expected.get("intent_signals", [])) - intents
        if missing_intents:
            fail(case_id, f"missing intent signals: {sorted(missing_intents)}")
        for fact, expected_value in expected.get("workspace_facts", {}).items():
            if decision.get("workspace_facts", {}).get(fact) != expected_value:
                fail(case_id, f"workspace fact {fact} did not match {expected_value!r}")

    print(f"PASS: graph context router conformance ({len(seen)} cases)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
