#!/usr/bin/env python3
"""AM0015 scorecard evidence pipeline — deterministic tests.

No canonical ledger mutation, no network in unit tests, no commit.
"""
from __future__ import annotations

import importlib.util
import json
import os
import sys
import tempfile
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT))

_scorecard_spec = importlib.util.spec_from_file_location(
    "gather_scorecard_evidence", HERE / "gather-scorecard-evidence.py",
)
assert _scorecard_spec is not None and _scorecard_spec.loader is not None
scorecard_mod = importlib.util.module_from_spec(_scorecard_spec)
_scorecard_spec.loader.exec_module(scorecard_mod)

CANONICAL_OUTPUT = scorecard_mod.CANONICAL_OUTPUT
RUBRIC = scorecard_mod.RUBRIC
SEVERITY_MAX = scorecard_mod.SEVERITY_MAX
_SHA256_PREFIX = scorecard_mod._SHA256_PREFIX
check_evidence = scorecard_mod.check_evidence
file_hash = scorecard_mod.file_hash
gather_scores = scorecard_mod.gather_scores
score_dimension = scorecard_mod.score_dimension
validate_evidence_hash = scorecard_mod.validate_evidence_hash
validate_output = scorecard_mod.validate_output
write_atomic = scorecard_mod.write_atomic

FIXTURE_RUBRIC: list[dict[str, Any]] = [
    {
        "id": "d01",
        "label": "Test Dim",
        "description": "Fixture dimension for testing",
        "severity": "Critical",
        "checks": [
            {"kind": "source", "path": "README.md", "weight": 0.5},
            {"kind": "test", "path": "nonexistent-file-xyz", "weight": 0.5},
        ],
    },
    {
        "id": "d02",
        "label": "Test Dim 2",
        "description": "Another fixture dimension with all evidence present",
        "severity": "Medium",
        "checks": [
            {"kind": "source", "path": "README.md", "weight": 0.4},
            {"kind": "test", "path": "README.md", "weight": 0.3},
            {"kind": "ci", "path": "README.md", "weight": 0.3},
        ],
    },
]

FIXTURE_MISSING_RUBRIC: list[dict[str, Any]] = [
    {
        "id": "d99",
        "label": "All Missing",
        "description": "All evidence missing",
        "severity": "Critical",
        "checks": [
            {"kind": "source", "path": "zzz_nonexistent_file", "weight": 0.5},
            {"kind": "test", "path": "zzz_another_missing", "weight": 0.5},
        ],
    },
]

_SCORECARD_CACHE: dict[str, Any] | None = None


def _cached_scorecard() -> dict[str, Any]:
    global _SCORECARD_CACHE
    if _SCORECARD_CACHE is None:
        _SCORECARD_CACHE = gather_scores(RUBRIC, ROOT)
    return _SCORECARD_CACHE


def test_rubric_has_18_dimensions() -> None:
    assert len(RUBRIC) == 18, f"expected 18 dimensions, got {len(RUBRIC)}"


def test_rubric_ids() -> None:
    expected = {f"d{i:02d}" for i in range(1, 19)}
    actual = {d["id"] for d in RUBRIC}
    assert actual == expected, f"dimension IDs mismatch"


def test_rubric_weights_sum_to_1() -> None:
    for d in RUBRIC:
        total = sum(c["weight"] for c in d["checks"])
        assert abs(total - 1.0) < 0.01, f"{d['id']}: weights sum to {total}, expected 1.0"


def test_rubric_severity_max() -> None:
    for d in RUBRIC:
        expected_max = SEVERITY_MAX[d["severity"]]
        assert expected_max > 0, f"{d['id']}: bad maxScore for {d['severity']}"
        if d["severity"] in ("Critical", "High"):
            assert expected_max < 8, f"{d['id']}: {d['severity']} cap >= 8"


def test_severity_max_constants() -> None:
    assert SEVERITY_MAX["Critical"] < 8
    assert SEVERITY_MAX["High"] < 8
    assert SEVERITY_MAX["Medium"] == 10
    assert SEVERITY_MAX["Low"] == 10


def test_score_dimension_all_present() -> None:
    evidence_map: dict[str, dict[str, Any]] = {}
    for c in FIXTURE_RUBRIC[1]["checks"]:
        evidence_map[c["path"]] = {"uri": c["path"], "hash": "sha256:abc123", "freshness_seconds": 0, "exists": True}
    result = score_dimension(FIXTURE_RUBRIC[1], evidence_map)
    assert result["id"] == "d02"
    assert result["score"] > 0
    assert result["maxScore"] == 10
    assert result["status"] == "pass"


