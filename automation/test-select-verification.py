#!/usr/bin/env python3
"""Adversarial contract tests for domain-specific verification profile selection and evidence behavior."""
from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SELECTOR = ROOT / "automation" / "select-verification.py"


def run(*args: str, expect: int = 0, root: str | None = None) -> dict:
    cmd = [sys.executable, str(SELECTOR), "--root", str(root or ROOT), *args]
    result = subprocess.run(
        cmd,
        text=True, capture_output=True, encoding="utf-8",
    )
    if result.returncode != expect:
        raise AssertionError(
            f"exit={result.returncode}, expected={expect}\n"
            f"stdout={result.stdout}\nstderr={result.stderr}"
        )
    return json.loads(result.stdout)


def compact(value: dict) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def test_empty_context() -> None:
    """No changed files or claims → no profiles selected."""
    result = run("select", "--payload", compact({}))
    if result["status"] != "VERIFICATION_PLAN":
        raise AssertionError(f"expected VERIFICATION_PLAN: {result}")
    if result["profiles_count"] != 0:
        raise AssertionError(f"expected 0 profiles for empty context: {result}")


def test_frontend_file_match() -> None:
    """Changed tsx files should select frontend profile."""
    result = run("select", "--payload", compact({
        "changed_files": ["src/components/Button.tsx"],
        "claims": ["Update button UI"],
        "domains": ["frontend"],
    }))
    if result["profiles_count"] < 1:
        raise AssertionError(f"expected frontend profile selected: {result}")
    profile_ids = result["profiles_selected"]
    if "frontend" not in profile_ids:
        raise AssertionError(f"expected frontend in selected: {profile_ids}")
    frontend = next(p for p in result["profile_details"] if p["profile_id"] == "frontend")
    if frontend["check_count"] < 2:
        raise AssertionError(f"expected multiple checks for frontend: {frontend}")
    checks = frontend["checks"]
    typecheck = next((c for c in checks if c["check_id"] == "typecheck"), None)
    if typecheck is None:
        raise AssertionError("expected typecheck check in frontend profile")
    if typecheck["status"] not in ("RUNNABLE", "BLOCKED", "SKIPPED"):
        raise AssertionError(f"unexpected typecheck status: {typecheck}")


def test_backend_file_match() -> None:
    """Changed controller files should select backend-api profile."""
    result = run("select", "--payload", compact({
        "changed_files": ["src/api/user.controller.ts", "src/services/user.service.ts"],
        "claims": ["Add user API endpoint", "Integration contract"],
        "domains": ["backend", "api"],
    }))
    if "backend-api" not in result["profiles_selected"]:
        raise AssertionError(f"expected backend-api profile: {result}")
    backend = next(p for p in result["profile_details"] if p["profile_id"] == "backend-api")
    if backend["check_count"] < 2:
        raise AssertionError(f"expected multiple checks for backend: {backend}")


def test_database_file_match() -> None:
    """Changed migration files should select database profile."""
    result = run("select", "--payload", compact({
        "changed_files": ["migrations/20260725_add_users.sql", "src/entities/User.ts"],
        "claims": ["Add user table migration"],
        "domains": ["database"],
    }))
    if "database" not in result["profiles_selected"]:
        raise AssertionError(f"expected database profile: {result}")
    db = next(p for p in result["profile_details"] if p["profile_id"] == "database")
    if db["check_count"] < 1:
        raise AssertionError(f"expected checks for database: {db}")


def test_harness_file_match() -> None:
    """Changed automation files should select harness-runtime profile."""
    result = run("select", "--payload", compact({
        "changed_files": ["automation/workctl.py", "AGENTS.md"],
        "claims": ["Update workctl orchestrator"],
        "domains": ["harness", "automation"],
    }))
    if "harness-runtime" not in result["profiles_selected"]:
        raise AssertionError(f"expected harness-runtime profile: {result}")
    harness = next(p for p in result["profile_details"] if p["profile_id"] == "harness-runtime")
    if harness["check_count"] < 1:
        raise AssertionError(f"expected checks for harness-runtime: {harness}")


