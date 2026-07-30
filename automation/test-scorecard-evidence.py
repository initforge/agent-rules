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
OPEN_FINDING_CAP = scorecard_mod.OPEN_FINDING_CAP
_SHA256_PREFIX = scorecard_mod._SHA256_PREFIX
check_evidence = scorecard_mod.check_evidence
file_hash = scorecard_mod.file_hash
gather_scores = scorecard_mod.gather_scores
score_dimension = scorecard_mod.score_dimension
collect_ci_binding = scorecard_mod.collect_ci_binding
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
_HEAD = "a" * 40
_PLAN_SHA = "b" * 64
_HASH = "sha256:" + "c" * 64
TRUSTED_BINDING: dict[str, Any] = {
    "head_commit": _HEAD,
    "head_verified": True,
    "effective_plan": {"sha256": _PLAN_SHA, "verified": True},
    "ci": {"status": "passed", "head_commit": _HEAD, "freshness_seconds": 1, "run_ids": ["run-1"]},
    "verified": True,
}


def trusted_evidence(uri: str) -> dict[str, Any]:
    return {"uri": uri, "hash": _HASH, "freshness_seconds": 0, "exists": True, "head_bound": True}


def valid_dimension(index: int, severity: str = "Medium", score: int = 5) -> dict[str, Any]:
    return {
        "id": f"d{index:02d}", "severity": severity, "score": score, "maxScore": 10,
        "score_cap": {"applied": False, "limit": 10, "finding_ids": []}, "status": "warn",
        "label": f"Dim {index}", "evidence_items": [], "findings": [],
    }


def valid_output(dims: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "schema": "am0015/scorecard-evidence/v2", "updated_at": "2026-01-01T00:00:00",
        "_binding": TRUSTED_BINDING, "dimensions": dims,
    }


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
        assert expected_max == 10, f"{d['id']}: default maxScore must remain reachable"


def test_severity_max_constants() -> None:
    assert SEVERITY_MAX["Critical"] == 10
    assert SEVERITY_MAX["High"] == 10
    assert SEVERITY_MAX["Medium"] == 10
    assert SEVERITY_MAX["Low"] == 10


def test_score_dimension_all_present() -> None:
    evidence_map: dict[str, dict[str, Any]] = {}
    for c in FIXTURE_RUBRIC[1]["checks"]:
        evidence_map[c["path"]] = trusted_evidence(c["path"])
    result = score_dimension(FIXTURE_RUBRIC[1], evidence_map, TRUSTED_BINDING)
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
        "README.md": trusted_evidence("README.md"),
        "nonexistent-file-xyz": {"uri": "nonexistent-file-xyz", "hash": "", "freshness_seconds": -1, "exists": False},
    }
    result = score_dimension(FIXTURE_RUBRIC[0], evidence_map, TRUSTED_BINDING)
    assert result["score"] < 10
    assert result["score"] > 0
    assert result["status"] in ("warn", "fail")


def test_open_critical_finding_caps_only_its_dimension() -> None:
    mock_dim = {
        "id": "d99", "label": "Cap Test", "description": "",
        "severity": "Critical",
        "checks": [
            {"kind": "source", "path": "README.md", "weight": 0.5},
            {"kind": "test", "path": "README.md", "weight": 0.5},
        ],
    }
    evidence_map = {"README.md": trusted_evidence("README.md")}
    result = score_dimension(mock_dim, evidence_map, TRUSTED_BINDING, [{"finding_id": "F-OPEN", "status": "OPEN", "severity": "critical", "dimension_id": "d99"}])
    assert result["maxScore"] == 10
    assert result["score_cap"] == {"applied": True, "limit": OPEN_FINDING_CAP, "finding_ids": ["F-OPEN"]}
    assert result["score"] == OPEN_FINDING_CAP


def test_closed_historical_high_finding_does_not_cap() -> None:
    mock_dim = {
        "id": "d99", "label": "High Cap Test", "description": "",
        "severity": "High",
        "checks": [{"kind": "source", "path": "README.md", "weight": 1.0}],
    }
    evidence_map = {"README.md": trusted_evidence("README.md")}
    result = score_dimension(mock_dim, evidence_map, TRUSTED_BINDING, [{"finding_id": "F-CLOSED", "status": "CLOSED_MATCH", "severity": "high", "dimension_id": "d99"}])
    assert result["maxScore"] == 10
    assert result["score_cap"]["applied"] is False
    assert result["score"] == 10


def test_open_high_finding_caps_high_dimension() -> None:
    dim = {
        "id": "d99", "label": "High Open Finding", "description": "", "severity": "High",
        "checks": [{"kind": "source", "path": "README.md", "weight": 1.0}],
    }
    result = score_dimension(dim, {"README.md": trusted_evidence("README.md")}, TRUSTED_BINDING, [{"finding_id": "F-HIGH", "status": "REPAIRED_PENDING_REVIEW", "severity": "high", "dimension_id": "d99"}])
    assert result["score_cap"] == {"applied": True, "limit": OPEN_FINDING_CAP, "finding_ids": ["F-HIGH"]}
    assert result["score"] == OPEN_FINDING_CAP


