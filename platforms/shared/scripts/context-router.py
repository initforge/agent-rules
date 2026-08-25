#!/usr/bin/env python3
"""Canonical graph-backed context routing for all platform adapters.

The router is deliberately small: it selects a primary capability and the
minimum supporting/context nodes. Platform hooks own event I/O and safety
advisories; this module owns route semantics.
"""
from __future__ import annotations

import hashlib
import json
import math
import re
import stat
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
PROFILE_MARKER = Path(".agent") / "profiles" / "5fedu.enabled"
# Installed files must be byte-identical to their unique canonical graph nodes.
# Keep this mapping local to the router: the graph remains the sole hash source.
LEAN_PACK_NODE_BINDINGS: dict[str, tuple[str, str]] = {
    "README.md": ("profile:5fedu:readme", "profiles/5fedu/README.md"),
    "behaviors/activation.md": ("profile:5fedu:behavior:activation", "profiles/5fedu/behaviors/activation.md"),
    "rules/business.md": ("profile:5fedu:rule:business", "profiles/5fedu/rules/business.md"),
    "rules/data-auth.md": ("profile:5fedu:rule:data-auth", "profiles/5fedu/rules/data-auth.md"),
    "rules/permissions.md": ("profile:5fedu:rule:permissions", "profiles/5fedu/rules/permissions.md"),
    "module-mapping/modules.yaml": ("profile:5fedu:module-mapping", "profiles/5fedu/module-mapping/modules.yaml"),
    "module-mapping/ui-contracts.md": ("profile:5fedu:ui-contracts", "profiles/5fedu/module-mapping/ui-contracts.md"),
}

# These are deliberately a small, explicit vocabulary.  The upstream pack is a
# pinned reference library, not a second skill registry: a broad "make it
# pretty" request must not load it, and a brief naming two directions must not
# arbitrarily choose one.
TASTE_DIRECTION_PATHS: dict[str, tuple[str, ...]] = {
    "brandkit/SKILL.md": ("brandkit",),
    "brutalist-skill/SKILL.md": ("brutalist", "brutalist-skill"),
    "minimalist-skill/SKILL.md": ("minimalist", "minimalist-skill"),
    "redesign-skill/SKILL.md": ("redesign", "redesign-skill"),
    "soft-skill/SKILL.md": ("soft-ui", "soft ui", "soft-skill"),
    "taste-skill/SKILL.md": ("high-end", "high end", "taste-skill"),
}
TASTE_REVIEW_PHRASES = (
    "taste review",
    "review taste",
    "ui-taste review",
    "review ui-taste",
    "đánh giá taste",
    "review thẩm mỹ",
    "đánh giá thẩm mỹ",
    "rà soát thẩm mỹ",
)


def normalize(value: str) -> str:
    return re.sub(r"\s+", " ", value.lower().replace("_", " ")).strip()


def phrase_hits(text: str, phrases: Iterable[str]) -> list[str]:
    normalized = normalize(text)
    matches: list[str] = []
    for phrase in phrases:
        candidate = normalize(str(phrase))
        if not candidate:
            continue
        if re.search(rf"(?<!\w){re.escape(candidate)}(?!\w)", normalized):
            matches.append(str(phrase))
    return matches


def _contained_workspace_path(root: Path, relative: Path) -> Path | None:
    """Resolve a workspace path only through non-link ancestors inside ``root``."""
    try:
        root_stat = root.lstat()
        if stat.S_ISLNK(root_stat.st_mode) or not stat.S_ISDIR(root_stat.st_mode):
            return None
        resolved_root = root.resolve(strict=True)
    except OSError:
        return None

    current = root
    for part in relative.parts:
        current /= part
        try:
            current_stat = current.lstat()
            if stat.S_ISLNK(current_stat.st_mode):
                return None
            resolved_current = current.resolve(strict=True)
            resolved_current.relative_to(resolved_root)
        except (OSError, ValueError):
            return None
    return current


def _read_workspace_regular_file(root: Path, relative: Path, *, nonempty: bool) -> bytes | None:
    """Read a contained regular file without accepting links, devices, or placeholders."""
    path = _contained_workspace_path(root, relative)
    if path is None:
        return None
    try:
        if not stat.S_ISREG(path.lstat().st_mode):
            return None
        content = path.read_bytes()
    except OSError:
        return None
    return content if content or not nonempty else None


