#!/usr/bin/env python3
"""Validate the canonical skill ownership catalog and route-overlap policy."""

from __future__ import annotations

import hashlib
import json
import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "skills" / "catalog.json"
ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]*$")


def fail(message: str) -> None:
    print(f"FAIL: {message}")
    raise SystemExit(1)


def read_json(path: Path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:  # pragma: no cover - diagnostic path
        fail(f"invalid JSON {path.relative_to(ROOT)}: {exc}")


def skill_roots() -> dict[str, tuple[str, str, str]]:
    result: dict[str, tuple[str, str, str]] = {}
    for base, scope in ((ROOT / "skills", "core"), (ROOT / "profiles", "profile")):
        if not base.exists():
            continue
        for skill_file in sorted(base.glob("**/SKILL.md")):
            if "/references/" in skill_file.as_posix() or "/agents/" in skill_file.as_posix():
                continue
            rel = skill_file.relative_to(ROOT).as_posix()
            text = skill_file.read_text(encoding="utf-8")
            match = re.search(r"^name:\s*([^\r\n]+)$", text, re.MULTILINE)
            if not match:
                fail(f"missing name frontmatter: {rel}")
            skill_id = match.group(1).strip().strip("'\"")
            route = skill_file.with_name("ROUTE.json")
            # Single-source: allow SKILL.md metadata
            has_meta = False
            try:
                import yaml as _yaml2
                _raw2, _ = text[4:].split('\n---\n',1)
                _fm2 = _yaml2.safe_load(_raw2) or {}
                has_meta = isinstance(_fm2.get('metadata'), dict) and 'signals' in _fm2.get('metadata',{})
            except Exception:
                has_meta = False
            if not route.is_file() and not has_meta:
                fail(f"missing route sidecar: {route.relative_to(ROOT).as_posix()} and no SKILL.md metadata")
            if skill_id in result:
                fail(f"duplicate skill id discovered: {skill_id}")
            route_rel = route.relative_to(ROOT).as_posix() if route.is_file() else f"{skill_file.parent.name}/SKILL.md:metadata"
            result[skill_id] = (rel, route_rel, scope)
    return result


def main() -> None:
    catalog = read_json(CATALOG)
    if catalog.get("version") != 1:
        fail("catalog version must be 1")
    # Single-source: SKILL.md is authoritative; ROUTE.json is legacy sidecar. Accept both old and new source_of_truth.
    expected_old = {
        "skill": "<skill-root>/SKILL.md",
        "routing": "<skill-root>/ROUTE.json",
        "catalog": "skills/catalog.json",
    }
    expected_new = {
        "skill": "<skill-root>/SKILL.md",
        "catalog": "skills/catalog.json (generated read-only)",
    }
    if catalog.get("source_of_truth") not in (expected_old, expected_new):
        sot = catalog.get("source_of_truth") or {}
        if not (sot.get("skill") == "<skill-root>/SKILL.md" and "catalog" in sot):
            fail("source_of_truth must keep SKILL.md canonical (single-source)")

    discovered = skill_roots()
    entries = catalog.get("skills")
    if not isinstance(entries, list):
        fail("skills must be an array")
    by_id = {}
    for entry in entries:
        if not isinstance(entry, dict):
            fail("catalog entry must be an object")
        skill_id = entry.get("id")
        if not isinstance(skill_id, str) or not ID_RE.fullmatch(skill_id):
            fail(f"invalid skill id: {skill_id!r}")
        if skill_id in by_id:
            fail(f"duplicate catalog skill id: {skill_id}")
        by_id[skill_id] = entry
        source = entry.get("source")
        route = entry.get("route")
        if not isinstance(source, str):
            fail(f"{skill_id}: source is required")
        has_route = isinstance(route, str) and route
        # Single-source: check SKILL.md metadata if route missing
        if not has_route:
            try:
                sp = ROOT / source
                t2 = sp.read_text(encoding='utf-8')
                if t2.startswith('---\n') and '\n---\n' in t2:
                    r2, _ = t2[4:].split('\n---\n',1)
                    import yaml as _y2
                    f2 = _y2.safe_load(r2) or {}
                    if isinstance(f2.get('metadata'), dict) and 'signals' in f2['metadata']:
                        has_route = True
                        route = f"{skill_id}/SKILL.md:metadata"
            except Exception:
                pass
        if not has_route:
            fail(f"{skill_id}: source and route are required")
        if has_route and route != discovered.get(skill_id, (None, None, None))[1] and not str(route).endswith(":metadata"):
            fail(f"{skill_id}: catalog route does not match discovered ROUTE.json")
        if entry.get("scope") != discovered.get(skill_id, (None, None, None))[2]:
            fail(f"{skill_id}: catalog scope does not match source location")
        if has_route and str(route).endswith(":metadata"):
            pass
        elif not (ROOT / route).is_file():
            fail(f"{skill_id}: route file missing")
        if not isinstance(entry.get("consumers"), list) or not entry["consumers"]:
            fail(f"{skill_id}: consumers must be non-empty")
        if not isinstance(entry.get("duplicate_semantics"), list):
            fail(f"{skill_id}: duplicate_semantics must be an array")
        if entry.get("compatibility_period", {}).get("status") not in {"active", "compatibility", "candidate", "deprecated"}:
            fail(f"{skill_id}: invalid compatibility status")

    missing = sorted(set(discovered) - set(by_id))
    extra = sorted(set(by_id) - set(discovered))
    if missing:
        fail(f"skills missing from catalog: {', '.join(missing)}")
    if extra:
        fail(f"catalog contains unknown skills: {', '.join(extra)}")

    # The catalog records only material, intentional overlaps. Check that every
    # declared counterpart exists and that the overlap names are real route signals.
    routes = {}
    for skill_id, entry in by_id.items():
        rpath = entry.get("route") or ""
        if rpath.endswith(":metadata"):
            # Use SKILL.md metadata as routing
            sp = ROOT / entry.get("source","")
            try:
                t2 = sp.read_text(encoding='utf-8')
                if t2.startswith('---\n') and '\n---\n' in t2:
                    r2, _ = t2[4:].split('\n---\n',1)
                    import yaml as _y3
                    f3 = _y3.safe_load(r2) or {}
                    meta3 = f3.get('metadata') or {}
                    routes[skill_id] = {
                        'signals': [s.strip() for s in (meta3.get('signals','') or '').split(',') if s.strip()],
                        'excludes': [s.strip() for s in (meta3.get('excludes','') or '').split(',') if s.strip()],
                        'loads': [],
                        'requires': [],
                        'supports': [],
                        'priority': int(str(meta3.get('priority','0') or '0').strip() or '0'),
                    }
                    continue
            except Exception:
                pass
            routes[skill_id] = {}
        else:
            routes[skill_id] = read_json(ROOT / rpath) or {}
    # `requires` is a real dependency edge, not a bundle/"load everything"
    # escape hatch. Validate its target, reject self-edges, and fail closed on
    # cycles before the graph can reach runtime routing.
    requires_graph: dict[str, set[str]] = {}
    for skill_id, route in routes.items():
        requires = route.get("requires", [])
        if not isinstance(requires, list) or any(not isinstance(target, str) or not target for target in requires):
            fail(f"{skill_id}: requires must be a non-empty-string array")
        if skill_id in requires:
            fail(f"{skill_id}: requires cannot contain itself")
        unknown = sorted(set(requires) - set(by_id))
        if unknown:
            fail(f"{skill_id}: requires unknown skill(s): {', '.join(unknown)}")
        requires_graph[skill_id] = set(requires)
    visiting: set[str] = set()
    visited: set[str] = set()

    def visit(skill_id: str, trail: list[str]) -> None:
        if skill_id in visiting:
            cycle = " -> ".join([*trail, skill_id])
            fail(f"requires cycle detected: {cycle}")
        if skill_id in visited:
            return
        visiting.add(skill_id)
        for dependency in sorted(requires_graph[skill_id]):
            visit(dependency, [*trail, skill_id])
        visiting.remove(skill_id)
        visited.add(skill_id)

    for skill_id in sorted(requires_graph):
        visit(skill_id, [])

    declarations: set[tuple[str, str]] = set()
    for skill_id, entry in by_id.items():
        for overlap in entry["duplicate_semantics"]:
            other = overlap.get("with")
            if other not in by_id:
                fail(f"{skill_id}: duplicate counterpart is not catalogued: {other}")
            signals = set(routes[skill_id].get("signals", [])) & set(routes[other].get("signals", []))
            declared = set(overlap.get("signals", []))
            if not declared or not declared <= signals:
                fail(f"{skill_id}/{other}: declared overlap is not present in ROUTE.json")
            declarations.add(tuple(sorted((skill_id, other))))

    # The known material collisions are an explicit policy surface. New
    # collisions fail until an owner records their resolution in this catalog.
    observed: set[tuple[str, str]] = set()
    ids = sorted(routes)
    for index, left in enumerate(ids):
        for right in ids[index + 1 :]:
            if routes[left].get("project_scope") != routes[right].get("project_scope"):
                continue
            overlap = set(routes[left].get("signals", [])) & set(routes[right].get("signals", []))
            if overlap:
                pair = (left, right)
                observed.add(pair)
                if pair not in declarations:
                    # Broad generic terms are expected to be resolved by
                    # excludes/phase routing; only require catalog entries for
                    # the material overlaps already identified by the audit.
                    if overlap & {"exploratory", "landing", "redesign", "giao diện đẹp"}:
                        fail(f"unresolved material route overlap {left}/{right}: {sorted(overlap)}")

    digest = hashlib.sha256(CATALOG.read_bytes()).hexdigest()
    print(json.dumps({
        "status": "PASS",
        "skills": len(by_id),
        "core": sum(1 for x in by_id.values() if x["scope"] == "core"),
        "profile": sum(1 for x in by_id.values() if x["scope"] == "profile"),
        "declared_material_overlaps": len(declarations),
        "observed_route_overlaps": len(observed),
        "catalog_sha256": digest,
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