def test_score_dimension_missing_low_score() -> None:
    evidence_map: dict[str, dict[str, Any]] = {
        "zzz_nonexistent_file": {"uri": "zzz_nonexistent_file", "hash": "", "freshness_seconds": -1, "exists": False},
        "zzz_another_missing": {"uri": "zzz_another_missing", "hash": "", "freshness_seconds": -1, "exists": False},
    }
    result = score_dimension(FIXTURE_MISSING_RUBRIC[0], evidence_map)
    assert result["score"] == 0, f"expected 0, got {result['score']}"
    assert result["status"] == "fail"


def test_score_dimension_partial() -> None:
    evidence_map: dict[str, dict[str, Any]] = {
        "README.md": {"uri": "README.md", "hash": "sha256:abc123", "freshness_seconds": 0, "exists": True},
        "nonexistent-file-xyz": {"uri": "nonexistent-file-xyz", "hash": "", "freshness_seconds": -1, "exists": False},
    }
    result = score_dimension(FIXTURE_RUBRIC[0], evidence_map)
    assert result["score"] < 7
    assert result["score"] > 0
    assert result["status"] in ("warn", "fail")


def test_critical_cap_applied() -> None:
    mock_dim = {
        "id": "d99", "label": "Cap Test", "description": "",
        "severity": "Critical",
        "checks": [
            {"kind": "source", "path": "README.md", "weight": 0.5},
            {"kind": "test", "path": "README.md", "weight": 0.5},
        ],
    }
    evidence_map = {"README.md": {"uri": "README.md", "hash": "sha256:abc", "freshness_seconds": 0, "exists": True}}
    result = score_dimension(mock_dim, evidence_map)
    assert result["maxScore"] == 7, f"Critical should cap at 7, got {result['maxScore']}"
    assert result["score"] <= 7


def test_high_cap_applied() -> None:
    mock_dim = {
        "id": "d99", "label": "High Cap Test", "description": "",
        "severity": "High",
        "checks": [{"kind": "source", "path": "README.md", "weight": 1.0}],
    }
    evidence_map = {"README.md": {"uri": "README.md", "hash": "sha256:abc", "freshness_seconds": 0, "exists": True}}
    result = score_dimension(mock_dim, evidence_map)
    assert result["maxScore"] == 7
    assert result["score"] <= 7


def test_medium_no_cap() -> None:
    mock_dim = {
        "id": "d99", "label": "Medium No Cap", "description": "",
        "severity": "Medium",
        "checks": [{"kind": "source", "path": "README.md", "weight": 1.0}],
    }
    evidence_map = {"README.md": {"uri": "README.md", "hash": "sha256:abc", "freshness_seconds": 0, "exists": True}}
    result = score_dimension(mock_dim, evidence_map)
    assert result["maxScore"] == 10
    assert result["score"] == 10


def test_validate_output_passes_good() -> None:
    dims = [
        {"id": f"d{i:02d}", "severity": "Medium", "score": 5, "maxScore": 10, "status": "warn",
         "label": f"Dim {i}", "evidence_items": [], "findings": []}
        for i in range(1, 19)
    ]
    output = {"schema": "am0015/scorecard-evidence/v2", "updated_at": "2026-01-01T00:00:00", "dimensions": dims}
    errors = validate_output(output)
    assert errors == [], f"expected no errors, got: {errors}"


def test_validate_output_wrong_dim_count() -> None:
    dims = [
        {"id": f"d{i:02d}", "severity": "Medium", "score": 5, "maxScore": 10, "status": "warn",
         "label": f"Dim {i}", "evidence_items": [], "findings": []}
        for i in range(1, 5)
    ]
    output = {"schema": "am0015/scorecard-evidence/v2", "updated_at": "2026-01-01T00:00:00", "dimensions": dims}
    errors = validate_output(output)
    assert any("18" in e for e in errors)