def _canonical_graph_path() -> Path | None:
    """Find exactly one graph paired with this router installation, never a workspace graph."""
    module_path = Path(__file__).resolve()
    candidates = [module_path.parent.parent / "context-graph.json"]
    if len(module_path.parents) > 3:
        candidates.append(module_path.parents[3] / "generated" / "context-graph.json")
    found: list[Path] = []
    for candidate in candidates:
        try:
            if stat.S_ISREG(candidate.lstat().st_mode) and not candidate.is_symlink():
                resolved = candidate.resolve(strict=True)
                if resolved not in found:
                    found.append(resolved)
        except OSError:
            continue
    return found[0] if len(found) == 1 else None


def _canonical_lean_pack_hashes() -> dict[str, str] | None:
    """Read graph-bound hashes only when every installed file has one unique node."""
    graph_path = _canonical_graph_path()
    if graph_path is None:
        return None
    try:
        graph = json.loads(graph_path.read_text(encoding="utf-8-sig"))
        nodes = graph.get("nodes")
        if not isinstance(nodes, list):
            return None
    except (OSError, UnicodeError, json.JSONDecodeError):
        return None

    expected: dict[str, str] = {}
    for relative, (node_id, source) in LEAN_PACK_NODE_BINDINGS.items():
        id_matches = [node for node in nodes if isinstance(node, dict) and node.get("id") == node_id]
        source_matches = [node for node in nodes if isinstance(node, dict) and node.get("source") == source]
        if len(id_matches) != 1 or len(source_matches) != 1 or id_matches[0] is not source_matches[0]:
            return None
        source_hash = id_matches[0].get("source_hash")
        if not isinstance(source_hash, str) or not re.fullmatch(r"[0-9a-f]{64}", source_hash):
            return None
        expected[relative] = source_hash
    return expected


def has_enabled_5fedu_profile(workspace_paths: Iterable[str | Path]) -> bool:
    """Return whether an explicit, workspace-local 5fedu marker is present."""
    for raw in workspace_paths:
        root = Path(raw)
        if _read_workspace_regular_file(root, PROFILE_MARKER, nonempty=False) is not None:
            return True
    return False


def has_5fedu_context(workspace_paths: Iterable[str | Path]) -> bool:
    """Return whether a complete installed 5fedu lean pack is present.

    A directory name, legacy ``00-context-map.md``, or bytes that merely look
    like a managed file are not evidence. Every managed file must be contained
    under the workspace root, be a readable regular file, and match its unique
    canonical graph node's ``source_hash`` exactly.
    """
    expected_hashes = _canonical_lean_pack_hashes()
    if expected_hashes is None:
        return False
    for raw in workspace_paths:
        root = Path(raw)
        context_root = _contained_workspace_path(root, Path("context") / "5fedu")
        if context_root is None:
            continue
        try:
            if not stat.S_ISDIR(context_root.lstat().st_mode):
                continue
        except OSError:
            continue
        if all(
            (content := _read_workspace_regular_file(root, Path("context") / "5fedu" / relative, nonempty=True)) is not None
            and hashlib.sha256(content).hexdigest() == expected_hash
            for relative, expected_hash in expected_hashes.items()
        ):
            return True
    return False


def workspace_facts(workspace_paths: Iterable[str | Path]) -> dict[str, bool]:
    """Return stable facts used by scope predicates and fixture assertions."""
    roots = [Path(raw) for raw in workspace_paths]
    has_context = has_5fedu_context(roots)
    has_marker = has_enabled_5fedu_profile(roots)
    is_harness = any(
        (root / "rules" / "manifest.yaml").is_file()
        and (root / "automation" / "03-validate-context.ps1").is_file()
        for root in roots
    )
    return {
        "has_enabled_5fedu_profile": has_marker,
        "has_valid_5fedu_lean_pack": has_context,
        "has_5fedu_context": has_context,
        "is_5fedu_profile_active": has_marker or has_context,
        "is_harness_repo": is_harness,
    }


