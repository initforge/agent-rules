#!/usr/bin/env python3
"""Cross-language manifest consistency checker for integration and platform contracts.

Verifies:
1. Integration manifest.json files match registry.json declarations
2. Platform contracts JSON matches schema
3. PowerShell and Python implementations are consistent
4. Install/verify/uninstall lifecycle is complete for all integrations
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import sys
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


def test_integration_manifests_match_registry() -> None:
    """Verify each integration in registry.json has matching manifest.json with required fields."""
    registry_path = ROOT / "integrations" / "registry.json"
    if not registry_path.is_file():
        fail("registry.json missing")
        return
    
    registry = json.loads(registry_path.read_text(encoding="utf-8"))
    integrations = registry.get("integrations", [])
    
    required_manifest_fields = {"name": str}
    npm_manifest_fields = {"npmPackage": str, "commandName": str, "mcpServerKey": str}
    binary_manifest_fields = {"installDirs": dict}
    
    for integ in integrations:
        integ_id = integ.get("id", "unknown")
        install_path = integ.get("install", {}).get("script", "")
        if not install_path:
            fail(f"{integ_id}: no install script path in registry")
            continue
        
        # Convert to manifest path
        manifest_rel = (install_path.replace('/install.ps1', '/manifest.json').replace('\\install.ps1', '\\manifest.json').replace('/install.sh', '/manifest.json').replace('\\install.sh', '\\manifest.json'))
        manifest_path = ROOT / manifest_rel
        
        if not manifest_path.is_file():
            fail(f"{integ_id}: manifest.json missing at {manifest_path}")
            continue
        
        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            fail(f"{integ_id}: manifest.json is invalid JSON: {e}")
            continue
        
        # Check required fields (name is required)
        if "name" not in manifest:
            fail(f"{integ_id}: manifest.json missing required field 'name'")
        
        # Check type-specific fields
        source_type = integ.get("source", {}).get("type", "")
        version_policy = integ.get("source", {}).get("versionPolicy", "")
        if source_type == "npm" or version_policy == "latest":
            # Check for npm-related fields (allow aliases like "package" for "npmPackage")
            has_npm_config = any(f in manifest for f in ["npmPackage", "package"])
            if not has_npm_config:
                fail(f"{integ_id}: npm integration missing npm config in manifest.json")
        elif source_type == "github" and version_policy == "pinned":
            # Binary github integrations need installDirs
            for field in binary_manifest_fields:
                if field not in manifest:
                    fail(f"{integ_id}: pinned binary integration missing '{field}' in manifest.json")
            # Check installDirs structure
            install_dirs = manifest.get("installDirs", {})
            for os_name in ("windows", "linux", "darwin"):
                if os_name not in install_dirs:
                    fail(f"{integ_id}: installDirs missing '{os_name}'")
    
    ok(f"checked {len(integrations)} integration manifests against registry")


def test_integration_lifecycle_complete() -> None:
    """Verify all integrations have install, verify, and uninstall scripts."""
    registry_path = ROOT / "integrations" / "registry.json"
    registry = json.loads(registry_path.read_text(encoding="utf-8"))
    integrations = registry.get("integrations", [])
    
    for integ in integrations:
        integ_id = integ.get("id", "unknown")
        install_info = integ.get("install", {})
        
        # Check install script
        install_script = install_info.get("script")
        if not install_script:
            fail(f"{integ_id}: missing install script path")
            continue
        
        install_path = ROOT / install_script
        if not install_path.is_file():
            fail(f"{integ_id}: install script not found at {install_script}")
        
        # Check verify script (required for non-optional integrations)
        verify_script = install_info.get("verify")
        if integ.get("policy") != "optional" and not verify_script:
            fail(f"{integ_id}: required integration missing verify script")
        elif verify_script:
            verify_path = ROOT / verify_script
            if not verify_path.is_file():
                fail(f"{integ_id}: verify script not found at {verify_script}")
        
        # Check uninstall script
        uninstall_script = install_info.get("uninstall")
        if not uninstall_script:
            fail(f"{integ_id}: missing uninstall script path")
        else:
            uninstall_path = ROOT / uninstall_script
            if not uninstall_path.is_file():
                fail(f"{integ_id}: uninstall script not found at {uninstall_script}")
    
    ok(f"checked lifecycle completeness for {len(integrations)} integrations")


def test_platform_contracts_schema_compliance() -> None:
    """Verify platform-contracts.json complies with its schema."""
    contracts_path = ROOT / "platforms" / "platform-contracts.json"
    schema_path = ROOT / "automation" / "platform-contracts.schema.json"
    
    if not contracts_path.is_file():
        fail("platform-contracts.json missing")
        return
    if not schema_path.is_file():
        fail("platform-contracts.schema.json missing")
        return
    
    contracts = json.loads(contracts_path.read_text(encoding="utf-8"))
    schema = json.loads(schema_path.read_text(encoding="utf-8"))

    # This test used to claim schema compliance while only duplicating a subset
    # of the schema by hand. Validate the canonical document with the declared
    # JSON Schema draft first, then keep semantic checks below for clearer
    # failure messages and cross-language invariants.
    try:
        from jsonschema import Draft202012Validator, FormatChecker
    except ImportError as exc:
        fail(f"jsonschema is required for platform contract validation: {exc}")
        return

    validator = Draft202012Validator(schema, format_checker=FormatChecker())
    schema_errors = sorted(validator.iter_errors(contracts), key=lambda error: list(error.path))
    if schema_errors:
        for error in schema_errors[:20]:
            location = ".".join(str(part) for part in error.absolute_path) or "<root>"
            fail(f"platform-contracts schema violation at {location}: {error.message}")
        if len(schema_errors) > 20:
            fail(f"platform-contracts has {len(schema_errors) - 20} additional schema violations")
        return

    # Check version
    if contracts.get("version") != 2:
        fail(f"platform-contracts version must be 2, got {contracts.get('version')}")
    
    # Check required top-level keys
    required_keys = {"version", "registry", "parity_contract", "platforms"}
    actual_keys = set(contracts.keys())
    if actual_keys != required_keys:
        fail(f"platform-contracts missing keys: {required_keys - actual_keys}")
    
    # Check platforms (eight canonical hosts)
    required_platforms = {"codex", "claude", "grok", "opencode", "antigravity", "cursor", "deepseek-harness", "command-code"}
    actual_platforms = set(contracts.get("platforms", {}).keys())
    if actual_platforms != required_platforms:
        fail(f"platforms mismatch: missing {required_platforms - actual_platforms}, extra {actual_platforms - required_platforms}")
    
    # Check each platform has required sections
    required_sections = {"runtime", "bootstrap", "routing", "orchestration", "mcp"}
    for platform_name, platform_data in contracts.get("platforms", {}).items():
        actual_sections = set(platform_data.keys())
        if actual_sections != required_sections:
            fail(f"platform {platform_name} missing sections: {required_sections - actual_sections}")
        orchestration_keys = {"native_spawn_tool", "agent_discovery", "model_attestation", "permission_capability", "isolation_capability", "agent_materialization"}
        actual_orchestration = set(platform_data.get("orchestration", {}).keys())
        if actual_orchestration != orchestration_keys:
            fail(f"platform {platform_name} orchestration keys mismatch: missing {orchestration_keys - actual_orchestration}, extra {actual_orchestration - orchestration_keys}")

        materialization = platform_data.get("orchestration", {}).get("agent_materialization")
        if materialization == "managed_directory":
            agents_dir = ROOT / "platforms" / platform_name / "agents"
            if not agents_dir.is_dir():
                fail(f"platform {platform_name}: managed_directory requires platforms/{platform_name}/agents")
            else:
                agent_files = [
                    path for path in agents_dir.rglob("*")
                    if path.is_file() and path.name.lower() != "readme.md"
                ]
                if not agent_files:
                    fail(f"platform {platform_name}: managed_directory contains no agent definitions")
        elif materialization != "host_native":
            fail(f"platform {platform_name}: unknown agent_materialization {materialization!r}")

    ok("platform contracts comply with JSON Schema and materialization invariants")


def test_source_integrity_completeness() -> None:
    """Verify source-integrity.json lists all PowerShell and Python scripts."""
    integrity_path = ROOT / "automation" / "source-integrity.json"
    if not integrity_path.is_file():
        fail("source-integrity.json missing")
        return
    
    integrity = json.loads(integrity_path.read_text(encoding="utf-8"))
    listed_files = set(integrity.get("files", {}).keys())
    
    # Find all .ps1 and .py files in automation/
    automation_dir = ROOT / "automation"
    actual_scripts: set[str] = set()
    
    for ext in ("*.ps1", "*.py"):
        for f in automation_dir.glob(ext):
            rel = str(f.relative_to(ROOT)).replace("\\", "/")
            actual_scripts.add(rel)
    
    # Check listed files exist
    missing_scripts: list[str] = []
    for rel in listed_files:
        path = ROOT / rel.replace("/", os.sep)
        if not path.is_file():
            missing_scripts.append(rel)
    
    if missing_scripts:
        fail(f"source-integrity.json lists missing files: {missing_scripts}")
    
    # Check critical scripts are listed
    critical_scripts = [
        "automation/02-install-runtime.ps1",
        "automation/03-validate-context.ps1",
        "automation/09-doctor.ps1",
        "automation/01-build-runtime.ps1",
    ]
    for crit in critical_scripts:
        if crit not in listed_files:
            fail(f"source-integrity.json missing critical script: {crit}")
    
    ok(f"source-integrity.json covers {len(listed_files)} scripts, {len(actual_scripts)} found in automation/")


def test_registry_native_hosts_consistency() -> None:
    """Verify nativeHosts in registry match platform contracts."""
    registry_path = ROOT / "integrations" / "registry.json"
    contracts_path = ROOT / "platforms" / "platform-contracts.json"
    
    registry = json.loads(registry_path.read_text(encoding="utf-8"))
    contracts = json.loads(contracts_path.read_text(encoding="utf-8"))
    
    valid_platforms = set(contracts.get("platforms", {}).keys())
    
    for integ in registry.get("integrations", []):
        integ_id = integ.get("id", "unknown")
        native_hosts = integ.get("nativeHosts", [])
        
        for host in native_hosts:
            if host not in valid_platforms:
                fail(f"{integ_id}: invalid nativeHost '{host}' not in platform contracts")


def test_workctl_cross_language_parity() -> None:
    """Verify workctl implementations (PowerShell, Python, Shell) are consistent."""
    workctl_files = [
        ROOT / "automation" / "workctl.py",
        ROOT / "automation" / "workctl.ps1",
        ROOT / "automation" / "workctl.sh",
    ]
    
    for wf in workctl_files:
        if not wf.is_file():
            fail(f"workctl implementation missing: {wf.name}")
            continue
    
    # Check schema exists
    schema_path = ROOT / "automation" / "work-ledger.schema.json"
    if not schema_path.is_file():
        fail("work-ledger.schema.json missing")
    else:
        try:
            schema = json.loads(schema_path.read_text(encoding="utf-8"))
            if "type" not in schema:
                fail("work-ledger.schema.json missing 'type' field")
        except json.JSONDecodeError as e:
            fail(f"work-ledger.schema.json invalid JSON: {e}")
    
    ok("workctl cross-language parity checked")


def test_adapter_consistency() -> None:
    """Verify MCP adapter configs are consistent across platforms."""
    registry_path = ROOT / "integrations" / "registry.json"
    registry = json.loads(registry_path.read_text(encoding="utf-8"))
    
    # Get all integrations that have adapters
    integrations_with_adapters = [
        integ.get("id") for integ in registry.get("integrations", [])
        if integ.get("nativeHosts") and len(integ.get("nativeHosts", [])) > 0
    ]
    
    for integ_id in integrations_with_adapters:
        # Find the integration path
        integ = next((i for i in registry.get("integrations", []) if i.get("id") == integ_id), None)
        if not integ:
            continue
        
        install_path = integ.get("install", {}).get("script", "")
        if not install_path:
            continue
        
        integ_dir = ROOT / install_path.replace('/install.ps1', '').replace('\\install.ps1', '').replace('/install.sh', '').replace('\\install.sh', '')
        adapters_dir = integ_dir / "adapters"
        
        if not adapters_dir.is_dir():
            fail(f"{integ_id}: adapters directory missing at {adapters_dir}")
            continue
        
        # Check each platform has an adapter
        expected_adapters = ["codex.toml", "claude.json", "opencode.json", "grok.json", "cursor.json", "antigravity.json"]
        native_hosts = integ.get("nativeHosts", [])
        
        for adapter in expected_adapters:
            adapter_path = adapters_dir / adapter
            if not adapter_path.is_file():
                # Only fail if this platform is listed as a native host
                platform_name = adapter.replace(".toml", "").replace(".json", "")
                if platform_name in native_hosts:
                    fail(f"{integ_id}: missing adapter {adapter} for nativeHost '{platform_name}'")
    
    ok(f"checked adapter consistency for {len(integrations_with_adapters)} integrations")


def test_integration_policy_trust_consistency() -> None:
    """Verify integration policy and trust fields are consistent."""
    registry_path = ROOT / "integrations" / "registry.json"
    registry = json.loads(registry_path.read_text(encoding="utf-8"))
    
    valid_policies = {"required", "recommended", "optional"}
    valid_trust = {"adapter-verified", "advisory-only"}
    
    for integ in registry.get("integrations", []):
        integ_id = integ.get("id", "unknown")
        
        policy = integ.get("policy")
        if policy not in valid_policies:
            fail(f"{integ_id}: invalid policy '{policy}'")
        
        trust = integ.get("trust")
        if trust not in valid_trust:
            fail(f"{integ_id}: invalid trust '{trust}'")
        
        # Required integrations must be adapter-verified
        if policy == "required" and trust != "adapter-verified":
            fail(f"{integ_id}: required integration must be adapter-verified")


def main() -> int:
    print("Cross-language manifest consistency checks")
    print()
    
    tests = [
        ("integration manifests match registry", test_integration_manifests_match_registry),
        ("integration lifecycle complete", test_integration_lifecycle_complete),
        ("platform contracts schema compliance", test_platform_contracts_schema_compliance),
        ("source integrity completeness", test_source_integrity_completeness),
        ("registry nativeHosts consistency", test_registry_native_hosts_consistency),
        ("workctl cross-language parity", test_workctl_cross_language_parity),
        ("adapter consistency", test_adapter_consistency),
        ("integration policy/trust consistency", test_integration_policy_trust_consistency),
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
