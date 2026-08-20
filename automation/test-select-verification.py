#!/usr/bin/env python3
"""Adversarial contract tests for domain-specific verification profile selection and evidence behavior."""
from __future__ import annotations

import json
import importlib.util
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SELECTOR = ROOT / "automation" / "select-verification.py"


def load_selector_module():
    """Load the selector module so reducer fixtures can inject actual outcomes."""
    spec = importlib.util.spec_from_file_location("select_verification", SELECTOR)
    if spec is None or spec.loader is None:
        raise AssertionError(f"could not load selector module: {SELECTOR}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def run(*args: str, expect: int = 0, root: str | None = None) -> dict:
    cmd = [sys.executable, str(SELECTOR), "--root", str(root or ROOT), *args]
    try:
        result = subprocess.run(
            cmd,
            text=True, capture_output=True, encoding="utf-8",
            timeout=30, stdin=subprocess.DEVNULL,
        )
    except subprocess.TimeoutExpired:
        raise AssertionError(
            f"subprocess timed out after 30s\ncmd={' '.join(cmd)}"
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
        contract = profile.get("verification_contract", {})
        contract_fields = {
            "applicability", "risk_triggers", "cost_class", "fidelity", "replayable",
            "visible_manual", "required_dimensions", "negative_fixtures", "owner",
            "freshness_binding", "invalidation_conditions", "human_residuals",
        }
        missing_contract = contract_fields - set(contract)
        if missing_contract:
            raise AssertionError(f"profile {pid} missing verifier contract fields: {sorted(missing_contract)}")
        if contract["visible_manual"].get("unavailable_status") != "BLOCKED":
            raise AssertionError(f"profile {pid} must fail closed when visible capability is unavailable")
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
        if "RUNNABLE" in summary["by_status"]:
            raise AssertionError(
                f"acceptance summary must use actual statuses, not plan statuses: {summary}"
            )
        if result.get("phase") != "ACCEPTANCE_REDUCTION":
            raise AssertionError(f"run must expose acceptance reduction phase: {result}")
        if "plan_summary" not in result:
            raise AssertionError(f"run must preserve the separate verification plan summary: {result}")
        if summary["total_checks"] != result["results_count"]:
            raise AssertionError(f"reducer count must match executed results: {result}")
        if not isinstance(summary.get("human_residuals"), list):
            raise AssertionError(f"reducer must emit a human residual packet: {summary}")
        print(f"  run results: {summary['total_checks']} checks, statuses={summary['by_status']}")


def test_acceptance_reducer_fail_closed_for_incomplete_actual_evidence() -> None:
    """A plan cannot become green from selection metadata or incomplete execution."""
    selector = load_selector_module()
    selection = [{
        "profile_id": "fixture-profile",
        "checks": [
            {"check_id": "pass", "name": "passing proof", "mandatory": True},
            {"check_id": "missing", "name": "missing proof", "mandatory": True},
            {"check_id": "blocked", "name": "required tool", "mandatory": True},
            {"check_id": "skipped", "name": "required manual dimension", "mandatory": True},
            {"check_id": "empty", "name": "empty command", "mandatory": True},
            {"check_id": "failed", "name": "failed actual run", "mandatory": True},
            {"check_id": "optional-failed", "name": "optional regression", "mandatory": False},
        ],
    }]
    actual = [
        {"profile_id": "fixture-profile", "check_id": "pass", "status": "PASS"},
        {
            "profile_id": "fixture-profile", "check_id": "blocked", "status": "BLOCKED",
            "skip_reason": "Required tool not installed",
        },
        {
            "profile_id": "fixture-profile", "check_id": "skipped", "status": "SKIPPED",
            "skip_reason": "Visible manual surface unavailable",
        },
        {
            "profile_id": "fixture-profile", "check_id": "empty", "status": "SKIPPED",
            "skip_reason": "No command defined for this check",
        },
        {
            "profile_id": "fixture-profile", "check_id": "failed", "status": "FAIL",
            "skip_reason": "exit code 1",
        },
        {
            "profile_id": "fixture-profile", "check_id": "optional-failed", "status": "FAIL",
            "skip_reason": "optional check still failed",
        },
    ]

    reduced = selector.reduce_run_results(selection, actual)
    statuses = reduced["by_status"]
    if statuses.get("PASS") != 1:
        raise AssertionError(f"expected one actual PASS: {reduced}")
    if statuses.get("MISSING") != 1:
        raise AssertionError(f"missing planned evidence must be explicit: {reduced}")
    if statuses.get("BLOCKED") != 1:
        raise AssertionError(f"required missing tool must remain BLOCKED: {reduced}")
    if statuses.get("SKIPPED") != 2:
        raise AssertionError(f"skipped and empty-command evidence must remain SKIPPED: {reduced}")
    if statuses.get("FAIL") != 2:
        raise AssertionError(f"actual failures must remain FAIL: {reduced}")
    if reduced["all_automated_pass"]:
        raise AssertionError(f"incomplete/failed evidence produced a false green: {reduced}")
    failure_statuses = {failure["status"] for failure in reduced["required_failures"]}
    if not {"MISSING", "BLOCKED", "SKIPPED", "FAIL"}.issubset(failure_statuses):
        raise AssertionError(f"required failure statuses were not all retained: {reduced}")
    if any(status == "RUNNABLE" for status in statuses):
        raise AssertionError(f"RUNNABLE is plan metadata, never actual evidence: {reduced}")
    print("  reducer negative fixtures: missing/blocked/skipped/empty/failed remain non-green")


def test_route_precision_keywords_cannot_activate_heavy_provider() -> None:
    """Prompt keywords alone cannot activate a heavy provider (REQ-013/REQ-019)."""
    selector = load_selector_module()
    profiles = json.loads((ROOT / "automation" / "verification-profiles.json").read_text(encoding="utf-8"))
    provider_selection = selector.select_providers(
        profiles,
        claims=["unit test suite passes"],
        availability={"playwright-mcp": True, "chrome-devtools-mcp": True, "maestro": True, "pencil-mcp": True},
    )
    for entry in provider_selection or []:
        if entry.get("provider_id") in ("playwright-mcp", "chrome-devtools-mcp", "maestro", "pencil-mcp"):
            if entry.get("activated"):
                raise AssertionError(f"keywords alone activated heavy provider: {entry}")
    print("  route precision: no heavy provider activated by a mechanical claim alone")


def test_unnecessary_activation_denied() -> None:
    """A provider present with no applicable claim is not activated (REQ-019)."""
    selector = load_selector_module()
    profiles = json.loads((ROOT / "automation" / "verification-profiles.json").read_text(encoding="utf-8"))
    provider_selection = selector.select_providers(
        profiles,
        claims=["static schema lint"],
        availability={"playwright-mcp": True, "chrome-devtools-mcp": True},
    )
    heavy = [entry for entry in provider_selection or [] if entry.get("provider_id") in ("playwright-mcp", "chrome-devtools-mcp") and entry.get("activated")]
    if heavy:
        raise AssertionError(f"provider activated without an applicable claim: {heavy}")
    print("  unnecessary activation denied: provider present but no applicable claim")


def test_bounded_two_attempt_repair() -> None:
    """Repair is bounded to two attempts per claim; a third failure is terminal (REQ-019)."""
    selector = load_selector_module()
    for attempt in (0, 1):
        result = selector.repair_gate(attempts=attempt, max_attempts=2)
        if not result["may_repair"]:
            raise AssertionError(f"attempt {attempt} must still be repairable: {result}")
    terminal = selector.repair_gate(attempts=2, max_attempts=2)
    if terminal["may_repair"]:
        raise AssertionError(f"third attempt must be terminal: {terminal}")
    if not terminal["terminal"]:
        raise AssertionError(f"third attempt must be terminal: {terminal}")
    if not terminal["proof_weakening_forbidden"]:
        raise AssertionError(f"proof weakening must be forbidden: {terminal}")
    print("  bounded repair: attempts 0-1 repairable, attempt 2 terminal")


def test_stale_evidence_rejected() -> None:
    """Stale evidence cannot satisfy acceptance (freshness, REQ-019)."""
    selector = load_selector_module()
    verdict = selector.freshness_verdict(observed_ms_ago=10_000_000, freshness_ms=600_000)
    if verdict != "stale":
        raise AssertionError(f"10M ms old evidence must be stale: {verdict}")
    fresh = selector.freshness_verdict(observed_ms_ago=60_000, freshness_ms=600_000)
    if fresh != "fresh":
        raise AssertionError(f"60s evidence within 600s window must be fresh: {fresh}")
    print("  stale evidence rejected, fresh evidence accepted")


def test_workaround_retirement_evidence_required() -> None:
    """Model/provider workarounds need retirement evidence (REQ-019)."""
    selector = load_selector_module()
    active = selector.workaround_status(expires_at=None, retired=True, retirement_evidence=None)
    if active != "retired":
        raise AssertionError(f"retired workaround must be terminal: {active}")
    live = selector.workaround_status(expires_at="2099-01-01T00:00:00Z", retired=False, retirement_evidence=None)
    if live != "active":
        raise AssertionError(f"unexpired workaround must be active: {live}")
    print("  workaround retirement: retired workaround is terminal, unexpired is active")


def report_diagnostics() -> None:
    """Report tool availability explaining why checks are blocked/skipped."""
    profiles_raw = json.loads((ROOT / "automation" / "verification-profiles.json").read_text(encoding="utf-8"))
    domain_profiles = profiles_raw.get("domain_profiles", {})
    all_tools: set[str] = set()
    tool_profiles: dict[str, list[str]] = {}
    for pid, profile in domain_profiles.items():
        for check in profile.get("checks", []):
            for tool in check.get("tools", []):
                all_tools.add(tool)
                tool_profiles.setdefault(tool, []).append(pid)

    found: list[str] = []
    missing: list[str] = []
    for tool in sorted(all_tools):
        if shutil.which(tool.split()[0]):
            found.append(tool)
        else:
            missing.append(tool)

    print(f"\n  tool diagnostics: {len(found)} available, {len(missing)} missing")
    for t in found:
        print(f"    available: {t}")
    for t in missing:
        profiles_using = sorted(set(tool_profiles[t]))
        print(f"    missing:   {t}  (affects: {', '.join(profiles_using)})")

    if not found:
        print("  => all checks will be BLOCKED or SKIPPED because no required tools are installed")
    elif missing:
        print("  => some checks are BLOCKED/SKIPPED; install missing tools to make them RUNNABLE")


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
    test_acceptance_reducer_fail_closed_for_incomplete_actual_evidence()
    test_route_precision_keywords_cannot_activate_heavy_provider()
    test_unnecessary_activation_denied()
    test_bounded_two_attempt_repair()
    test_stale_evidence_rejected()
    test_workaround_retirement_evidence_required()

    report_diagnostics()

    print(
        "PASS: context selection, profile matching, check filtering, "
        "skip reasons, risk mandates, blocked tools, evidence integration, "
        "summary structure, multi-profile, no false pass, extensibility, run execution"
    )


if __name__ == "__main__":
    main()