def _graph_aliases(nodes: Iterable[dict[str, Any]]) -> dict[str, set[str]]:
    """Match the canonical graph builder's exact load aliases."""
    aliases: dict[str, set[str]] = {}
    for node in nodes:
        node_id = str(node.get("id", ""))
        source = str(node.get("source", ""))
        candidates = [node_id, source, Path(source).stem if source else ""]
        if node_id.startswith("skill:"):
            candidates.append(node_id.removeprefix("skill:"))
        if source.startswith("profiles/") and "/skills/" in source:
            candidates.append("skills/" + source.split("/skills/", 1)[1])
        for alias in candidates:
            if alias:
                aliases.setdefault(alias, set()).add(node_id)
    return aliases


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
    aliases = _graph_aliases(nodes)
    for node in nodes:
        if not node.get("source_hash") or not isinstance(node.get("routing"), dict):
            raise ValueError(f"context graph node missing routing contract: {node.get('id')}")
        routing = node.get("routing") or {}
        for edge_name in ("requires", "supports"):
            edges = routing.get(edge_name) or []
            if not isinstance(edges, list) or any(str(edge) not in skill_ids for edge in edges):
                raise ValueError(f"context graph node has invalid {edge_name}: {node.get('id')}")
        loads = routing.get("loads") or []
        if not isinstance(loads, list):
            raise ValueError(f"context graph node has invalid loads: {node.get('id')}")
        for target in loads:
            matches = aliases.get(str(target), set())
            if len(matches) != 1:
                raise ValueError(
                    f"context graph node has unresolved or ambiguous load: {node.get('id')} -> {target}"
                )
    graph["graph_hash"] = hashlib.sha256(raw.encode("utf-8")).hexdigest()
    return graph


def _skill_nodes(graph: dict[str, Any]) -> list[dict[str, Any]]:
    return [node for node in graph["nodes"] if node.get("layer") == "skills"]


def _load_closure(graph: dict[str, Any], skill_stack: Iterable[str]) -> set[str]:
    """Resolve only graph-declared load edges for the selected skill stack."""
    by_id = {str(node.get("id", "")): node for node in graph["nodes"]}
    aliases = _graph_aliases(graph["nodes"])
    pending = [f"skill:{skill}" for skill in skill_stack]
    seen: set[str] = set()
    resolved: set[str] = set()
    while pending:
        node_id = pending.pop()
        if node_id in seen:
            continue
        seen.add(node_id)
        node = by_id.get(node_id)
        if not node:
            continue
        for target in (node.get("routing") or {}).get("loads", []):
            if not isinstance(target, str):
                continue
            matches = aliases.get(target, set())
            if len(matches) != 1:
                continue
            target_id = next(iter(matches))
            if target_id not in resolved:
                resolved.add(target_id)
                pending.append(target_id)
    return resolved


def _context_nodes(
    graph: dict[str, Any],
    prompt: str,
    has_project: bool,
    skill_stack: Iterable[str],
) -> list[str]:
    if not has_project:
        return []
    normalized = normalize(prompt)
    out: list[str] = []
    loaded = _load_closure(graph, skill_stack)
    for node in graph["nodes"]:
        source = str(node.get("source", ""))
        routing = node.get("routing") or {}
        node_id = str(node.get("id", ""))
        layer = node.get("layer")
        if node_id in loaded:
            out.append(node_id)
            continue
        if layer == "profile" and routing.get("project_scope") == "5fedu":
            if node_id == "profile:5fedu:readme":
                out.append(node_id)
                continue
            if phrase_hits(normalized, routing.get("signals", [])):
                out.append(node_id)
            continue
        # Keep project-node routing available for profiles that still own a
        # project template. The 5fedu template is deliberately excluded: its
        # canonical live context is the profile layer above.
        if layer != "project" or routing.get("project_scope") not in (None, "", "5fedu"):
            continue
        if "profiles/5fedu/projects/" in source:
            continue
        if source.endswith("AGENTS.md") or source.endswith("00-context-map.md"):
            out.append(node_id)
            continue
        hits = phrase_hits(normalized, routing.get("signals", []))
        if hits:
            out.append(node_id)
    return sorted(set(out))