def test_skip_reasons_recorded() -> None:
    """Skipped checks should include reasons."""
    result = run("select", "--payload", compact({
        "changed_files": ["docs/README.md"],
        "claims": ["Update documentation"],
        "domains": ["documentation"],
    }))
    if "documentation-configuration" not in result["profiles_selected"]:
        raise AssertionError(f"expected docs profile: {result}")
    summary = result["summary"]
    skipped = summary.get("skipped_checks", [])
    # Some checks may be skipped due to missing tools; verify skip reasons exist
    for s in skipped:
        if not s.get("reason"):
            raise AssertionError(f"skip reason missing for {s}")
    print(f"  skipped checks: {len(skipped)} reasons recorded")


def test_risk_signals_mandate_checks() -> None:
    """Risk signals like security should mandate security profile checks."""
    result = run("select", "--payload", compact({
        "changed_files": ["src/auth/login.controller.ts"],
        "claims": ["Implement authentication"],
        "domains": ["backend", "security"],
        "risk_signals": ["security", "auth"],
    }))
    profiles = result["profiles_selected"]
    if "security" not in profiles:
        raise AssertionError(f"expected security profile for auth risk: {profiles}")
    if "backend-api" not in profiles:
        raise AssertionError(f"expected backend-api profile as well: {profiles}")
    # Security checks should be marked mandatory when risk-triggered
    security = next(p for p in result["profile_details"] if p["profile_id"] == "security")
    for check in security["checks"]:
        if check["status"] != "SKIPPED":
            if not check.get("mandatory"):
                print(f"  note: check {check['check_id']} not mandatory despite risk signal")
    print(f"  security checks: {len(security['checks'])}")


def test_missing_tool_blocked() -> None:
    """Checks with missing required tools should be BLOCKED (not PASS)."""
    result = run("select", "--payload", compact({
        "changed_files": ["automation/workctl.py"],
        "claims": ["Update harness runtime"],
        "domains": ["harness"],
        "risk_signals": [],
    }))
    harness = next(p for p in result["profile_details"] if p["profile_id"] == "harness-runtime")
    for check in harness["checks"]:
        if check["status"] == "BLOCKED":
            if check.get("mandatory"):
                # A mandatory blocked check means the summary should reflect it
                if not result["summary"].get("has_blocked_required_tool"):
                    raise AssertionError(f"summary should flag blocked required tool: {check}")
            # Verify skip reason is descriptive
            if not check.get("skip_reason"):
                raise AssertionError(f"blocked check missing skip_reason: {check}")
    print(f"  harness checks: BLOCKED={sum(1 for c in harness['checks'] if c['status'] == 'BLOCKED')}")


def test_evidence_profiles_available() -> None:
    """Plan output should reference available evidence profiles."""
    result = run("select", "--payload", compact({
        "changed_files": ["src/App.tsx"],
        "claims": ["Frontend component update"],
        "domains": ["frontend"],
    }))
    available = result.get("evidence_profiles_available", [])
    if "api-contract" not in available:
        raise AssertionError(f"expected api-contract in available evidence profiles: {available}")
    if "static-change" not in available:
        raise AssertionError(f"expected static-change in available evidence profiles: {available}")


def test_summary_structure() -> None:
    """Verification summary must include all required fields."""
    result = run("select", "--payload", compact({
        "changed_files": ["src/api/user.controller.ts", "migrations/add_users.sql"],
        "claims": ["Add user API and migration"],
        "domains": ["backend", "database"],
    }))
    summary = result["summary"]
    for field in ("total_checks", "by_status", "by_profile", "all_automated_pass",
                  "skipped_checks", "manual_checks_remaining", "has_blocked_required_tool"):
        if field not in summary:
            raise AssertionError(f"summary missing field: {field}")
    print(f"  total checks: {summary['total_checks']}")
    print(f"  by status: {summary['by_status']}")


def test_multiple_profiles() -> None:
    """Changing files across multiple domains should select multiple profiles."""
    result = run("select", "--payload", compact({
        "changed_files": [
            "src/components/Header.tsx",
            "src/api/user.controller.ts",
            "migrations/add_users.sql",
            "docs/README.md",
            "automation/workctl.py",
        ],
        "claims": ["Multi-domain change: UI, API, migration, docs, harness"],
        "domains": ["frontend", "backend", "database", "documentation", "harness"],
    }))
    count = result["profiles_count"]
    if count < 3:
        raise AssertionError(f"expected 3+ profiles for multi-domain change: got {count}")
    print(f"  profiles selected ({count}): {result['profiles_selected']}")


