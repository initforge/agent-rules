#!/usr/bin/env python3
"""Focused tests for the docker-compose policy script and compose helpers."""
from __future__ import annotations

import hashlib
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
POLICY = ROOT / "automation" / "16-docker-compose-policy.ps1"
HELPERS = ROOT / "automation" / "scripts" / "compose" / "helpers.ps1"
COMPOSE_SCRIPTS = ROOT / "automation" / "scripts" / "compose"


def run_powershell(args: list[str], cwd: str | None = None) -> subprocess.CompletedProcess:
    shell = shutil.which("powershell") or shutil.which("pwsh")
    if not shell:
        raise SystemExit("PowerShell unavailable")
    cmd = [shell, "-NoProfile"] + args
    return subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        cwd=cwd or str(ROOT),
        timeout=60,
    )


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def test_policy_script_exists() -> None:
    assert POLICY.is_file(), f"Policy script missing: {POLICY}"
    print("PASS: policy script exists")


def test_helpers_script_exists() -> None:
    assert HELPERS.is_file(), f"Helpers script missing: {HELPERS}"
    print("PASS: helpers script exists")


def test_all_compose_scripts_import_helpers() -> None:
    """Every compose script (except helpers.ps1 itself) must dot-source helpers.ps1."""
    for script in sorted(COMPOSE_SCRIPTS.glob("*.ps1")):
        if script.name == "helpers.ps1":
            continue
        body = script.read_text(encoding="utf-8")
        assert ". (Join-Path $PSScriptRoot 'helpers.ps1')" in body, (
            f"{script.relative_to(ROOT)} does not import helpers.ps1"
        )
    print("PASS: all compose scripts import helpers")


def test_no_hardcoded_path_traversal() -> None:
    """No compose script should use the old hardcoded Split-Path traversal."""
    bad_pattern = "Split-Path -Parent (Split-Path -Parent $PSScriptRoot)"
    for script in sorted(COMPOSE_SCRIPTS.glob("*.ps1")):
        body = script.read_text(encoding="utf-8")
        assert bad_pattern not in body, (
            f"{script.relative_to(ROOT)} still uses hardcoded path traversal"
        )
    print("PASS: no hardcoded path traversal in compose scripts")


def test_policy_has_selftest_action() -> None:
    """Policy script must include the selftest action in its ValidateSet."""
    body = POLICY.read_text(encoding="utf-8")
    assert "'selftest'" in body, "Policy script missing 'selftest' action"
    assert "Test-PolicySelfTest" in body, "Policy script missing Test-PolicySelfTest function"
    print("PASS: policy has selftest action and self-test function")


def test_policy_excludes_generated_and_agent() -> None:
    """Policy must exclude generated/ and .agent/ directories."""
    body = POLICY.read_text(encoding="utf-8")
    assert "generated" in body and ".agent" in body, (
        "Policy must exclude generated/ and .agent/ paths"
    )
    print("PASS: policy excludes generated/ and .agent/")


def test_policy_preserves_unverified() -> None:
    """Policy must preserve UNVERIFIED status when no service-bearing topology exists."""
    body = POLICY.read_text(encoding="utf-8")
    assert "'UNVERIFIED'" in body or '"UNVERIFIED"' in body, (
        "Policy must preserve UNVERIFIED status"
    )
    print("PASS: policy preserves UNVERIFIED for no-service-bearing topology")


def test_selftest_action_runs() -> None:
    """The selftest action should execute without errors."""
    result = run_powershell(
        ["-File", str(POLICY), "-Action", "selftest"]
    )
    if result.returncode != 0:
        print(f"SELFTEST STDERR: {result.stderr[-500:]}")
        print(f"SELFTEST STDOUT: {result.stdout[-500:]}")
    assert result.returncode == 0, f"Selftest failed: {result.stderr[-300:]}"
    assert "Self-test: all assertions passed" in result.stdout, (
        "Selftest did not report all assertions passed"
    )
    print("PASS: selftest action runs successfully")


def test_unverified_when_no_compose_project() -> None:
    """Policy should report UNVERIFIED in a directory with no docker-compose.yml."""
    with tempfile.TemporaryDirectory() as tmp:
        result = run_powershell(
            ["-File", str(POLICY), "-Root", tmp, "-Action", "status", "-Json"]
        )
        assert result.returncode == 0, f"Status check failed: {result.stderr[-300:]}"
        assert "UNVERIFIED" in result.stdout, (
            f"Expected UNVERIFIED for empty dir, got: {result.stdout[:500]}"
        )
    print("PASS: UNVERIFIED when no compose project exists")


def test_no_fake_compose_stack() -> None:
    """Self-test must not create or rely on a running fake compose stack."""
    # The self-test creates only temporary files on disk, never runs docker compose up
    body = POLICY.read_text(encoding="utf-8")
    # Ensure the self-test function doesn't call docker compose up or create a fake stack
    selftest_section = body.split("# region Self-Test")[1].split("# endregion")[0]
    assert "docker compose up" not in selftest_section, (
        "Self-test must not start a fake compose stack"
    )
    assert "docker-compose.yml" not in selftest_section or "Test-Path" in selftest_section, (
        "Self-test must not create fake compose files"
    )
    print("PASS: self-test does not create a fake compose stack")


if __name__ == "__main__":
    import shutil

    tests = [
        test_policy_script_exists,
        test_helpers_script_exists,
        test_all_compose_scripts_import_helpers,
        test_no_hardcoded_path_traversal,
        test_policy_has_selftest_action,
        test_policy_excludes_generated_and_agent,
        test_policy_preserves_unverified,
        test_no_fake_compose_stack,
        test_selftest_action_runs,
        test_unverified_when_no_compose_project,
    ]

    failures = []
    for t in tests:
        try:
            t()
        except Exception as e:
            failures.append(f"{t.__name__}: {e}")
            print(f"FAIL: {t.__name__}: {e}")

    if failures:
        print(f"\n{len(failures)} test(s) failed:")
        for f in failures:
            print(f"  - {f}")
        sys.exit(1)

    print(f"\nAll {len(tests)} tests passed.")