def test_validate_output_critical_cap() -> None:
    dims = [
        {"id": f"d{i:02d}", "severity": "Critical", "score": 8, "maxScore": 10, "status": "warn",
         "label": f"Dim {i}", "evidence_items": [], "findings": []}
        for i in range(1, 19)
    ]
    output = {"schema": "am0015/scorecard-evidence/v2", "updated_at": "2026-01-01T00:00:00", "dimensions": dims}
    errors = validate_output(output)
    cap_errors = [e for e in errors if "cap violation" in e]
    assert len(cap_errors) == 18, f"expected 18 cap violations, got {len(cap_errors)}"


def test_validate_output_score_exceeds_max() -> None:
    dims = [
        {"id": f"d{i:02d}", "severity": "Medium", "score": 15, "maxScore": 10, "status": "warn",
         "label": f"Dim {i}", "evidence_items": [], "findings": []}
        for i in range(1, 19)
    ]
    output = {"schema": "am0015/scorecard-evidence/v2", "updated_at": "2026-01-01T00:00:00", "dimensions": dims}
    errors = validate_output(output)
    over_errors = [e for e in errors if "exceeds" in e]
    assert len(over_errors) == 18


def test_check_evidence_missing() -> None:
    result = check_evidence(ROOT, "zzz_definitely_not_a_file_that_exists_2024")
    assert result["exists"] is False
    assert result["freshness_seconds"] == -1
    assert result["hash"] == ""


def test_check_evidence_present() -> None:
    result = check_evidence(ROOT, "README.md")
    assert result["exists"] is True
    assert result["hash"].startswith(_SHA256_PREFIX)
    assert result["freshness_seconds"] >= 0


def test_check_evidence_directory() -> None:
    result = check_evidence(ROOT, "automation")
    assert result["exists"] is True
    assert result["hash"].startswith(_SHA256_PREFIX)


def test_validate_evidence_hash_missing() -> None:
    ev = {"uri": "missing-file", "hash": "", "freshness_seconds": -1, "exists": False}
    findings = validate_evidence_hash(ev)
    assert any("missing" in f for f in findings)


def test_validate_evidence_hash_stale() -> None:
    ev = {"uri": "stale-file", "hash": "sha256:abc", "freshness_seconds": -1, "exists": True}
    findings = validate_evidence_hash(ev)
    assert any("stale" in f for f in findings)


def test_validate_evidence_hash_bad_format() -> None:
    ev = {"uri": "bad-hash", "hash": "md5:abc", "freshness_seconds": 0, "exists": True}
    findings = validate_evidence_hash(ev)
    assert any("bad-hash" in f for f in findings)


def test_file_hash_file() -> None:
    h = file_hash(ROOT / "README.md")
    assert h.startswith(_SHA256_PREFIX)
    assert len(h) == len(_SHA256_PREFIX) + 64


def test_file_hash_directory() -> None:
    h = file_hash(ROOT / "evals" / "fixtures")
    assert h.startswith(_SHA256_PREFIX)


def test_write_atomic_creates_file() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        target = Path(tmp) / "test-output.json"
        data = {"schema": "am0015/scorecard-evidence/v2", "dimensions": [], "updated_at": "2026-01-01T00:00:00"}
        write_atomic(target, data)
        assert target.is_file()
        loaded = json.loads(target.read_text(encoding="utf-8"))
        assert loaded["schema"] == "am0015/scorecard-evidence/v2"


def test_write_atomic_overwrites() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        target = Path(tmp) / "test-output.json"
        target.write_text("{}", encoding="utf-8")
        data = {"schema": "am0015/scorecard-evidence/v2", "dimensions": [], "updated_at": "2026-01-01T00:00:00"}
        write_atomic(target, data)
        loaded = json.loads(target.read_text(encoding="utf-8"))
        assert loaded["schema"] == "am0015/scorecard-evidence/v2"


def test_write_atomic_writes_json() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        target = Path(tmp) / "subdir" / "test-output.json"
        data = {"hello": "world"}
        write_atomic(target, data)
        assert target.is_file()
        loaded = json.loads(target.read_text(encoding="utf-8"))
        assert loaded["hello"] == "world"


def test_gather_scores_18_dims() -> None:
    result = _cached_scorecard()
    assert len(result["dimensions"]) == 18
    assert result["schema"] == "am0015/scorecard-evidence/v2"
    assert result["_git"]["commit"] != "unknown"


def test_gather_scores_all_ids() -> None:
    result = _cached_scorecard()
    seen = {d["id"] for d in result["dimensions"]}
    expected = {f"d{i:02d}" for i in range(1, 19)}
    assert seen == expected