def _is_safe_relative_path(value: object) -> bool:
    """Accept only portable, contained reference paths from the pinned lock."""
    if not isinstance(value, str) or not value or "\\" in value or value.startswith("/"):
        return False
    if re.match(r"^[A-Za-z]:", value):
        return False
    parts = value.split("/")
    return all(part not in ("", ".", "..") for part in parts)


def _taste_lock_candidates(workspace_paths: Iterable[str | Path]) -> list[tuple[Path, Path]]:
    """Find the co-located ui-taste lock without relying on a global runtime."""
    roots = [Path(raw).resolve() for raw in workspace_paths]
    module_path = Path(__file__).resolve()
    roots.extend(module_path.parents)
    candidates: list[tuple[Path, Path]] = []
    seen: set[Path] = set()
    for root in roots:
        lock = root / "skills" / "ui-taste" / "references" / "upstream-lock.json"
        if root not in seen and lock.is_file():
            candidates.append((root, lock))
            seen.add(root)
    return candidates


def _load_taste_reference(
    original_path: str,
    workspace_paths: Iterable[str | Path],
) -> dict[str, Any] | None:
    """Resolve exactly one original→packaged reference through the pinned lock.

    A discovered but invalid lock is not allowed to fall through to another
    installation: that could quietly bypass a workspace's integrity boundary.
    """
    if not _is_safe_relative_path(original_path):
        return None
    candidates = _taste_lock_candidates(workspace_paths)
    if not candidates:
        return None
    root, lock_path = candidates[0]
    try:
        lock = json.loads(lock_path.read_text(encoding="utf-8-sig"))
        packaged_paths = lock["content"]["packaged_paths"]
        locked_hashes = lock["content"]["files"]
        if not isinstance(packaged_paths, dict) or not isinstance(locked_hashes, dict):
            return None
        packaged_path = packaged_paths.get(original_path)
        expected_hash = locked_hashes.get(original_path)
        if not _is_safe_relative_path(packaged_path):
            return None
        if not isinstance(expected_hash, str) or not re.fullmatch(r"[0-9a-fA-F]{64}", expected_hash):
            return None
        upstream_root = (lock_path.parent / "upstream").resolve()
        reference_path = (upstream_root / packaged_path).resolve()
        try:
            reference_path.relative_to(upstream_root)
        except ValueError:
            return None
        if not reference_path.is_file():
            return None
        reference_bytes = reference_path.read_bytes()
        if hashlib.sha256(reference_bytes).hexdigest() != expected_hash.lower():
            return None
        relative_path = reference_path.relative_to(root).as_posix()
        reference_text = reference_bytes.decode("utf-8-sig")
        token_charge = math.ceil(len(reference_text) / 3.6)
    except (OSError, UnicodeError, ValueError, KeyError, TypeError):
        return None
    return {
        "original_path": original_path,
        "packaged_path": packaged_path,
        "path": relative_path,
        "token_charge": token_charge,
    }


def _selected_taste_reference(
    prompt: str,
    stack: Iterable[str],
    workspace_paths: Iterable[str | Path],
) -> dict[str, Any] | None:
    """Return a single explicitly named, lock-backed taste reference or none."""
    if "ui-taste" not in set(stack):
        return None
    selected = _matched_taste_directions(prompt)
    if len(selected) != 1:
        return None
    return _load_taste_reference(selected[0], workspace_paths)


def _matched_taste_directions(prompt: str) -> list[str]:
    """Return distinct original paths explicitly named by the brief."""
    return [
        original_path
        for original_path, phrases in TASTE_DIRECTION_PATHS.items()
        if phrase_hits(prompt, phrases)
    ]


