#!/usr/bin/env python3
"""Strict graph-router facade used by conformance tests and automation.

Host hooks may consume a copied runtime adapter, but route semantics come from
the compiled graph. This module deliberately has no legacy phrase-router mode.
"""
from __future__ import annotations

import hashlib
import importlib.util
import json
from pathlib import Path
from typing import Any, Iterable

ROOT = Path(__file__).resolve().parents[1]
RUNTIME_ROUTER = ROOT / "platforms" / "shared" / "scripts" / "context_router.py"
ROUTING_MODE = "strict"


def _load_runtime_router() -> Any:
    spec = importlib.util.spec_from_file_location("agent_rules_graph_router", RUNTIME_ROUTER)
    if spec is None or spec.loader is None:
        raise ImportError(f"cannot load graph router: {RUNTIME_ROUTER}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


_router = _load_runtime_router()
has_5fedu_context = _router.has_5fedu_context
route_signature = _router.route_signature


def load_graph(path: str | Path) -> dict[str, Any]:
    graph_path = Path(path)
    raw = graph_path.read_text(encoding="utf-8-sig")
    graph = json.loads(raw)
    if int(graph.get("version", 0)) < 2:
        raise ValueError("context graph version must be >= 2")
    nodes = graph.get("nodes")
    if not isinstance(nodes, list) or not nodes:
        raise ValueError("context graph has no nodes")
    ids = [str(node.get("id", "")) for node in nodes]
    if any(not node_id for node_id in ids) or len(ids) != len(set(ids)):
        raise ValueError("context graph contains missing or duplicate node ids")
    skill_ids = {str(node_id).removeprefix("skill:") for node_id in ids if node_id.startswith("skill:")}
    for node in nodes:
        if not node.get("source_hash") or not isinstance(node.get("routing"), dict):
            raise ValueError(f"context graph node missing routing contract: {node.get('id')}")
        routing = node.get("routing") or {}
        for edge_name in ("requires", "supports"):
            edges = routing.get(edge_name) or []
            if not isinstance(edges, list):
                continue
            resolved = [str(e) for e in edges if not str(e).startswith("<")]
            if any(e not in skill_ids for e in resolved):
                raise ValueError(f"context graph node has invalid {edge_name}: {node.get('id')}")
    graph["graph_hash"] = hashlib.sha256(raw.encode("utf-8")).hexdigest()
    return graph


def route(prompt: str, workspace_paths: Iterable[str | Path], graph: dict[str, Any]) -> dict[str, Any]:
    """Route from graph metadata only; no legacy/shadow fallback is available."""
    decision = dict(_router.route(prompt, workspace_paths, graph))
    decision["routing_mode"] = ROUTING_MODE
    decision["router_source"] = "context-graph"
    return decision