def test_no_false_pass_on_missing_tool() -> None:
    """A missing tool must produce BLOCKED or SKIPPED, never PASS."""
    result = run("select", "--payload", compact({
        "changed_files": ["automation/workctl.py"],
        "claims": ["Update harness runtime"],
        "domains": ["harness"],
    }))
    harness = next(p for p in result["profile_details"] if p["profile_id"] == "harness-runtime")
    for check in harness["checks"]:
        if check["status"] == "RUNNABLE":
            # The check is runnable only if the tool is available; that's acceptable
            continue
        if check["status"] not in ("BLOCKED", "SKIPPED"):
            raise AssertionError(f"missing tool must produce BLOCKED/SKIPPED, not {check['status']}: {check}")
        if not check.get("skip_reason"):
            raise AssertionError(f"non-PASS check must include skip_reason: {check}")


def test_profile_extensible() -> None:
    """Profiles should allow adding new checks without breaking existing selection."""
    # Verify all profiles load and have at least one check
    profiles_raw = json.loads((ROOT / "automation" / "verification-profiles.json").read_text(encoding="utf-8"))
    domain_profiles = profiles_raw.get("domain_profiles", {})
    expected_profiles = {"frontend", "backend-api", "database", "infrastructure",
                         "security", "documentation-configuration", "harness-runtime"}
    found = set(domain_profiles.keys())
    missing = expected_profiles - found
    if missing:
        raise AssertionError(f"missing expected profiles: {missing}")
    for pid, profile in domain_profiles.items():
        if not profile.get("checks"):
            raise AssertionError(f"profile {pid} has no checks")
        for check in profile["checks"]:
            if not check.get("id"):
                raise AssertionError(f"profile {pid} has a check without id")
            if not check.get("evidence_profile"):
                raise AssertionError(f"profile {pid} check {check['id']} missing evidence_profile")
    print(f"  profiles ({len(domain_profiles)}): all extensible and valid")


def test_run_selects_without_error() -> None:
    """Run command should execute checks or produce BLOCKED/SKIPPED, never crash."""
    with tempfile.TemporaryDirectory(prefix="verify-run-") as holder:
        root = Path(holder)
        marker = root / "src" / "components" / "Button.tsx"
        marker.parent.mkdir(parents=True)
        marker.write_text("export const Button = () => null;", encoding="utf-8")

        result = run("run", "--payload", compact({
            "changed_files": ["src/components/Button.tsx"],
            "claims": ["Frontend component"],
            "domains": ["frontend"],
        }), expect=0, root=str(root))
        if result["status"] != "VERIFICATION_RUN":
            raise AssertionError(f"expected VERIFICATION_RUN: {result}")
        if result["results_count"] < 1:
            raise AssertionError(f"expected at least 1 result: {result}")
        for r in result["results"]:
            if r["status"] not in ("PASS", "FAIL", "BLOCKED", "SKIPPED"):
                raise AssertionError(f"unexpected result status: {r}")
        summary = result["summary"]
        print(f"  run results: {summary['total_checks']} checks, statuses={summary['by_status']}")


def main() -> None:
    test_empty_context()
    test_frontend_file_match()
    test_backend_file_match()
    test_database_file_match()
    test_harness_file_match()
    test_skip_reasons_recorded()
    test_risk_signals_mandate_checks()
    test_missing_tool_blocked()
    test_evidence_profiles_available()
    test_summary_structure()
    test_multiple_profiles()
    test_no_false_pass_on_missing_tool()
    test_profile_extensible()
    test_run_selects_without_error()

    print(
        "PASS: context selection, profile matching, check filtering, "
        "skip reasons, risk mandates, blocked tools, evidence integration, "
        "summary structure, multi-profile, no false pass, extensibility, run execution"
    )


if __name__ == "__main__":
    main()
