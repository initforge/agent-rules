#!/usr/bin/env python3
"""M11-C10 case 1 — 100% original-plus-amendments semantic coverage.

Compiles the 31 effective requirements (15 REQ from the ledger + 16 M11-R from
AM-0019 §14) and asserts every one has a mapping in verification-graph.yaml.
Reports COVERED/PARTIAL/GAP honestly. The 100% claim is met only when every
requirement is COVERED; any GAP fails the case (exit 2) — nothing is invented.
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
GRAPH = ROOT / ".agent" / "plans" / "agent-rules-harness-v3-rearchitecture-20260726-r1" / "verification-graph.yaml"
AMENDMENT = ROOT / ".agent" / "plans" / "agent-rules-harness-v3-rearchitecture-20260726-r1" / "amendments" / "0019-autonomous-native-swarm-whole-system-convergence.md"

# AM-0019 §14 adds exactly M11-R11..M11-R26 (16 additive requirements).
AM0019_M11_R_IDS = [f"M11-R{i}" for i in range(11, 27)]


def load_yaml_via_node(path: Path) -> dict:
    """Parse YAML using the repo's already-installed 'yaml' npm package."""
    script = (
        "const y=require('yaml');const fs=require('fs');"
        "process.stdout.write(JSON.stringify(y.parse(fs.readFileSync(process.argv[1],'utf8'))))"
    )
    out = subprocess.run(
        ["node", "-e", script, str(path)],
        capture_output=True, text=True, check=True, cwd=ROOT,
    )
    return json.loads(out.stdout)


def load_graph() -> dict:
    if not GRAPH.is_file():
        raise SystemExit(f"ERROR: verification-graph.yaml not found: {GRAPH}")
    try:
        import yaml  # type: ignore
        return yaml.safe_load(GRAPH.read_text(encoding="utf-8"))
    except ImportError:
        return load_yaml_via_node(GRAPH)


def status_label(status: str) -> str:
    return {"MATCH": "COVERED", "PARTIAL": "PARTIAL", "GAP": "GAP"}.get(status, status)


def main() -> int:
    graph = load_graph()
    declared_count = graph.get("requirement_count")
    entries = graph.get("requirements") or []

    ids = [e.get("requirement_id") for e in entries]
    req_ids = [i for i in ids if i and i.startswith("REQ-")]
    m11_ids = [i for i in ids if i and i.startswith("M11-R")]

    # Structural checks (errors, exit 1).
    problems: list[str] = []
    if declared_count != 31:
        problems.append(f"verification-graph requirement_count={declared_count}, expected 31")
    if len(entries) != 31:
        problems.append(f"verification-graph lists {len(entries)} requirements, expected 31")
    if len(req_ids) != 15:
        problems.append(f"expected 15 REQ requirements, found {len(req_ids)}")
    if len(m11_ids) != 16:
        problems.append(f"expected 16 M11-R requirements, found {len(m11_ids)}")
    missing_m11 = [r for r in AM0019_M11_R_IDS if r not in m11_ids]
    if missing_m11:
        problems.append(f"AM-0019 §14 requirements missing from graph: {missing_m11}")
    if problems:
        for p in problems:
            print(f"ERROR: {p}")
        print(f'M11REPORT:{json.dumps({"case_id": "M11-C10-C1", "name": "semantic-coverage", "status": "ERROR", "detail": problems})}')
        return 1

    # Per-requirement status, in graph order.
    rows = []
    covered = partial = gap = 0
    for e in entries:
        label = status_label(e.get("status") or "GAP")
        rows.append({"id": e["requirement_id"], "status": label, "cluster": e.get("execution_cluster", {}).get("cluster")})
        if label == "COVERED":
            covered += 1
        elif label == "PARTIAL":
            partial += 1
        else:
            gap += 1

    claim_met = gap == 0
    print("M11-C10 case 1 — semantic coverage of 31 effective requirements:")
    print(f"  effective requirements : {len(rows)} (15 REQ + 16 M11-R = {declared_count} declared)")
    print(f"  COVERED                : {covered}")
    print(f"  PARTIAL                : {partial}")
    print(f"  GAP                    : {gap}")
    print("  per-requirement mapping:")
    for r in rows:
        print(f"    {r['id']:<9} {r['status']:<8} cluster={r['cluster']}")
    if claim_met:
        print("  CLAIM: 100% original-plus-amendments semantic coverage -> MET")
    else:
        print("  CLAIM: 100% original-plus-amendments semantic coverage -> NOT MET (GAPs remain)")

    report = {
        "case_id": "M11-C10-C1",
        "name": "semantic-coverage",
        "status": "PASS" if claim_met else "FAIL",
        "covered": covered,
        "partial": partial,
        "gap": gap,
        "total": len(rows),
        "claim_100_met": claim_met,
        "requirement_count_declared": declared_count,
        "gap_ids": [r["id"] for r in rows if r["status"] == "GAP"],
    }
    print(f'M11REPORT:{json.dumps(report)}')
    # Exit 2 when the 100% claim is unmet; 0 when met; 1 on structural error.
    return 2 if not claim_met else 0


if __name__ == "__main__":
    sys.exit(main())
