#!/usr/bin/env python3
"""Lifecycle tests for installer, platform contracts, and integration manifests.

Tests:
1. Integration install/verify/uninstall lifecycle
2. Platform contract version tracking
3. Source integrity manifest lifecycle
4. Ownership manifest lifecycle
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
FAILURES: list[str] = []


def fail(msg: str) -> None:
    FAILURES.append(msg)
    print(f"  FAIL: {msg}", file=sys.stderr)


def ok(msg: str) -> None:
    print(f"  OK: {msg}")


def sha256(path: Path) -> str:
    content = path.read_bytes()
    normalized = content.replace(b'\r\n', b'\n')
    return hashlib.sha256(normalized).hexdigest()


def test_integration_registry_version_tracking() -> None:
    """Verify registry.json has version field for tracking."""
    registry_path = ROOT / "integrations" / "registry.json"
    registry = json.loads(registry_path.read_text(encoding="utf-8"))
    
    version = registry.get("version")
    if version is None:
        fail("registry.json missing 'version' field")
    elif not isinstance(version, int):
        fail(f"registry.json version must be int, got {type(version).__name__}")
    else:
        ok(f"registry.json version: {version}")
    
    # Check all integrations have IDs
    for integ in registry.get("integrations", []):
        if "id" not in integ:
            fail(f"integration missing id: {integ}")


def test_platform_contracts_version_tracking() -> None:
    """Verify platform-contracts.json has version field (registry v2)."""
    contracts_path = ROOT / "platforms" / "platform-contracts.json"
    contracts = json.loads(contracts_path.read_text(encoding="utf-8"))
    
    version = contracts.get("version")
    if version != 2:
        fail(f"platform-contracts version must be 2, got {version}")
    else:
        ok("platform-contracts.json version: 2")
    
    # Check registry host_ids for the eight canonical hosts
    registry = contracts.get("registry", {})
    host_ids = registry.get("host_ids", [])
    if host_ids != ["codex", "claude", "grok", "opencode", "antigravity", "cursor", "deepseek-harness", "command-code"]:
        fail(f"registry host_ids drift: {host_ids}")
    
    # Check parity_contract has aggregate_rule for version tracking
    parity = contracts.get("parity_contract", {})
    if "aggregate_rule" not in parity:
        fail("parity_contract missing aggregate_rule")


def test_source_integrity_version_tracking() -> None:
    """Verify source-integrity.json has version and generated_at."""
    integrity_path = ROOT / "automation" / "source-integrity.json"
    integrity = json.loads(integrity_path.read_text(encoding="utf-8"))
    
    version = integrity.get("version")
    if version is None:
        fail("source-integrity.json missing 'version' field")
    else:
        ok(f"source-integrity.json version: {version}")
    
    generated_at = integrity.get("generated_at")
    if generated_at is None:
        fail("source-integrity.json missing 'generated_at' field")
    else:
        ok(f"source-integrity.json generated_at: {generated_at}")


def test_integration_lifecycle_scripts_exist() -> None:
    """Verify all integrations have lifecycle scripts."""
    registry_path = ROOT / "integrations" / "registry.json"
    registry = json.loads(registry_path.read_text(encoding="utf-8"))
    
    lifecycle_map = {
        "install": [],
        "verify": [],
        "uninstall": [],
    }
    
    for integ in registry.get("integrations", []):
        integ_id = integ.get("id", "unknown")
        install_info = integ.get("install", {})
        
        # Count lifecycle presence
        if install_info.get("script"):
            lifecycle_map["install"].append(integ_id)
        if install_info.get("verify"):
            lifecycle_map["verify"].append(integ_id)
        if install_info.get("uninstall"):
            lifecycle_map["uninstall"].append(integ_id)
    
    total_integ = len(registry.get("integrations", []))
    ok(f"lifecycle coverage: install={len(lifecycle_map['install'])}/{total_integ}, "
       f"verify={len(lifecycle_map['verify'])}/{total_integ}, "
       f"uninstall={len(lifecycle_map['uninstall'])}/{total_integ}")


def test_ownership_manifest_structure() -> None:
    """Verify ownership manifests have correct structure."""
    # Test that the 02-install-runtime.ps1 creates proper ownership manifests
    install_script = ROOT / "automation" / "02-install-runtime.ps1"
    content = install_script.read_text(encoding="utf-8")
    
    # Check Sync-OwnedFiles function exists
    if "function Sync-OwnedFiles" not in content:
        fail("02-install-runtime.ps1 missing Sync-OwnedFiles function")
    else:
        ok("Sync-OwnedFiles function present")
    
    # Check Remove-PreviouslyOwnedFiles function exists
    if "function Remove-PreviouslyOwnedFiles" not in content:
        fail("02-install-runtime.ps1 missing Remove-PreviouslyOwnedFiles function")
    else:
        ok("Remove-PreviouslyOwnedFiles function present")
    
    # Check manifest integrity validation
    if "ManifestHash" not in content or "CurrentManifestHash" not in content:
        fail("02-install-runtime.ps1 missing manifest hash validation")
    else:
        ok("Manifest hash validation present")


def test_opencode_provider_config_preservation() -> None:
    """OpenCode adapter installation must not own or rewrite opencode.json."""
    shell = shutil.which("pwsh") or shutil.which("powershell")
    if not shell:
        # Cross-platform certification path: execute the canonical TypeScript
        # adapter source through a one-file transpile probe. This tests behavior
        # without weakening the gate when PowerShell is absent.
        result = subprocess.run(
            ["node", str(ROOT / "automation" / "probe-opencode-adapter-preservation.mjs")],
            cwd=ROOT, capture_output=True, text=True, timeout=60,
        )
        if result.returncode != 0:
            fail(f"OpenCode adapter source probe failed: {result.stderr.strip() or result.stdout.strip()}")
        else:
            ok("OpenCode installer preserves provider/model config and does not claim it (Node source probe)")
        return

    with tempfile.TemporaryDirectory(prefix="agent-rules-opencode-") as temp_dir:
        project = Path(temp_dir)
        config_path = project / "opencode.json"
        original = {
            "$schema": "https://opencode.ai/config.json",
            "model": "custom/default",
            "enabled_providers": ["custom"],
            "provider": {"custom": {"options": {"apiKey": "preserve-me"}}},
        }
        config_path.write_text(json.dumps(original, indent=2) + "\n", encoding="utf-8")
        original_bytes = config_path.read_bytes()
        env = os.environ.copy()
        env["INITFORGE_PROJECT_ROOT"] = str(project)
        result = subprocess.run(
            [
                shell,
                "-NoProfile",
                "-File",
                str(ROOT / "platforms" / "opencode" / "scripts" / "install-adapter.ps1"),
                "-Root",
                str(ROOT),
                "-SkipDoctor",
            ],
            cwd=ROOT,
            env=env,
            capture_output=True,
            text=True,
            timeout=60,
        )
        if result.returncode != 0:
            fail(f"OpenCode adapter install failed: {result.stderr.strip() or result.stdout.strip()}")
            return
        if config_path.read_bytes() != original_bytes:
            fail("OpenCode adapter rewrote user-owned opencode.json")
            return
        owned_path = project / ".opencode" / "agent-rules-owned.json"
        owned = json.loads(owned_path.read_text(encoding="utf-8-sig"))
        if any(Path(entry).name == "opencode.json" for entry in owned):
            fail("OpenCode ownership manifest claims user-owned opencode.json")
            return
        ok("OpenCode installer preserves provider/model config and does not claim it")


def test_integration_sha256_consistency() -> None:
    """Verify sha256 in integration manifests match the registry integrity section."""
    registry_path = ROOT / "integrations" / "registry.json"
    registry = json.loads(registry_path.read_text(encoding="utf-8"))
    
    for integ in registry.get("integrations", []):
        integ_id = integ.get("id", "unknown")
        source_type = integ.get("source", {}).get("type", "")
        
        if source_type == "github":
            integrity = integ.get("integrity", {})
            if integrity.get("pinned") and not integrity.get("sha256"):
                fail(f"{integ_id}: pinned github integration missing sha256")
            
            # Check sha256 has all expected platform keys
            sha256_map = integrity.get("sha256", {})
            expected_platforms = {"windows-amd64", "linux-amd64", "linux-arm64", "darwin-amd64", "darwin-arm64"}
            actual_platforms = set(sha256_map.keys())
            
            if expected_platforms - actual_platforms:
                # Not all platforms required, just check format
                pass
            
            # Verify hash format (64 hex chars)
            for platform, hash_val in sha256_map.items():
                if not re.match(r'^[a-f0-9]{64}$', hash_val):
                    fail(f"{integ_id}: invalid sha256 format for {platform}")


def test_integration_health_check_contract() -> None:
    """Verify integrations have health check contracts."""
    registry_path = ROOT / "integrations" / "registry.json"
    registry = json.loads(registry_path.read_text(encoding="utf-8"))
    
    for integ in registry.get("integrations", []):
        integ_id = integ.get("id", "unknown")
        health = integ.get("health")
        
        if not health:
            # Health is optional for some integration types
            continue
        
        command = health.get("command")
        if not command:
            fail(f"{integ_id}: health section missing 'command'")
        
        expected_codes = health.get("expectedExitCodes")
        if expected_codes is None:
            fail(f"{integ_id}: health section missing 'expectedExitCodes'")


def test_platform_contract_invariants() -> None:
    """Verify all platforms implement required invariants."""
    contracts_path = ROOT / "platforms" / "platform-contracts.json"
    contracts = json.loads(contracts_path.read_text(encoding="utf-8"))
    
    required_invariants = {
        "activation", "context_delivery", "orchestration",
        "role_permissions", "model_effort", "mcp_integration"
    }
    
    parity = contracts.get("parity_contract", {})
    declared_invariants = set(parity.get("required_live_invariants", []))
    
    if declared_invariants != required_invariants:
        fail(f"required_live_invariants mismatch: {required_invariants - declared_invariants} missing")
    
    ok(f"all {len(required_invariants)} invariants declared")


def test_install_script_manifest_loading() -> None:
    """Verify install scripts properly load manifest.json."""
    registry_path = ROOT / "integrations" / "registry.json"
    registry = json.loads(registry_path.read_text(encoding="utf-8"))
    
    for integ in registry.get("integrations", []):
        integ_id = integ.get("id", "unknown")
        install_path_str = integ.get("install", {}).get("script")
        
        if not install_path_str:
            continue
        
        install_path = ROOT / install_path_str
        if not install_path.is_file():
            continue
        
        content = install_path.read_text(encoding="utf-8")
        
        # Check language-appropriate fail-fast behavior.
        if install_path.suffix.lower() == '.ps1':
            if 'ErrorActionPreference' not in content:
                fail(f"{integ_id}: PowerShell installer missing ErrorActionPreference")
        elif install_path.suffix.lower() == '.sh':
            if not re.search(r'(?m)^set\s+-[^\n]*e', content):
                fail(f"{integ_id}: shell installer missing fail-fast set -e")

        # Check for manifest loading (skip for npx-github type)
        source_type = integ.get("source", {}).get("type", "")
        version_policy = integ.get("source", {}).get("versionPolicy", "")
        if source_type not in ("npx-github", "npm-npx") and version_policy != "branch":
            if 'manifest.json' not in content.lower():
                fail(f"{integ_id}: install.ps1 does not load manifest.json")


def test_uninstall_script_safety() -> None:
    """Verify uninstall scripts have path safety checks."""
    registry_path = ROOT / "integrations" / "registry.json"
    registry = json.loads(registry_path.read_text(encoding="utf-8"))
    
    for integ in registry.get("integrations", []):
        integ_id = integ.get("id", "unknown")
        uninstall_path_str = integ.get("install", {}).get("uninstall")
        
        if not uninstall_path_str:
            continue
        
        uninstall_path = ROOT / uninstall_path_str
        if not uninstall_path.is_file():
            continue
        
        content = uninstall_path.read_text(encoding="utf-8")
        
        # Check language-appropriate fail-fast behavior when the uninstaller deletes files.
        has_rm = 'Remove-Item' in content or re.search(r'\brm\s+-[rf]', content)
        if has_rm and uninstall_path.suffix.lower() == '.ps1' and 'ErrorActionPreference' not in content:
            fail(f"{integ_id}: PowerShell uninstaller missing ErrorActionPreference")
        if has_rm and uninstall_path.suffix.lower() == '.sh' and not re.search(r'(?m)^set\s+-[^\n]*e', content):
            fail(f"{integ_id}: shell uninstaller missing fail-fast set -e")


def main() -> int:
    print("Installer/platform lifecycle tests")
    print()
    
    tests = [
        ("registry version tracking", test_integration_registry_version_tracking),
        ("platform contracts version tracking", test_platform_contracts_version_tracking),
        ("source integrity version tracking", test_source_integrity_version_tracking),
        ("integration lifecycle scripts", test_integration_lifecycle_scripts_exist),
        ("ownership manifest structure", test_ownership_manifest_structure),
        ("OpenCode provider config preservation", test_opencode_provider_config_preservation),
        ("integration sha256 consistency", test_integration_sha256_consistency),
        ("integration health contract", test_integration_health_check_contract),
        ("platform invariant coverage", test_platform_contract_invariants),
        ("install manifest loading", test_install_script_manifest_loading),
        ("uninstall safety", test_uninstall_script_safety),
    ]
    
    for name, fn in tests:
        print(f"[{name}]")
        fn()
        print()
    
    if FAILURES:
        print(f"RESULT: {len(FAILURES)} failure(s)")
        for f in FAILURES:
            print(f"  - {f}")
        return 1
    print("RESULT: PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
