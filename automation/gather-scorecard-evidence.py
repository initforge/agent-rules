#!/usr/bin/env python3
"""AM0015 scorecard evidence pipeline.

Collects raw AM0015 evidence. Scores and review status remain permanently UNVERIFIED.
Never certifies a milestone.

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

CI_MAX_AGE_SECONDS = 24 * 60 * 60
REPORT_MAX_AGE_SECONDS = 24 * 60 * 60

_GIT_RE = re.compile(r"^[a-f0-9]{7,40}$")
_SHA256_PREFIX = "sha256:"
_SHA256_RE = re.compile(r"^[a-f0-9]{64}$")
_CLOSED_FINDING_STATUSES = {"RESOLVED", "SUPERSEDED", "ACCEPTED"}
_SELF_CLAIM_PATHS = {
    "automation/gather-scorecard-evidence.py",
    "automation/test-scorecard-evidence.py",
    "automation/scorecard-evidence.json",
    "schemas/scorecard-evidence.schema.json",
}

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
            {"kind": "source", "path": "packages/kernel/src/secure-fs.ts", "weight": 0.25},
            {"kind": "source", "path": "packages/kernel/src/contracts.ts", "weight": 0.20},
            {"kind": "test", "path": "packages/kernel/test/", "weight": 0.20},
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
CANONICAL_DIMENSIONS = tuple((d["id"], d["label"]) for d in RUBRIC)


def _parent_identities(path: Path) -> tuple[tuple[str, int, int], ...]:
    """Capture every existing parent; reject symlinked/non-directory parents."""
    identities = []
    for parent in reversed(path.absolute().parents):
        stat = parent.lstat()
        if parent.is_symlink() or not parent.is_dir():
            raise OSError("unsafe parent directory")
        identities.append((str(parent), stat.st_dev, stat.st_ino))
    return tuple(identities)


def _read_regular_nofollow(path: Path) -> bytes:
    """Descriptor read with final-path and complete parent-chain revalidation."""
    flags = os.O_RDONLY | getattr(os, "O_BINARY", 0)
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    parents_before = _parent_identities(path)
    before = path.lstat()
    if path.is_symlink():
        raise OSError("symlink evidence forbidden")
    fd = os.open(path, flags)
    try:
        opened = os.fstat(fd)
        data = b""
        while chunk := os.read(fd, 1024 * 1024):
            data += chunk
        after = path.lstat()
        parents_after = _parent_identities(path)
        if parents_before != parents_after:
            raise OSError("parent directory changed during read")
        if path.is_symlink() or (before.st_dev, before.st_ino) != (opened.st_dev, opened.st_ino) or (after.st_dev, after.st_ino) != (opened.st_dev, opened.st_ino):
            raise OSError("evidence path changed during read")
        return data
    finally:
        os.close(fd)


def _read_json_nofollow(path: Path) -> Any:
    return json.loads(_read_regular_nofollow(path).decode("utf-8"))


def file_hash(path: Path) -> str:
    if path.is_symlink():
        raise OSError("symlink evidence forbidden")
    h = hashlib.sha256()
    if path.is_dir():
        for p in sorted(path.rglob("*")):
            if p.is_file():
                if p.is_symlink():
                    raise OSError("symlink evidence forbidden")
                h.update(p.relative_to(path).as_posix().encode("utf-8") + b"\0")
                h.update(_read_regular_nofollow(p))
    else:
        h.update(_read_regular_nofollow(path))
    return f"{_SHA256_PREFIX}{h.hexdigest()}"


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _run_git(root: Path, args: list[str]) -> subprocess.CompletedProcess[str] | None:
    try:
        return subprocess.run(
            ["git", *args], cwd=root, capture_output=True, text=True,
            timeout=15, check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        return None


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
            ["gh", "run", "list", "--limit", "20", "--json", "databaseId,headBranch,headSha,status,conclusion,startedAt,updatedAt,workflowName"],
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
            "head_sha": str(r.get("headSha", "")),
            "status": str(r.get("status", "")),
            "conclusion": str(r.get("conclusion", "")),
            "started_at": str(r.get("startedAt", "")),
            "updated_at": str(r.get("updatedAt", "")),
            "workflow": str(r.get("workflowName", "")),
        } for r in data]
    except (OSError, subprocess.TimeoutExpired, json.JSONDecodeError, UnicodeDecodeError):
        return []


def gather_gh_runs(root: Path) -> list[dict[str, Any]]:
    if not shutil.which("gh"):
        return []
    return _gh_runs_with_timeout(root)


def check_evidence(root: Path, rel_path: str) -> dict[str, Any]:
    normalized = rel_path.replace("\\", "/")
    candidate = Path(normalized)
    if candidate.is_absolute() or ".." in candidate.parts or "\x00" in normalized:
        return {"uri": rel_path, "hash": "", "freshness_seconds": -1, "exists": False}
    full = (root / candidate).resolve()
    try:
        full.relative_to(root.resolve())
    except ValueError:
        return {"uri": rel_path, "hash": "", "freshness_seconds": -1, "exists": False}
    now = time.time()
    unresolved = root / candidate
    if not full.exists() or unresolved.is_symlink() or any(parent.is_symlink() for parent in unresolved.parents if parent != root.parent):
        return {"uri": rel_path, "hash": "", "freshness_seconds": -1, "exists": False}
    try:
        stat_result = full.stat()
        h = file_hash(full)
        age = now - (stat_result.st_mtime if stat_result.st_mtime else stat_result.st_ctime)
        return {"uri": rel_path, "hash": h, "freshness_seconds": round(max(0, age)), "exists": True}
    except (OSError, PermissionError):
        return {"uri": rel_path, "hash": "", "freshness_seconds": -1, "exists": False}


def is_self_claim_path(rel_path: str) -> bool:
    return rel_path.replace("\\", "/") in _SELF_CLAIM_PATHS


def is_head_bound(root: Path, rel_path: str, head_commit: str) -> bool:
    """Return true only for a tracked, clean path that is present at exact HEAD."""
    if not _GIT_RE.fullmatch(head_commit) or is_self_claim_path(rel_path):
        return False
    tracked = _run_git(root, ["ls-tree", "-r", "--name-only", head_commit, "--", rel_path])
    if tracked is None or tracked.returncode != 0 or not tracked.stdout.strip():
        return False
    worktree = _run_git(root, ["diff", "--quiet", head_commit, "--", rel_path])
    index = _run_git(root, ["diff", "--cached", "--quiet", head_commit, "--", rel_path])
    return bool(worktree and index and worktree.returncode == 0 and index.returncode == 0)


def _parse_time(value: str) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def collect_effective_plan_binding(root: Path) -> dict[str, Any]:
    """Read the ledger named by the current pointer and verify its identity.

    Historical ledgers are intentionally retained, so cardinality is not an
    authority rule.  The current pointer is the authority for selecting the
    active ledger; its path and byte hash must both verify before evidence is
    considered bound.  A one-ledger fallback remains for legacy fixtures that
    predate the current-pointer protocol.
    """
    ledgers = sorted((root / ".agent" / "ledger").glob("*.json"))
    unavailable = {
        "sha256": "", "ledger_uri": "", "ledger_hash": "", "verified": False,
        "reason": "current pointer does not select one readable canonical ledger",
    }
    ledger_path: Path | None = None
    pointer_path = root / ".agent" / "current.json"
    try:
        pointer = json.loads(_read_regular_nofollow(pointer_path).decode("utf-8"))
        canonical = dict(pointer.get("canonical_ledger") or {})
        selected = str(canonical.get("path") or "").replace("\\", "/")
        candidate = Path(selected)
        if (
            selected.startswith(".agent/ledger/")
            and selected.endswith(".json")
            and not candidate.is_absolute()
            and ".." not in candidate.parts
        ):
            resolved = (root / candidate).resolve()
            resolved.relative_to(root.resolve())
            if resolved in [p.resolve() for p in ledgers] and file_hash(resolved) == f"sha256:{str(canonical.get('sha256') or '')}":
                ledger_path = resolved
    except (OSError, ValueError, json.JSONDecodeError):
        ledger_path = None
    if ledger_path is None and len(ledgers) == 1:
        ledger_path = ledgers[0]
    if ledger_path is None:
        return unavailable
    try:
        ledger = json.loads(_read_regular_nofollow(ledger_path).decode("utf-8"))
        identity = dict(ledger.get("effective_plan_identity") or {})
        plan_sha = str(identity.get("sha256") or "")
        canonical = str(identity.get("canonical_json_utf8") or "")
        if not _SHA256_RE.fullmatch(plan_sha) or not canonical or sha256_text(canonical) != plan_sha:
            return {**unavailable, "ledger_uri": ledger_path.relative_to(root).as_posix()}
        pointer_effective = ""
        try:
            pointer_effective = str(dict(json.loads(_read_regular_nofollow(pointer_path).decode("utf-8")).get("canonical_ledger") or {}).get("observed_effective_sha256") or "")
        except (OSError, ValueError, json.JSONDecodeError):
            pass
        if pointer_effective and pointer_effective != plan_sha:
            return {**unavailable, "ledger_uri": ledger_path.relative_to(root).as_posix(), "reason": "current pointer effective-plan SHA does not match ledger"}
        return {
            "sha256": plan_sha,
            "ledger_uri": ledger_path.relative_to(root).as_posix(),
            "ledger_hash": file_hash(ledger_path),
            "verified": True,
            "reason": "current pointer selects a hash-bound ledger whose effective-plan SHA-256 verifies",
        }
    except (OSError, ValueError, json.JSONDecodeError):
        return unavailable


def collect_ci_binding(git_info: dict[str, str], gh_runs: list[dict[str, Any]]) -> dict[str, Any]:
    head_commit = git_info.get("commit", "")
    base = {
        "status": "unavailable", "head_commit": head_commit,
        "freshness_seconds": -1, "run_ids": [], "reason": "no fresh successful CI run for exact HEAD",
    }
    if not _GIT_RE.fullmatch(head_commit):
        return {**base, "reason": "Git HEAD is unavailable"}
    matched = [run for run in gh_runs if run.get("head_sha") == head_commit]
    if not matched:
        return {**base, "reason": "no GitHub Actions run binds exact HEAD"}
    completed = [run for run in matched if str(run.get("status", "")).lower() == "completed"]
    if any(str(run.get("conclusion", "")).lower() != "success" for run in completed):
        return {**base, "status": "failed", "run_ids": [run["id"] for run in completed], "reason": "a completed CI run for exact HEAD failed"}
    successful = [run for run in completed if str(run.get("conclusion", "")).lower() == "success"]
    if not successful:
        return {**base, "status": "pending", "run_ids": [run["id"] for run in matched], "reason": "CI for exact HEAD is not successfully completed"}
    ages = []
    for run in successful:
        timestamp = _parse_time(str(run.get("updated_at") or run.get("started_at") or ""))
        if timestamp is not None:
            ages.append(max(0, round((datetime.now(timezone.utc) - timestamp).total_seconds())))
    if not ages:
        return {**base, "status": "stale", "run_ids": [run["id"] for run in successful], "reason": "successful CI has no verifiable completion freshness"}
    age = min(ages)
    if age > CI_MAX_AGE_SECONDS:
        return {**base, "status": "stale", "freshness_seconds": age, "run_ids": [run["id"] for run in successful], "reason": "successful CI for exact HEAD is stale"}
    return {
        "status": "passed", "head_commit": head_commit, "freshness_seconds": age,
        "run_ids": [run["id"] for run in successful], "reason": "fresh successful CI binds exact HEAD",
    }


def collect_binding(root: Path, git_info: dict[str, str], gh_runs: list[dict[str, Any]]) -> dict[str, Any]:
    plan = collect_effective_plan_binding(root)
    ci = collect_ci_binding(git_info, gh_runs)
    head_commit = git_info.get("commit", "")
    head_verified = bool(_GIT_RE.fullmatch(head_commit))
    return {
        "head_commit": head_commit,
        "head_verified": head_verified,
        "effective_plan": plan,
        "ci": ci,
        "verified": bool(head_verified and plan["verified"] and ci["status"] == "passed"),
    }


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


def candidate_diff_sha256(root: Path, commit: str) -> str:
    result = _run_git(root, ["diff", "--binary", f"{commit}^", commit])
    return sha256_text(result.stdout) if result and result.returncode == 0 else ""


def gather_scores(rubric: list[dict[str, Any]], root: Path) -> dict[str, Any]:
    git_info = gather_git_identity(root)
    gh_runs = gather_gh_runs(root)
    binding = collect_binding(root, git_info, gh_runs)
    ledger_path = binding.get("effective_plan", {}).get("ledger_uri", "")
    ledger_findings: list[dict[str, Any]] = []
    if ledger_path:
        try:
            ledger_findings = list(json.loads(_read_regular_nofollow(root / ledger_path).decode("utf-8")).get("findings") or [])
        except (OSError, ValueError, json.JSONDecodeError):
            pass
    all_evidence: dict[str, dict[str, Any]] = {}
    evidence_kinds: dict[str, set[str]] = {}
    for dim in rubric:
        for check in dim["checks"]:
            path = check["path"]
            kind = check["kind"]
            if path not in all_evidence:
                all_evidence[path] = check_evidence(root, path)
                all_evidence[path]["head_bound"] = is_head_bound(root, path, git_info.get("commit", ""))
            evidence_kinds.setdefault(path, set()).add(kind)
    scored = [{
        "id": d["id"], "label": d["label"], "severity": d["severity"],
        "score": "UNVERIFIED", "status": "UNVERIFIED",
        "evidence_items": [{**all_evidence[c["path"]], "kind": c["kind"]} for c in d["checks"]],
    } for d in rubric]
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
        "_binding": binding,
        "_review": {"status": "UNVERIFIED", "packet": None, "findings": ["review verification unsupported: canonical ledger has no immutable authenticated receipt format"]},
        "_evidence_sources": evidence_sources,
        "dimensions": scored,
    }


def validate_output(output: dict[str, Any], schema_path: Path | None = None, root: Path | None = None, expected_head: str | None = None) -> list[str]:
    errors: list[str] = []
    if not output.get("schema", "").startswith("am0015/scorecard-evidence/"):
        errors.append("missing or wrong schema marker")
    if schema_path is not None:
        try:
            schema = _read_json_nofollow(schema_path)
            try:
                from jsonschema import validate as js_validate, ValidationError as JSError
                js_validate(output, schema)
            except ImportError:
                errors.append("jsonschema dependency unavailable")
            except JSError as e:
                errors.append(f"schema violation: {e.message}")
        except (json.JSONDecodeError, OSError) as e:
            errors.append(f"schema load error: {e}")
    dims = output.get("dimensions", [])
    # Track the rubric dynamically: the invariant is output/rubric agreement,
    # not a frozen count (d14 C4 Visualization retired with the product).
    if len(dims) != len(CANONICAL_DIMENSIONS):
        errors.append(f"expected {len(CANONICAL_DIMENSIONS)} dimensions, got {len(dims)}")
    seen_ids: set[str] = set()
    actual_dimensions = tuple((d.get("id"), d.get("label")) for d in dims if isinstance(d, dict))
    if actual_dimensions != CANONICAL_DIMENSIONS:
        errors.append("dimensions are not the exact ordered AM0015 canonical dimensions")
    gathered_at = _parse_time(str(output.get("_gathered_at") or ""))
    if gathered_at is None:
        errors.append("missing or invalid gather timestamp")
    else:
        age = (datetime.now(timezone.utc) - gathered_at).total_seconds()
        if age < 0 or age > REPORT_MAX_AGE_SECONDS:
            errors.append("scorecard evidence is stale")
    binding = dict(output.get("_binding") or {})
    review = output.get("_review")
    if review != {"status": "UNVERIFIED", "packet": None, "findings": ["review verification unsupported: canonical ledger has no immutable authenticated receipt format"]}:
        errors.append("review must remain canonical UNVERIFIED; local/OIDC verification is unsupported")
    effective_plan = dict(binding.get("effective_plan") or {})
    ci_binding = dict(binding.get("ci") or {})
    if root is not None:
        observed_git = gather_git_identity(root)
        observed_binding = collect_binding(root, observed_git, gather_gh_runs(root))
        if binding != observed_binding:
            errors.append("binding differs from repository/ledger/CI observation")
    if not _GIT_RE.fullmatch(str(binding.get("head_commit") or "")):
        errors.append("binding has no exact Git HEAD")
    if expected_head and binding.get("head_commit") != expected_head:
        errors.append("binding does not match candidate SHA")
    if output.get("_git", {}).get("commit") != binding.get("head_commit"):
        errors.append("Git identity does not match candidate SHA")
    git_identity = output.get("_git", {})
    if not git_identity.get("author"):
        errors.append("commit author identity is missing")
    if not _SHA256_RE.fullmatch(str(effective_plan.get("sha256") or "")):
        errors.append("binding has no effective plan SHA-256")
    for d in dims:
        if d["id"] in seen_ids:
            errors.append(f"duplicate dimension id: {d['id']}")
        seen_ids.add(d["id"])
        if d.get("score") != "UNVERIFIED" or d.get("status") != "UNVERIFIED":
            errors.append(f"{d['id']}: automated score/status forbidden")
        for ev in d.get("evidence_items", []):
            checked = check_evidence(root, str(ev.get("uri") or "")) if root else None
            if checked and (not checked["exists"] or checked["hash"] != ev.get("hash")):
                errors.append(f"{d['id']}: evidence hash/path mismatch: {ev.get('uri', '')}")
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
    parser.add_argument("--output", default=os.environ.get("SCORECARD_OUTPUT", str(CANONICAL_OUTPUT)), help="Output path")
    parser.add_argument("--validate-only", action="store_true", help="Validate existing output")
    parser.add_argument("--validate", action="store_true", help="Validate output after writing")
    parser.add_argument("--validate-schema", action="store_true", help="Validate against JSON Schema (implies --validate)")
    parser.add_argument("--candidate-sha", default=os.environ.get("GITHUB_SHA", ""), help="Expected candidate commit")
    args = parser.parse_args()

    root = Path(args.root).resolve()
    output_path = Path(args.output).absolute()
    schema_path = SCHEMA_PATH if args.validate_schema else None

    if args.validate_only:
        if output_path == CANONICAL_OUTPUT.absolute():
            print("REJECTED: canonical scorecard artifact is stale by policy")
            return 1
        try:
            existing = _read_json_nofollow(output_path)
        except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
            print(f"REJECTED: unsafe or invalid output artifact: {exc}")
            return 1
        errors = validate_output(existing, schema_path=SCHEMA_PATH, root=root, expected_head=args.candidate_sha or None)
        if errors:
            for e in errors:
                print(f"  VALIDATION: {e}")
            return 1
        print(f"VALID: raw AM0015 evidence {output_path}")
        return 0

    report = gather_scores(RUBRIC, root)
    if args.validate or args.validate_schema:
        errors = validate_output(report, schema_path=schema_path, root=root, expected_head=args.candidate_sha or None)
        if errors:
            for e in errors:
                print(f"  VALIDATION: {e}")
            return 1
    write_atomic(output_path, report)
    print(f"WROTE: raw AM0015 evidence -> {output_path}; milestone score UNVERIFIED")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