def test_gather_scores_no_negative() -> None:
    result = _cached_scorecard()
    for d in result["dimensions"]:
        assert d["score"] >= 0
        assert d["maxScore"] >= 0
        assert d["score"] <= d["maxScore"]


def test_gather_scores_caps_respected() -> None:
    result = _cached_scorecard()
    for d in result["dimensions"]:
        expected_max = SEVERITY_MAX[d["severity"]]
        assert d["maxScore"] == expected_max, f"{d['id']}: expected maxScore={expected_max}, got {d['maxScore']}"
        assert d["score"] <= expected_max


def test_gather_scores_has_git_info() -> None:
    result = _cached_scorecard()
    assert result["_git"]["commit"] != "unknown"
    assert result["_git"]["author"] != "unknown"


def test_gather_scores_no_gh_runs_network() -> None:
    result = _cached_scorecard()
    assert "_gh_runs" in result
    assert isinstance(result["_gh_runs"], list)


def test_gather_scores_evidence_sources_populated() -> None:
    result = _cached_scorecard()
    assert len(result["_evidence_sources"]) > 0


def test_gather_scores_each_dim_has_evidence() -> None:
    result = _cached_scorecard()
    for d in result["dimensions"]:
        assert len(d["evidence_items"]) > 0, f"{d['id']} has no evidence items"


def test_no_canonical_mutation() -> None:
    original = None
    if CANONICAL_OUTPUT.is_file():
        original = CANONICAL_OUTPUT.read_text(encoding="utf-8")
    result = _cached_scorecard()
    assert result["schema"] == "am0015/scorecard-evidence/v2"
    if original is not None:
        current = CANONICAL_OUTPUT.read_text(encoding="utf-8")
        assert current == original, "CANONICAL_OUTPUT was mutated!"


def test_no_self_claim() -> None:
    result = _cached_scorecard()
    for d in result["dimensions"]:
        for ev in d["evidence_items"]:
            if ev["passed"]:
                assert ev["hash"].startswith(_SHA256_PREFIX), f"{d['id']}: passed evidence without hash: {ev['uri']}"
                assert ev["freshness_seconds"] >= 0, f"{d['id']}: passed evidence is stale: {ev['uri']}"


def test_rubric_no_self_reference() -> None:
    script_name = Path(__file__).name
    for d in RUBRIC:
        for c in d["checks"]:
            assert script_name not in c["path"], f"self-claim detected in {d['id']}: {c['path']}"


def test_findings_captured() -> None:
    mock_dim = {
        "id": "d99", "label": "Findings Test", "description": "",
        "severity": "Medium",
        "checks": [{"kind": "source", "path": "nonexistent-file-abc-123", "weight": 1.0}],
    }
    evidence_map = {
        "nonexistent-file-abc-123": {"uri": "nonexistent-file-abc-123", "hash": "", "freshness_seconds": -1, "exists": False},
    }
    result = score_dimension(mock_dim, evidence_map)
    assert len(result["findings"]) > 0


def test_no_ci_no_install_honest_low() -> None:
    mock_dim = {
        "id": "d99", "label": "No CI No Install", "description": "",
        "severity": "Medium",
        "checks": [
            {"kind": "ci", "path": "nonexistent-ci-file", "weight": 0.5},
            {"kind": "install", "path": "nonexistent-install-file", "weight": 0.5},
        ],
    }
    evidence_map = {
        "nonexistent-ci-file": {"uri": "nonexistent-ci-file", "hash": "", "freshness_seconds": -1, "exists": False},
        "nonexistent-install-file": {"uri": "nonexistent-install-file", "hash": "", "freshness_seconds": -1, "exists": False},
    }
    result = score_dimension(mock_dim, evidence_map)
    assert result["score"] == 0
    assert result["status"] == "fail"


def test_validate_output_rejects_bad_schema() -> None:
    output = {"schema": "bad-schema", "updated_at": "2026-01-01T00:00:00", "dimensions": []}
    errors = validate_output(output)
    assert any("schema" in e for e in errors)


if __name__ == "__main__":
    failures: list[str] = []
    total = sum(1 for n in globals() if n.startswith("test_") and callable(globals()[n]))
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            try:
                fn()
            except Exception as exc:
                failures.append(f"FAIL: {name}: {exc}")
    if failures:
        for f in failures:
            print(f)
        sys.exit(1)
    print(f"PASS: all {total} tests")