def test_medium_no_cap() -> None:
    mock_dim = {
        "id": "d99", "label": "Medium No Cap", "description": "",
        "severity": "Medium",
        "checks": [{"kind": "source", "path": "README.md", "weight": 1.0}],
    }
    evidence_map = {"README.md": trusted_evidence("README.md")}
    result = score_dimension(mock_dim, evidence_map, TRUSTED_BINDING)
    assert result["maxScore"] == 10
    assert result["score"] == 10


def test_validate_output_passes_good() -> None:
    output = valid_output([valid_dimension(i) for i in range(1, 19)])
    errors = validate_output(output)
    assert errors == [], f"expected no errors, got: {errors}"


def test_validate_output_wrong_dim_count() -> None:
    output = valid_output([valid_dimension(i) for i in range(1, 5)])
    errors = validate_output(output)
    assert any("18" in e for e in errors)


def test_validate_output_rejects_score_above_open_finding_cap() -> None:
    dims = [valid_dimension(i, "Critical", 8) for i in range(1, 19)]
    for dim in dims:
        dim["score_cap"] = {"applied": True, "limit": OPEN_FINDING_CAP, "finding_ids": ["F-OPEN"]}
    output = valid_output(dims)
    errors = validate_output(output)
    cap_errors = [e for e in errors if "unresolved-finding cap" in e]
    assert len(cap_errors) == 18, f"expected 18 cap violations, got {len(cap_errors)}"


def test_validate_output_score_exceeds_max() -> None:
    output = valid_output([valid_dimension(i, "Medium", 15) for i in range(1, 19)])
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
        if d["score_cap"]["applied"]:
            assert d["score_cap"]["limit"] == OPEN_FINDING_CAP
            assert d["score"] <= OPEN_FINDING_CAP


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
                assert ev["head_commit"] == result["_binding"]["head_commit"]
                assert ev["effective_plan_sha256"] == result["_binding"]["effective_plan"]["sha256"]
                assert ev["ci_run_ids"], f"{d['id']}: passed evidence has no CI run"


def test_rubric_no_self_reference() -> None:
    script_name = Path(__file__).name
    for d in RUBRIC:
        for c in d["checks"]:
            assert script_name not in c["path"], f"self-claim detected in {d['id']}: {c['path']}"


def test_stale_head_cannot_promote_evidence() -> None:
    dim = {"id": "d99", "label": "Stale HEAD", "description": "", "severity": "Medium", "checks": [{"kind": "source", "path": "README.md", "weight": 1.0}]}
    stale = trusted_evidence("README.md")
    stale["head_bound"] = False
    result = score_dimension(dim, {"README.md": stale}, TRUSTED_BINDING)
    assert result["score"] == 0
    assert result["evidence_items"][0]["passed"] is False
    assert "head-mismatch:README.md" in result["findings"]


def test_failed_ci_cannot_promote_evidence() -> None:
    dim = {"id": "d99", "label": "Failed CI", "description": "", "severity": "Medium", "checks": [{"kind": "ci", "path": "README.md", "weight": 1.0}]}
    failed_binding = {**TRUSTED_BINDING, "ci": {"status": "failed", "head_commit": _HEAD, "freshness_seconds": 1, "run_ids": ["run-failed"]}}
    result = score_dimension(dim, {"README.md": trusted_evidence("README.md")}, failed_binding)
    assert result["score"] == 0
    assert "ci-failed" in result["findings"]


def test_stale_ci_cannot_promote_evidence() -> None:
    dim = {"id": "d99", "label": "Stale CI", "description": "", "severity": "Medium", "checks": [{"kind": "ci", "path": "README.md", "weight": 1.0}]}
    stale_binding = {**TRUSTED_BINDING, "ci": {"status": "stale", "head_commit": _HEAD, "freshness_seconds": 999999, "run_ids": ["run-stale"]}}
    result = score_dimension(dim, {"README.md": trusted_evidence("README.md")}, stale_binding)
    assert result["score"] == 0
    assert "ci-stale" in result["findings"]


def test_collect_ci_binding_rejects_failed_exact_head() -> None:
    result = collect_ci_binding({"commit": _HEAD}, [{"id": "run-failed", "head_sha": _HEAD, "status": "completed", "conclusion": "failure", "updated_at": "2099-01-01T00:00:00Z"}])
    assert result["status"] == "failed"


def test_self_claim_cannot_promote_evidence() -> None:
    dim = {"id": "d99", "label": "Self Claim", "description": "", "severity": "Medium", "checks": [{"kind": "source", "path": "automation/gather-scorecard-evidence.py", "weight": 1.0}]}
    result = score_dimension(dim, {"automation/gather-scorecard-evidence.py": trusted_evidence("automation/gather-scorecard-evidence.py")}, TRUSTED_BINDING)
    assert result["score"] == 0
    assert "self-claim:automation/gather-scorecard-evidence.py" in result["findings"]


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