def route(prompt: str, workspace_paths: Iterable[str | Path], graph: dict[str, Any]) -> dict[str, Any]:
    workspace_paths = tuple(workspace_paths)
    text = normalize(prompt)
    facts = workspace_facts(workspace_paths)
    setup_5fedu = bool(phrase_hits(text, SETUP_5FEDU_PHRASES))
    negated_5fedu = bool(phrase_hits(text, NEGATED_5FEDU_PHRASES))
    # Prompt text selects routes only after this fail-closed filesystem fact has
    # activated the profile. A setup phrase never creates profile activation.
    active_5fedu = facts["is_5fedu_profile_active"]
    candidates: list[tuple[int, dict[str, Any], list[str]]] = []
    intent_signals: list[str] = []
    matched_phrases: list[str] = []
    for node in _skill_nodes(graph):
        routing = node.get("routing") or {}
        hits = phrase_hits(text, routing.get("signals", []))
        excluded = phrase_hits(text, routing.get("excludes", []))
        scope = str(routing.get("project_scope") or "")
        slug = str(node.get("id", "")).removeprefix("skill:")
        if scope == "5fedu" and (not active_5fedu or negated_5fedu):
            continue
        if excluded or not hits:
            continue
        if hits:
            matched_phrases.extend(hits)
            intent_signals.extend(routing.get("intent_signals") or [slug])
        # An activated domain pack wins over a generic skill when both match.
        # This mirrors the kernel route and prevents a generic browser/QA
        # phrase from displacing a domain procedure. Generic skills remain
        # available through explicit supports/requirements.
        domain_bonus = 500 if scope == "5fedu" and active_5fedu else 0
        candidates.append((domain_bonus + int(routing.get("priority", 0)), node, hits))

    candidates.sort(key=lambda item: (-item[0], str(item[1].get("id"))))
    primary = str(candidates[0][1]["id"]).removeprefix("skill:") if candidates else None
    stack: list[str] = []
    required_skills: list[str] = []
    supporting_skills: list[str] = []
    known_skills = {str(item.get("id", "")).removeprefix("skill:") for item in _skill_nodes(graph)}
    if primary:
        stack.append(primary)
        primary_routing = candidates[0][1].get("routing") or {}
        node_by_slug = {str(item.get("id", "")).removeprefix("skill:"): item for item in _skill_nodes(graph)}
        for required in primary_routing.get("requires", []):
            if required in known_skills and required not in required_skills:
                required_skills.append(str(required))
        # Declared supports compose regardless of prompt match (REQ-109):
        # SKILL.md metadata owns the combo; the support node only needs to be
        # known and in scope, with its own excludes respected.
        for supporting in primary_routing.get("supports", []):
            node = node_by_slug.get(str(supporting))
            if node is None:
                continue
            routing = node.get("routing") or {}
            project_scope = routing.get("project_scope") or ""
            # Mirror the TypeScript router: a support is in scope when its
            # project_scope is empty or it matches the active 5fedu scope.
            if project_scope == "5fedu" and not active_5fedu:
                continue
            if routing.get("excludes") and any(phrase in text for phrase in routing["excludes"]):
                continue
            if supporting not in supporting_skills:
                supporting_skills.append(str(supporting))
        for dependency in [*required_skills, *supporting_skills]:
            if dependency not in stack:
                stack.append(dependency)

    taste_directions = _matched_taste_directions(prompt)
    explicit_taste_review = bool(phrase_hits(text, TASTE_REVIEW_PHRASES))
    taste_is_modifier = (
        len(taste_directions) == 1
        and "ui-taste" in known_skills
        and (
            primary == "frontend-architect"
            or (primary == "5fedu-module-parity" and explicit_taste_review)
        )
    )
    if taste_is_modifier and "ui-taste" not in stack:
        supporting_skills.append("ui-taste")
        stack.append("ui-taste")

    selected_reference = _selected_taste_reference(prompt, stack, workspace_paths)

    return {
        "signals": sorted(set(intent_signals)),
        "intent_signals": sorted(set(intent_signals)),
        "matched_phrases": sorted(set(matched_phrases)),
        "stack": stack,
        "primary": primary,
        "required_skills": required_skills,
        "supporting_skills": supporting_skills,
        "context_nodes": _context_nodes(graph, text, active_5fedu, stack),
        "selected_reference": selected_reference,
        "reference_token_charge": selected_reference["token_charge"] if selected_reference else 0,
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


__all__ = [
    "has_enabled_5fedu_profile",
    "has_5fedu_context",
    "load_graph",
    "route",
    "route_signature",
    "workspace_facts",
]
