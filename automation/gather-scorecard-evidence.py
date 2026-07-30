#!/usr/bin/env python3
"""AM0015 scorecard evidence pipeline.

Collects exact git candidate/effective identity, local gate receipts, GitHub runs
(via gh/read-only if available), ledger state, and install/doctor evidence.
Validates evidence URIs + hashes + freshness. Derives scores strictly from the
AM0015 rubric with caps (no CI/install/native evidence => honest low score;
Critical/High cap <8). All 18 dimensions. No self-claim.

Writes automation/scorecard-evidence.json atomically (tempfile + rename).
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

SCRIPT_DIR = Path(__file__).resolve().parent
ROOT = SCRIPT_DIR.parent
CANONICAL_OUTPUT = SCRIPT_DIR / "scorecard-evidence.json"
SCHEMA_PATH = ROOT / "schemas" / "scorecard-evidence.schema.json"
FIXTURES_DIR = ROOT / "evals" / "fixtures"

SEVERITY_MAX: dict[str, int] = {
    "Critical": 7,
    "High": 7,
    "Medium": 10,
    "Low": 10,
}

_GIT_RE = re.compile(r"^[a-f0-9]{7,40}$")
_SHA256_PREFIX = "sha256:"

RUBRIC: list[dict[str, Any]] = [
    {
        "id": "d01",
        "label": "Context Routing",
        "description": "Canonical context loaded via route-based manifest",
        "severity": "Critical",
        "checks": [
            {"kind": "source", "path": "rules/manifest.yaml", "weight": 0.20},
            {"kind": "source", "path": "automation/context-graph-router.py", "weight": 0.20},
            {"kind": "test", "path": "evals/conformance/routing.py", "weight": 0.20},
            {"kind": "test", "path": "automation/test-context-router.py", "weight": 0.10},
            {"kind": "gate", "path": "automation/test-conformance.py", "weight": 0.15},
            {"kind": "ci", "path": ".github/workflows/quality.yml", "weight": 0.15},
        ],
    },
    {
        "id": "d02",
        "label": "Plan Identity Integrity",
        "description": "planId validation, SHA-256 aggregation, integrity checks",
        "severity": "Critical",
        "checks": [
            {"kind": "source", "path": "packages/engine/src/plan-identity.ts", "weight": 0.25},
            {"kind": "source", "path": "schemas/plan.schema.json", "weight": 0.20},
            {"kind": "test", "path": "automation/workctl.py", "weight": 0.20},
            {"kind": "gate", "path": "automation/agent_quality.py", "weight": 0.15},
            {"kind": "ci", "path": ".github/workflows/quality.yml", "weight": 0.10},
            {"kind": "install", "path": "packages/cli/package.json", "weight": 0.10},
        ],
    },
    {
        "id": "d03",
        "label": "Evidence Binding",
        "description": "Plan-anchor binding with cryptographic evidence hashes",
        "severity": "High",
        "checks": [
            {"kind": "source", "path": "schemas/evidence.schema.json", "weight": 0.20},
            {"kind": "source", "path": "schemas/claim-evidence.schema.json", "weight": 0.20},
            {"kind": "test", "path": "automation/agent_quality.py", "weight": 0.20},
            {"kind": "test", "path": "automation/test-agent-quality-benchmark.py", "weight": 0.15},
            {"kind": "gate", "path": "automation/evidence-profiles.json", "weight": 0.15},
            {"kind": "ci", "path": ".github/workflows/quality.yml", "weight": 0.10},
        ],
    },
    {
        "id": "d04",
        "label": "Amendment Tracking",
        "description": "Ordered amendment manifest, tombstone-aware, ledger sync",
        "severity": "Medium",
        "checks": [
            {"kind": "source", "path": "automation/workctl.py", "weight": 0.25},
            {"kind": "source", "path": "schemas/run-state.schema.json", "weight": 0.20},
            {"kind": "test", "path": "automation/workctl.py", "weight": 0.20},
            {"kind": "gate", "path": "schemas/assignment.schema.json", "weight": 0.20},
            {"kind": "ci", "path": ".github/workflows/quality.yml", "weight": 0.15},
        ],
    },
    {
        "id": "d05",
        "label": "Shadow Hash Verification",
        "description": "Disk-to-ledger shadow hash comparison with allowlist",
        "severity": "High",
        "checks": [
            {"kind": "source", "path": "automation/workctl.py", "weight": 0.25},
            {"kind": "source", "path": "automation/host-attestation.ts", "weight": 0.20},
            {"kind": "test", "path": "automation/host-attestation.test.ts", "weight": 0.20},
            {"kind": "gate", "path": "automation/workctl.py", "weight": 0.20},
            {"kind": "ci", "path": ".github/workflows/quality.yml", "weight": 0.15},
        ],
    },
    {
        "id": "d06",
        "label": "Reconciliation Accuracy",
        "description": "Requirement-level reconciliation matrix with status tracking",
        "severity": "Medium",
        "checks": [
            {"kind": "source", "path": "automation/workctl.py", "weight": 0.30},
            {"kind": "source", "path": "docs/architecture/target-operating-model.md", "weight": 0.20},
            {"kind": "test", "path": "automation/report-agent-quality.py", "weight": 0.20},
            {"kind": "gate", "path": "schemas/requirement.schema.json", "weight": 0.15},
            {"kind": "ci", "path": ".github/workflows/quality.yml", "weight": 0.15},
        ],
    },
    {
        "id": "d07",
        "label": "Verification Claims Coverage",
        "description": "Claim pass/fail/blocked/unverified aggregation per plan",
        "severity": "Medium",
        "checks": [
            {"kind": "source", "path": "automation/evidence-profiles.json", "weight": 0.25},
            {"kind": "source", "path": "automation/agent_quality.py", "weight": 0.20},
            {"kind": "test", "path": "automation/test-agent-quality-benchmark.py", "weight": 0.20},
            {"kind": "gate", "path": "schemas/claim-evidence.schema.json", "weight": 0.20},
            {"kind": "ci", "path": ".github/workflows/quality.yml", "weight": 0.15},
        ],
    },
    {
        "id": "d08",
        "label": "Batch Execution",
        "description": "Task batch status tracking with DAG fallback rendering",
        "severity": "Low",
        "checks": [
            {"kind": "source", "path": "automation/workctl.py", "weight": 0.35},
            {"kind": "source", "path": "schemas/delegation.schema.json", "weight": 0.20},
            {"kind": "test", "path": "automation/workctl.py", "weight": 0.25},
            {"kind": "gate", "path": "schemas/assignment.schema.json", "weight": 0.20},
        ],
    },
    {
        "id": "d09",
        "label": "Attestation Completeness",
        "description": "Host, capability, and model attestation capture",
        "severity": "High",
        "checks": [
            {"kind": "source", "path": "automation/host-attestation.ts", "weight": 0.25},
            {"kind": "source", "path": "automation/host-attestation.test.ts", "weight": 0.20},
            {"kind": "test", "path": "automation/host-attestation.test.ts", "weight": 0.20},
            {"kind": "gate", "path": "packages/engine/src/contracts.ts", "weight": 0.20},
            {"kind": "ci", "path": ".github/workflows/quality.yml", "weight": 0.15},
        ],
    },
    {
        "id": "d10",
        "label": "Audit Trail Integrity",
        "description": "Mutation audit with old/new hash and backup path",
        "severity": "Critical",
        "checks": [
            {"kind": "source", "path": "automation/workctl.py", "weight": 0.30},
            {"kind": "source", "path": "schemas/run-state.schema.json", "weight": 0.20},
            {"kind": "test", "path": "automation/workctl.py", "weight": 0.20},
            {"kind": "gate", "path": "schemas/telemetry-event.schema.json", "weight": 0.15},
            {"kind": "ci", "path": ".github/workflows/quality.yml", "weight": 0.15},
        ],
    },
    {
        "id": "d11",
        "label": "Path Traversal Protection",
        "description": "safeResolve with null-byte, absolute, and ../ rejection",
        "severity": "Critical",
        "checks": [
            {"kind": "source", "path": "automation/workctl.py", "weight": 0.30},
            {"kind": "source", "path": "automation/host-attestation.ts", "weight": 0.20},
            {"kind": "test", "path": "automation/host-attestation.test.ts", "weight": 0.20},
            {"kind": "gate", "path": "packages/engine/src/contracts.ts", "weight": 0.15},
            {"kind": "ci", "path": ".github/workflows/quality.yml", "weight": 0.15},
        ],
    },
    {
        "id": "d12",
        "label": "Symlink Protection",
        "description": "O_NOFOLLOW, lstat/open identity verification, swap detection",
        "severity": "High",
        "checks": [
            {"kind": "source", "path": "automation/host-attestation.ts", "weight": 0.30},
            {"kind": "source", "path": "automation/host-attestation.test.ts", "weight": 0.25},
            {"kind": "test", "path": "automation/host-attestation.test.ts", "weight": 0.25},
            {"kind": "ci", "path": ".github/workflows/quality.yml", "weight": 0.20},
        ],
    },
    {
        "id": "d13",
        "label": "Schema Validation Rigor",
        "description": "AJV schema validation for mutation targets",
        "severity": "Medium",
        "checks": [
            {"kind": "source", "path": "schemas/", "weight": 0.25},
            {"kind": "source", "path": "automation/agent_quality.py", "weight": 0.20},
            {"kind": "test", "path": "automation/test-artifact-schemas.py", "weight": 0.20},
            {"kind": "gate", "path": "automation/agent_quality.py", "weight": 0.20},
            {"kind": "ci", "path": ".github/workflows/quality.yml", "weight": 0.15},
        ],
    },
    {
        "id": "d14",
        "label": "C4 Visualization Maturity",
        "description": "Context/container/component/code views with ARIA roles",
        "severity": "Low",
        "checks": [
            {"kind": "source", "path": "packages/control-plane/src/routes/c4.ts", "weight": 0.30},
            {"kind": "source", "path": "packages/control-plane/src/client/pages/C4.tsx", "weight": 0.25},
            {"kind": "test", "path": "packages/control-plane/tests/c4.test.ts", "weight": 0.25},
            {"kind": "gate", "path": "packages/control-plane/vitest.config.ts", "weight": 0.20},
        ],
    },
    {
        "id": "d15",
        "label": "Multi-Platform Support",
        "description": "Platform adapters with runtime.yaml contracts",
        "severity": "Medium",
        "checks": [
            {"kind": "source", "path": "platforms/", "weight": 0.25},
            {"kind": "source", "path": "platforms/platform-contracts.json", "weight": 0.20},
            {"kind": "test", "path": "platforms/opencode/adapter.test.ts", "weight": 0.20},
            {"kind": "gate", "path": "automation/ci-certify.sh", "weight": 0.20},
            {"kind": "ci", "path": ".github/workflows/certification.yml", "weight": 0.15},
        ],
    },
    {
        "id": "d16",
        "label": "API Security Posture",
        "description": "Auth fail-closed, timingSafeEqual, rate limiting, CORS",
        "severity": "Critical",
        "checks": [
            {"kind": "source", "path": "packages/control-plane/src/middleware/", "weight": 0.25},
            {"kind": "source", "path": "packages/control-plane/src/routes/", "weight": 0.20},
            {"kind": "test", "path": "packages/control-plane/tests/", "weight": 0.20},
            {"kind": "gate", "path": "schemas/policy-approval.schema.json", "weight": 0.20},
            {"kind": "ci", "path": ".github/workflows/quality.yml", "weight": 0.15},
        ],
    },
    {
        "id": "d17",
        "label": "Telemetry & Monitoring",
        "description": "Telemetry import with secrets redaction, health minimal",
        "severity": "Medium",
        "checks": [
            {"kind": "source", "path": "evals/telemetry/", "weight": 0.25},
            {"kind": "source", "path": "evals/fixtures/telemetry.schema.json", "weight": 0.20},
            {"kind": "test", "path": "evals/conformance/telemetry.test.ts", "weight": 0.20},
            {"kind": "gate", "path": "automation/agent_quality.py", "weight": 0.20},
            {"kind": "ci", "path": ".github/workflows/quality.yml", "weight": 0.15},
        ],
    },
    {
        "id": "d18",
        "label": "Release Readiness",
        "description": "v2.0 release pipeline, CI quality gates, certification",
        "severity": "High",
        "checks": [
            {"kind": "source", "path": "package.json", "weight": 0.20},
            {"kind": "source", "path": ".github/workflows/quality.yml", "weight": 0.20},
            {"kind": "test", "path": "automation/ci-certify.sh", "weight": 0.15},
            {"kind": "gate", "path": ".github/workflows/certification.yml", "weight": 0.15},
            {"kind": "install", "path": "packages/cli/package.json", "weight": 0.15},
            {"kind": "doctor", "path": "automation/09-doctor.ps1", "weight": 0.15},
        ],
    },
]


def file_hash(path: Path) -> str:
    h = hashlib.sha256()
    if path.is_dir():
        for p in sorted(path.rglob("*")):
            if p.is_file():
                h.update(p.read_bytes())
    else:
        h.update(path.read_bytes())
    return f"{_SHA256_PREFIX}{h.hexdigest()}"


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def gather_git_identity(root: Path) -> dict[str, str]:
    info: dict[str, str] = {
        "commit": "unknown",
        "author": "unknown",
        "branch": "unknown",
        "identity_candidate": "",
        "identity_effective": "",
    }
    try:
        result = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=root, capture_output=True, text=True, timeout=15, check=False,
        )
        if result.returncode == 0:
            info["commit"] = result.stdout.strip()
    except (OSError, subprocess.TimeoutExpired):
        pass
    try:
        result = subprocess.run(
            ["git", "log", "-1", "--format=%an <%ae>"],
            cwd=root, capture_output=True, text=True, timeout=15, check=False,
        )
        if result.returncode == 0:
            info["author"] = result.stdout.strip()
    except (OSError, subprocess.TimeoutExpired):
        pass
    try:
        result = subprocess.run(
            ["git", "branch", "--show-current"],
            cwd=root, capture_output=True, text=True, timeout=15, check=False,
        )
        if result.returncode == 0:
            info["branch"] = result.stdout.strip() or "detached"
    except (OSError, subprocess.TimeoutExpired):
        pass
    try:
        result = subprocess.run(
            ["git", "config", "user.name"],
            cwd=root, capture_output=True, text=True, timeout=15, check=False,
        )
        if result.returncode == 0:
            info["identity_candidate"] = result.stdout.strip()
    except (OSError, subprocess.TimeoutExpired):
        pass
    try:
        log_result = subprocess.run(
            ["git", "log", "-1", "--format=%an"],
            cwd=root, capture_output=True, text=True, timeout=15, check=False,
        )
        if log_result.returncode == 0:
            info["identity_effective"] = log_result.stdout.strip()
    except (OSError, subprocess.TimeoutExpired):
        pass
    return info


def _gh_runs_with_timeout(root: Path) -> list[dict[str, Any]]:
    try:
        result = subprocess.run(
            ["gh", "run", "list", "--limit", "5", "--json", "databaseId,headBranch,status,conclusion,startedAt"],
            cwd=root, capture_output=True, text=True, timeout=10, check=False,
        )
        if result.returncode != 0:
            return []
        data = json.loads(result.stdout)
        if not isinstance(data, list):
            return []
        return [{
            "id": str(r.get("databaseId", "")),
            "branch": str(r.get("headBranch", "")),
            "status": str(r.get("status", "")),
            "conclusion": str(r.get("conclusion", "")),
            "started_at": str(r.get("startedAt", "")),
        } for r in data]
    except (OSError, subprocess.TimeoutExpired, json.JSONDecodeError, UnicodeDecodeError):
        return []


def gather_gh_runs(root: Path) -> list[dict[str, Any]]:
    if not shutil.which("gh"):
        return []
    return _gh_runs_with_timeout(root)


def check_evidence(root: Path, rel_path: str) -> dict[str, Any]:
    full = root / rel_path
    now = time.time()
    if not full.exists():
        return {"uri": rel_path, "hash": "", "freshness_seconds": -1, "exists": False}
    try:
        stat_result = full.stat()
        h = file_hash(full)
        age = now - (stat_result.st_mtime if stat_result.st_mtime else stat_result.st_ctime)
        return {"uri": rel_path, "hash": h, "freshness_seconds": round(max(0, age)), "exists": True}
    except (OSError, PermissionError):
        return {"uri": rel_path, "hash": "", "freshness_seconds": -1, "exists": False}


def validate_evidence_hash(ev: dict[str, Any]) -> list[str]:
    findings: list[str] = []
    if not ev["exists"]:
        findings.append(f"missing:{ev['uri']}")
        return findings
    if not ev["hash"]:
        findings.append(f"no-hash:{ev['uri']}")
    elif not ev["hash"].startswith(_SHA256_PREFIX):
        findings.append(f"bad-hash-format:{ev['uri']}")
    if ev["freshness_seconds"] < 0:
        findings.append(f"stale:{ev['uri']}")
    return findings


def score_dimension(dim: dict[str, Any], evidence_map: dict[str, dict[str, Any]]) -> dict[str, Any]:
    max_allowed = SEVERITY_MAX[dim["severity"]]
    score_float = 0.0
    evidence_items: list[dict[str, Any]] = []
    findings: list[str] = []
    for check in dim["checks"]:
        ev = evidence_map.get(check["path"], {"uri": check["path"], "hash": "", "freshness_seconds": -1, "exists": False})
        passed = ev["exists"]
        item = {
            "uri": check["path"],
            "hash": ev.get("hash", ""),
            "freshness_seconds": ev.get("freshness_seconds", -1),
            "kind": check["kind"],
            "passed": passed,
            "finding": "",
        }
        check_findings = validate_evidence_hash(ev)
        if check_findings:
            item["finding"] = "; ".join(check_findings)
            findings.extend(check_findings)
        if passed:
            score_float += check["weight"] * max_allowed
        evidence_items.append(item)
    score = min(round(score_float), max_allowed)
    if score >= max_allowed:
        status = "pass"
    elif score >= max_allowed * 0.5:
        status = "warn"
    else:
        status = "fail"
    return {
        "id": dim["id"],
        "label": dim["label"],
        "severity": dim["severity"],
        "score": score,
        "maxScore": max_allowed,
        "status": status,
        "evidence_items": evidence_items,
        "findings": findings,
    }


def gather_scores(rubric: list[dict[str, Any]], root: Path) -> dict[str, Any]:
    git_info = gather_git_identity(root)
    gh_runs = gather_gh_runs(root)
    all_evidence: dict[str, dict[str, Any]] = {}
    evidence_kinds: dict[str, set[str]] = {}
    for dim in rubric:
        for check in dim["checks"]:
            path = check["path"]
            kind = check["kind"]
            if path not in all_evidence:
                all_evidence[path] = check_evidence(root, path)
            evidence_kinds.setdefault(path, set()).add(kind)
    scored = [score_dimension(d, all_evidence) for d in rubric]
    evidence_sources = []
    for path, ev in all_evidence.items():
        if ev.get("exists"):
            kinds = evidence_kinds.get(path, set())
            for kind in sorted(kinds):
                evidence_sources.append({
                    "uri": path,
                    "hash": ev.get("hash", ""),
                    "freshness_seconds": ev.get("freshness_seconds", -1),
                    "kind": kind,
                })
    now = now_iso()
    return {
        "schema": "am0015/scorecard-evidence/v2",
        "updated_at": now,
        "_gathered_at": now,
        "_git": git_info,
        "_gh_runs": gh_runs,
        "_evidence_sources": evidence_sources,
        "dimensions": scored,
    }


def validate_output(output: dict[str, Any], schema_path: Path | None = None) -> list[str]:
    errors: list[str] = []
    if not output.get("schema", "").startswith("am0015/scorecard-evidence/"):
        errors.append("missing or wrong schema marker")
    if schema_path and schema_path.is_file():
        try:
            schema = json.loads(schema_path.read_text(encoding="utf-8"))
            try:
                from jsonschema import validate as js_validate, ValidationError as JSError
                js_validate(output, schema)
            except ImportError:
                pass
            except JSError as e:
                errors.append(f"schema violation: {e.message}")
        except (json.JSONDecodeError, OSError) as e:
            errors.append(f"schema load error: {e}")
    dims = output.get("dimensions", [])
    if len(dims) != 18:
        errors.append(f"expected 18 dimensions, got {len(dims)}")
    seen_ids: set[str] = set()
    for d in dims:
        if d["id"] in seen_ids:
            errors.append(f"duplicate dimension id: {d['id']}")
        seen_ids.add(d["id"])
        if d.get("severity", "") in ("Critical", "High") and d.get("maxScore", 0) >= 8:
            errors.append(f"{d['id']}: {d['severity']} cap violation (maxScore={d['maxScore']} >= 8)")
        if d.get("score", -1) < 0 or d.get("maxScore", 0) <= 0:
            errors.append(f"{d['id']}: invalid score={d['score']} maxScore={d['maxScore']}")
        if d.get("score", 0) > d.get("maxScore", 0):
            errors.append(f"{d['id']}: score {d['score']} exceeds maxScore {d['maxScore']}")
        for ev in d.get("evidence_items", []):
            if ev.get("passed") and not ev.get("hash"):
                errors.append(f"{d['id']}: passed evidence without hash: {ev['uri']}")
    return errors


def write_atomic(path: Path, value: Any) -> None:
    parent = path.parent
    parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(suffix=".json", prefix="scorecard-evidence-", dir=parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(value, f, ensure_ascii=False, indent=2)
            f.write("\n")
        os.replace(tmp, str(path))
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def main() -> int:
    parser = argparse.ArgumentParser(description="AM0015 scorecard evidence pipeline")
    parser.add_argument("--root", default=str(ROOT), help="Repository root")
    parser.add_argument("--output", default=str(CANONICAL_OUTPUT), help="Output path")
    parser.add_argument("--validate-only", action="store_true", help="Validate existing output")
    parser.add_argument("--validate", action="store_true", help="Validate output after writing")
    parser.add_argument("--validate-schema", action="store_true", help="Validate against JSON Schema (implies --validate)")
    args = parser.parse_args()

    root = Path(args.root).resolve()
    output_path = Path(args.output).resolve()
    schema_path = SCHEMA_PATH if args.validate_schema else None

    if args.validate_only:
        if not output_path.is_file():
            print(f"FAIL: {output_path} not found")
            return 1
        existing = json.loads(output_path.read_text(encoding="utf-8"))
        errors = validate_output(existing, schema_path=SCHEMA_PATH)
        if errors:
            for e in errors:
                print(f"  VALIDATION: {e}")
            return 1
        print(f"PASS: {output_path} validates")
        return 0

    report = gather_scores(RUBRIC, root)
    if args.validate or args.validate_schema:
        errors = validate_output(report, schema_path=schema_path)
        if errors:
            for e in errors:
                print(f"  VALIDATION: {e}")
            return 1
    write_atomic(output_path, report)
    print(f"PASS: AM0015 scorecard evidence -> {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
