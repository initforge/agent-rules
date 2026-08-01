"""M11-C10 coverage test — verifies canonical graph generation and AM0020 count.

Tests:
1. Graph has 41 requirements (15 REQ + 26 M11-R)
2. AM-0019 §14 adds M11-R11..R26 (16 requirements)
3. AM-0020 §14 adds M11-R27..R36 (10 requirements)
4. M11-R22 has PARTIAL status with WAITING_EXTERNAL reason
5. Graph can be regenerated deterministically
"""
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
GRAPH_PATH = ROOT / ".agent" / "plans" / "agent-rules-harness-v3-rearchitecture-20260726-r1" / "verification-graph.yaml"
GENERATOR = ROOT / "evals" / "m11" / "graph_generator.py"


def load_graph() -> dict:
    """Load verification graph using node/yaml."""
    script = "const y=require('yaml');const fs=require('fs');process.stdout.write(JSON.stringify(y.parse(fs.readFileSync(process.argv[1],'utf8'))))"
    out = subprocess.run(
        ["node", "-e", script, str(GRAPH_PATH)],
        capture_output=True, text=True, check=True, cwd=ROOT,
    )
    return json.loads(out.stdout)


def test_graph_exists():
    """Graph file must exist."""
    assert GRAPH_PATH.is_file(), f"Graph not found: {GRAPH_PATH}"


def test_requirement_count():
    """Graph must declare exactly 43 requirements (41 claims + 2 reserved)."""
    graph = load_graph()
    assert graph.get("requirement_count") == 43, f"Expected 43, got {graph.get('requirement_count')}"


def test_claim_count():
    """Graph must declare exactly 41 claims."""
    graph = load_graph()
    assert graph.get("claim_count") == 41, f"Expected 41, got {graph.get('claim_count')}"


def test_am0020_count():
    """AM-0020 §14 adds exactly 10 M11-R requirements: R27..R36."""
    graph = load_graph()
    m11_ids = [e["requirement_id"] for e in graph.get("requirements", []) if e.get("requirement_id", "").startswith("M11-R")]
    am0020_ids = [i for i in m11_ids if int(i.split("-R")[1]) >= 27]
    assert len(am0020_ids) == 10, f"Expected 10 AM0020 requirements, got {len(am0020_ids)}: {am0020_ids}"
    expected = [f"M11-R{i}" for i in range(27, 37)]
    for req_id in expected:
        assert req_id in m11_ids, f"Missing {req_id}"


def test_am0019_count():
    """AM-0019 §14 adds exactly 16 M11-R requirements: R11..R26."""
    graph = load_graph()
    m11_ids = [e["requirement_id"] for e in graph.get("requirements", []) if e.get("requirement_id", "").startswith("M11-R")]
    am0019_ids = [i for i in m11_ids if 11 <= int(i.split("-R")[1]) <= 26]
    assert len(am0019_ids) == 16, f"Expected 16 AM0019 requirements, got {len(am0019_ids)}: {am0019_ids}"


def test_req_count():
    """Exactly 15 REQ requirements must be present."""
    graph = load_graph()
    req_ids = [e["requirement_id"] for e in graph.get("requirements", []) if e.get("requirement_id", "").startswith("REQ-")]
    assert len(req_ids) == 15, f"Expected 15 REQ requirements, got {len(req_ids)}"


def test_m11_r22_partial_waiting_external():
    """M11-R22 must have PARTIAL status with WAITING_EXTERNAL reason."""
    graph = load_graph()
    entry = next((e for e in graph.get("requirements", []) if e.get("requirement_id") == "M11-R22"), None)
    assert entry is not None, "M11-R22 not found in graph"
    assert entry.get("status") == "PARTIAL", f"Expected PARTIAL, got {entry.get('status')}"
    notes = entry.get("notes") or []
    assert any("WAITING_EXTERNAL" in n or "codex" in n.lower() for n in notes), f"No WAITING_EXTERNAL reason in notes: {notes}"


def test_generator_produces_valid_structure():
    """Generator must produce graph with correct structure."""
    result = subprocess.run(
        [sys.executable, str(GENERATOR), "--dry-run"],
        capture_output=True, text=True, cwd=ROOT,
    )
    assert result.returncode == 0, f"Generator failed: {result.stderr}"
    graph = json.loads(result.stdout)
    assert graph.get("schema_version") == 1
    assert graph.get("requirement_count") == 43
    assert graph.get("claim_count") == 41
    assert len(graph.get("requirements", [])) == 41


def test_generator_am0020_requirements():
    """Generator must produce all AM0020 requirements (R27..R36)."""
    result = subprocess.run(
        [sys.executable, str(GENERATOR), "--dry-run"],
        capture_output=True, text=True, cwd=ROOT,
    )
    graph = json.loads(result.stdout)
    m11_ids = [e["requirement_id"] for e in graph.get("requirements", []) if e.get("requirement_id", "").startswith("M11-R")]
    for i in range(27, 37):
        req_id = f"M11-R{i}"
        assert req_id in m11_ids, f"Generator missing {req_id}"


def test_generator_validates_hashes():
    """Generator hash validation must pass."""
    result = subprocess.run(
        [sys.executable, str(GENERATOR), "--validate-hashes"],
        capture_output=True, text=True, cwd=ROOT,
    )
    assert result.returncode == 0, f"Hash validation failed: {result.stderr}"


def test_no_gaps_when_evidence_exists():
    """Requirements with evidence must not be GAP (unless intentionally partial)."""
    graph = load_graph()
    gaps_with_evidence = []
    for entry in graph.get("requirements", []):
        req_id = entry.get("requirement_id", "?")
        status = entry.get("status")
        evidence = entry.get("evidence_contract") or {}
        hashes = evidence.get("hashes") or []
        if status == "GAP" and hashes:
            gaps_with_evidence.append(req_id)
    assert not gaps_with_evidence, f"GAP requirements with evidence: {gaps_with_evidence}"


def run_tests():
    """Run all tests and report results."""
    tests = [
        ("graph_exists", test_graph_exists),
        ("requirement_count", test_requirement_count),
        ("claim_count", test_claim_count),
        ("am0020_count", test_am0020_count),
        ("am0019_count", test_am0019_count),
        ("req_count", test_req_count),
        ("m11_r22_partial_waiting_external", test_m11_r22_partial_waiting_external),
        ("generator_valid_structure", test_generator_produces_valid_structure),
        ("generator_am0020", test_generator_am0020_requirements),
        ("generator_hash_validation", test_generator_validates_hashes),
        ("no_gaps_with_evidence", test_no_gaps_when_evidence_exists),
    ]
    
    passed = failed = 0
    for name, test in tests:
        try:
            test()
            print(f"  PASS: {name}")
            passed += 1
        except AssertionError as e:
            print(f"  FAIL: {name}: {e}")
            failed += 1
        except Exception as e:
            print(f"  ERROR: {name}: {e}")
            failed += 1
    
    print(f"\nResults: {passed} passed, {failed} failed")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(run_tests())
