#!/usr/bin/env python3
"""Strict graph-router facade used by conformance tests and automation.

Host hooks may consume a copied runtime adapter, but route semantics come from
the compiled graph. This module deliberately has no legacy phrase-router mode.
"""
from __future__ import annotations

import importlib.util
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
load_graph = _router.load_graph
route_signature = _router.route_signature


def route(prompt: str, workspace_paths: Iterable[str | Path], graph: dict[str, Any]) -> dict[str, Any]:
    """Route from graph metadata only; no legacy/shadow fallback is available."""
    decision = dict(_router.route(prompt, workspace_paths, graph))
    decision["routing_mode"] = ROUTING_MODE
    decision["router_source"] = "context-graph"
    return decision
