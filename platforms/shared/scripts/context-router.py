#!/usr/bin/env python3
"""Canonical graph-backed context routing for all platform adapters.

The router is deliberately small: it selects a primary capability and the
minimum supporting/context nodes. Platform hooks own event I/O and safety
advisories; this module owns route semantics.
"""
from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path
from typing import Any, Iterable


def normalize(value: str) -> str:
    return re.sub(r"\s+", " ", value.lower().replace("_", " ")).strip()


def phrase_hits(text: str, phrases: Iterable[str]) -> list[str]:
    normalized = normalize(text)
    return [phrase for phrase in phrases if normalize(str(phrase)) in normalized]


def has_5fedu_context(workspace_paths: Iterable[str | Path]) -> bool:
    """Only an installed project context activates 5fedu routing.

    The harness repository contains ``projects/5fedu`` as a template; that
    catalog must not make every harness task look like an application task.
    """
    for raw in workspace_paths:
        root = Path(raw)
        if (root / "context" / "5fedu" / "00-context-map.md").is_file():
            return True
        if (root / "context" / "5fedu").is_dir():
            return True
    return False


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
    for node in nodes:
        if not node.get("source_hash") or not isinstance(node.get("routing"), dict):
            raise ValueError(f"context graph node missing routing contract: {node.get('id')}")
    graph["graph_hash"] = hashlib.sha256(raw.encode("utf-8")).hexdigest()
    return graph


def _skill_nodes(graph: dict[str, Any]) -> list[dict[str, Any]]:
    return [node for node in graph["nodes"] if node.get("layer") == "skills"]


def _context_nodes(graph: dict[str, Any], prompt: str, signals: list[str], has_project: bool) -> list[str]:
    if not has_project:
        return []
    normalized = normalize(prompt)
    out: list[str] = []
    for node in graph["nodes"]:
        source = str(node.get("source", ""))
        routing = node.get("routing") or {}
        if node.get("layer") != "project" or node.get("project_scope") not in (None, "", "5fedu"):
            continue
        if "projects/5fedu/" not in source:
            continue
        if source.endswith("AGENTS.md") or source.endswith("00-context-map.md"):
            out.append(str(node["id"]))
            continue
        hits = phrase_hits(normalized, routing.get("signals", []))
        if hits:
            out.append(str(node["id"]))
    return sorted(set(out))


def route(prompt: str, workspace_paths: Iterable[str | Path], graph: dict[str, Any]) -> dict[str, Any]:
    text = normalize(prompt)
    project_present = has_5fedu_context(workspace_paths) or bool(
        phrase_hits(prompt, ["5fedu", "context/5fedu", "tah-app", "nostime"])
    )
    candidates: list[tuple[int, dict[str, Any], list[str]]] = []
    signals: list[str] = []
    for node in _skill_nodes(graph):
        routing = node.get("routing") or {}
        hits = phrase_hits(text, routing.get("signals", []))
        excluded = phrase_hits(text, routing.get("excludes", []))
        scope = str(routing.get("project_scope") or "")
        if scope == "5fedu" and not project_present and not phrase_hits(text, ["5fedu", "context/5fedu", "tah-app", "nostime"]):
            continue
        if excluded or (not hits and not routing.get("default")):
            continue
        if hits:
            signals.extend(hits)
        candidates.append((int(routing.get("priority", 0)), node, hits))

    candidates.sort(key=lambda item: (-item[0], str(item[1].get("id"))))
    if not candidates:
        defaults = [item for item in _skill_nodes(graph) if (item.get("routing") or {}).get("default")]
        if defaults and text:
            defaults.sort(key=lambda item: int((item.get("routing") or {}).get("priority", 0)), reverse=True)
            candidates = [(int((defaults[0].get("routing") or {}).get("priority", 0)), defaults[0], [])]

    primary = str(candidates[0][1]["id"]).removeprefix("skill:") if candidates else None
    stack: list[str] = []
    if primary:
        stack.append(primary)
        primary_routing = candidates[0][1].get("routing") or {}
        for supporting in primary_routing.get("supports", []):
            if any(str(item[1].get("id")) == f"skill:{supporting}" for item in candidates):
                stack.append(str(supporting))
        for _, node, _ in candidates[1:]:
            slug = str(node["id"]).removeprefix("skill:")
            if slug not in stack and slug in primary_routing.get("supports", []):
                stack.append(slug)

    if project_present and "5fedu" in text and "5fedu-project" not in stack:
        stack.append("5fedu-project")
    if "5fedu-module-parity" in stack and "5fedu-project" not in stack:
        stack.insert(0, "5fedu-project")

    return {
        "signals": sorted(set(signals)),
        "stack": stack,
        "primary": primary,
        "context_nodes": _context_nodes(graph, text, signals, project_present),
        "graph_version": graph.get("version"),
        "graph_hash": graph.get("graph_hash"),
    }


def route_signature(decision: dict[str, Any]) -> tuple[Any, ...]:
    return (
        decision.get("primary"),
        tuple(decision.get("stack") or []),
        tuple(decision.get("context_nodes") or []),
    )


__all__ = ["has_5fedu_context", "load_graph", "route", "route_signature"]
