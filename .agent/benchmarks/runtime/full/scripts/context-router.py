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


SETUP_5FEDU_PHRASES = (
    "thiết lập 5fedu",
    "cài context dự án",
    "cài context cho project",
    "context/5fedu",
    "tah-app",
    "nostime",
)
NEGATED_5FEDU_PHRASES = (
    "không dùng 5fedu",
    "không sử dụng 5fedu",
    "without 5fedu",
    "not 5fedu",
)


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


def workspace_facts(workspace_paths: Iterable[str | Path]) -> dict[str, bool]:
    """Return stable facts used by scope predicates and fixture assertions."""
    roots = [Path(raw) for raw in workspace_paths]
    has_context = has_5fedu_context(roots)
    is_harness = any(
        (root / "rules" / "manifest.yaml").is_file()
        and (root / "automation" / "03-validate-context.ps1").is_file()
        for root in roots
    )
    return {"has_5fedu_context": has_context, "is_harness_repo": is_harness}


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
            if not isinstance(edges, list) or any(str(edge) not in skill_ids for edge in edges):
                raise ValueError(f"context graph node has invalid {edge_name}: {node.get('id')}")
    graph["graph_hash"] = hashlib.sha256(raw.encode("utf-8")).hexdigest()
    return graph


def _skill_nodes(graph: dict[str, Any]) -> list[dict[str, Any]]:
    return [node for node in graph["nodes"] if node.get("layer") == "skills"]


def _context_nodes(graph: dict[str, Any], prompt: str, has_project: bool) -> list[str]:
    if not has_project:
        return []
    normalized = normalize(prompt)
    out: list[str] = []
    for node in graph["nodes"]:
        source = str(node.get("source", ""))
        routing = node.get("routing") or {}
        if node.get("layer") != "project" or routing.get("project_scope") not in (None, "", "5fedu"):
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
    facts = workspace_facts(workspace_paths)
    setup_5fedu = bool(phrase_hits(text, SETUP_5FEDU_PHRASES))
    negated_5fedu = bool(phrase_hits(text, NEGATED_5FEDU_PHRASES))
    active_5fedu = facts["has_5fedu_context"]
    candidates: list[tuple[int, dict[str, Any], list[str]]] = []
    intent_signals: list[str] = []
    matched_phrases: list[str] = []
    for node in _skill_nodes(graph):
        routing = node.get("routing") or {}
        hits = phrase_hits(text, routing.get("signals", []))
        excluded = phrase_hits(text, routing.get("excludes", []))
        scope = str(routing.get("project_scope") or "")
        slug = str(node.get("id", "")).removeprefix("skill:")
        if scope == "5fedu":
            if slug == "5fedu-project":
                if not (active_5fedu or setup_5fedu) or negated_5fedu:
                    continue
            elif not active_5fedu or negated_5fedu:
                continue
        if excluded or not hits:
            continue
        if hits:
            matched_phrases.extend(hits)
            intent_signals.extend(routing.get("intent_signals") or [slug])
        candidates.append((int(routing.get("priority", 0)), node, hits))

    candidates.sort(key=lambda item: (-item[0], str(item[1].get("id"))))
    primary = str(candidates[0][1]["id"]).removeprefix("skill:") if candidates else None
    stack: list[str] = []
    required_skills: list[str] = []
    supporting_skills: list[str] = []
    if primary:
        stack.append(primary)
        primary_routing = candidates[0][1].get("routing") or {}
        known_skills = {str(item.get("id", "")).removeprefix("skill:") for item in _skill_nodes(graph)}
        for required in primary_routing.get("requires", []):
            if required in known_skills and required not in required_skills:
                required_skills.append(str(required))
        for supporting in primary_routing.get("supports", []):
            if any(str(item[1].get("id")) == f"skill:{supporting}" for item in candidates):
                supporting_skills.append(str(supporting))
        for _, node, _ in candidates[1:]:
            slug = str(node["id"]).removeprefix("skill:")
            if slug not in stack and slug not in supporting_skills and slug in primary_routing.get("supports", []):
                supporting_skills.append(slug)
        for dependency in [*required_skills, *supporting_skills]:
            if dependency not in stack:
                stack.append(dependency)

    return {
        "signals": sorted(set(intent_signals)),
        "intent_signals": sorted(set(intent_signals)),
        "matched_phrases": sorted(set(matched_phrases)),
        "stack": stack,
        "primary": primary,
        "required_skills": required_skills,
        "supporting_skills": supporting_skills,
        "context_nodes": _context_nodes(graph, text, active_5fedu),
        "workspace_facts": facts,
        "setup_5fedu": setup_5fedu,
        "negated_5fedu": negated_5fedu,
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
