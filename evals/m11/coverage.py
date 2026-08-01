#!/usr/bin/env python3
"""M11-C10 case 1 — 100% original-plus-amendments semantic coverage.

Compiles the 41 effective requirements (15 REQ from the ledger + 26 M11-R from
AM-0019 §14 and AM-0020 §14) and asserts every one has a mapping in verification-graph.yaml.
Reports COVERED/PARTIAL/GAP honestly. The 100% claim is met when every
requirement is COVERED or PARTIAL-with-evidence: a GAP fails the case (exit 2),
and a PARTIAL must carry tree evidence or an explicit reason (e.g.
WAITING_EXTERNAL), never a silent unmapped row. Nothing is invented.
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
# AM-0020 §14 adds M11-R27..M11-R36 (10 additional requirements).
AM0019_M11_R_IDS = [f"M11-R{i}" for i in range(11, 27)]
AM0020_M11_R_IDS = [f"M11-R{i}" for i in range(27, 37)]
ALL_M11_R_IDS = AM0019_M11_R_IDS + AM0020_M11_R_IDS

# Implemented but a named condition stays open (WAITING_EXTERNAL).
PARTIAL_WITH_REASON = {
    "M11-R22": "codex native runtime proof requires external codex runtime — WAITING_EXTERNAL",
}


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
    expected_total = 15 + len(ALL_M11_R_IDS)  # 15 REQ + 26 M11-R (11-36)
    if declared_count != expected_total:
        problems.append(f"verification-graph requirement_count={declared_count}, expected {expected_total}")
    if len(entries) != expected_total:
        problems.append(f"verification-graph lists {len(entries)} requirements, expected {expected_total}")
    if len(req_ids) != 15:
        problems.append(f"expected 15 REQ requirements, found {len(req_ids)}")
    if len(m11_ids) != len(ALL_M11_R_IDS):
        problems.append(f"expected {len(ALL_M11_R_IDS)} M11-R requirements (11-36), found {len(m11_ids)}")
    missing_m11 = [r for r in ALL_M11_R_IDS if r not in m11_ids]
    if missing_m11:
        problems.append(f"M11-R requirements missing from graph: {missing_m11}")
    if problems:
        for p in problems:
            print(f"ERROR: {p}")
        print(f'M11REPORT:{json.dumps({"case_id": "M11-C10-C1", "name": "semantic-coverage", "status": "ERROR", "detail": problems})}')
        return 1

    # Per-requirement status, in graph order.
    rows = []
    covered = partial = gap = 0
    partial_without_reason: list[str] = []
    for e in entries:
        label = status_label(e.get("status") or "GAP")
        row = {
            "id": e["requirement_id"],
            "status": label,
            "cluster": e.get("execution_cluster", {}).get("cluster"),
            "evidence_hashes": len((e.get("evidence_contract") or {}).get("hashes") or []),
            "notes": e.get("notes") or [],
        }
        rows.append(row)
        if label == "COVERED":
            covered += 1
        elif label == "PARTIAL":
            partial += 1
            # PARTIAL is acceptable only with evidence or an explicit reason.
            has_evidence = row["evidence_hashes"] > 0
            has_reason = bool(row["notes"]) or row["id"] in PARTIAL_WITH_REASON
            if not (has_evidence or has_reason):
                partial_without_reason.append(row["id"])
        else:
            gap += 1

    # 100% claim: no GAP, and every PARTIAL is backed by evidence or a reason.
    claim_met = gap == 0 and not partial_without_reason
    print("M11-C10 case 1 — semantic coverage of 41 effective requirements:")
    print(f"  effective requirements : {len(rows)} (15 REQ + 26 M11-R = {declared_count} declared)")
    print(f"  COVERED                : {covered}")
    print(f"  PARTIAL                : {partial}")
    print(f"  GAP                    : {gap}")
    print("  per-requirement mapping:")
    for r in rows:
        evidence = f"ev={r['evidence_hashes']}" if r["status"] != "GAP" else ""
        print(f"    {r['id']:<9} {r['status']:<8} cluster={r['cluster']} {evidence}")
    if gap:
        print("  CLAIM: 100% original-plus-amendments semantic coverage -> NOT MET (GAPs remain)")
    elif partial_without_reason:
        print(f"  CLAIM: NOT MET — PARTIAL without evidence/reason: {partial_without_reason}")
    else:
        print("  CLAIM: 100% original-plus-amendments semantic coverage -> MET (COVERED or PARTIAL-with-evidence)")

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
        "partial_without_reason": partial_without_reason,
    }
    print(f'M11REPORT:{json.dumps(report)}')
    # Exit 2 when the 100% claim is unmet; 0 when met; 1 on structural error.
    return 2 if not claim_met else 0


if __name__ == "__main__":
    sys.exit(main())
