#!/usr/bin/env python3
"""Focused static and rendered-output tests for canonical platform contracts."""
from __future__ import annotations

import json
import copy
import shutil
import subprocess
import tempfile
from pathlib import Path

from jsonschema import Draft202012Validator, FormatChecker


ROOT = Path(__file__).resolve().parents[1]
CONTRACT = ROOT / "platforms" / "platform-contracts.json"
SCHEMA = ROOT / "automation" / "platform-contracts.schema.json"
PLATFORMS = ("codex", "claude", "grok", "opencode", "antigravity")
DEFERRED = ("cursor",)
NOT_LIVE_VERIFIED = ("deepseek-harness", "command-code")
RENDERED_PLATFORMS = PLATFORMS + DEFERRED + NOT_LIVE_VERIFIED
ALL_HOSTS = RENDERED_PLATFORMS
INVARIANTS = {
    "activation", "context_delivery", "orchestration", "role_permissions", "model_effort", "mcp_integration"
}
SECTIONS = {
    "runtime": {"home_env", "home_default", "global_entrypoint"},
    "bootstrap": {"strategy", "entrypoint", "restart_action"},
    "routing": {"hook_lifecycle", "context_delivery"},
    "orchestration": {"native_spawn_tool", "agent_discovery", "model_attestation", "permission_capability", "isolation_capability", "agent_materialization"},
    "mcp": {"config_path", "format", "native_inspect", "live_doctor"},
}


def fail(message: str) -> None:
    raise SystemExit(f"FAIL: {message}")


def exact_mapping(value: object, expected: set[str], label: str) -> dict[str, object]:
    if not isinstance(value, dict) or set(value) != expected:
        actual = sorted(value) if isinstance(value, dict) else type(value).__name__
        fail(f"{label} keys are {actual}; expected {sorted(expected)}")
    return value


def validate(contract: dict[str, object], schema: dict[str, object]) -> None:
    if schema.get("$schema") != "https://json-schema.org/draft/2020-12/schema":
        fail("schema must use JSON Schema draft 2020-12")
    errors = sorted(
        Draft202012Validator(schema, format_checker=FormatChecker()).iter_errors(contract),
        key=lambda error: list(error.path),
    )
    if errors:
        rendered = [];
        for error in errors[:20]:
            location = ".".join(str(part) for part in error.absolute_path) or "<root>"
            rendered.append(f"{location}: {error.message}")
        fail("JSON Schema validation failed: " + "; ".join(rendered))
    exact_mapping(contract, {"version", "registry", "parity_contract", "platforms"}, "contract")
    if contract["version"] != 2:
        fail("contract version must be 2")
    registry = exact_mapping(contract["registry"], {"host_ids", "certification_policy", "capability_to_canary"}, "registry")
    if tuple(registry["host_ids"]) != ALL_HOSTS:
        fail(f"registry host_ids drift: {tuple(registry['host_ids'])} != {ALL_HOSTS}")
    policy = registry["certification_policy"]
    if tuple(policy["certification_required_hosts"]) != PLATFORMS:
        fail("registry certification required host drift")
    if tuple(policy["deferred_supported_targets"]) != DEFERRED:
        fail("registry deferred supported target drift")
    if tuple(policy["not_live_verified_targets"]) != NOT_LIVE_VERIFIED:
        fail("registry not-live-verified target drift")
    parity = exact_mapping(contract["parity_contract"], {"required_live_invariants", "static_artifacts_are_sufficient", "aggregate_rule", "certification_required_hosts", "deferred_supported_targets"}, "parity_contract")
    if set(parity["required_live_invariants"]) != INVARIANTS:
        fail("required live invariant set drift")
    if parity["static_artifacts_are_sufficient"] is not False:
        fail("static artifacts must not be sufficient parity evidence")
    if parity["aggregate_rule"] != "all_platforms_require_current_live_evidence":
        fail("aggregate evidence rule drift")
    if tuple(parity["certification_required_hosts"]) != PLATFORMS:
        fail("certification required host drift")
    if tuple(parity["deferred_supported_targets"]) != DEFERRED:
        fail("deferred supported target drift")

    platforms = exact_mapping(contract["platforms"], set(RENDERED_PLATFORMS), "platforms")
    for name in RENDERED_PLATFORMS:
        platform = exact_mapping(platforms[name], set(SECTIONS), f"platforms.{name}")
        for section, fields in SECTIONS.items():
            values = exact_mapping(platform[section], fields, f"platforms.{name}.{section}")
            if not all(isinstance(value, str) and value for value in values.values()):
                fail(f"platforms.{name}.{section} has an empty field")

    expected_spawn = {"codex": "spawn_agent", "claude": "Agent", "grok": "native_subagent", "opencode": "none", "antigravity": "invoke_subagent"}
    actual_spawn = {name: platforms[name]["orchestration"]["native_spawn_tool"] for name in PLATFORMS}
    if actual_spawn != expected_spawn:
        fail(f"native spawn tool contract drift: {actual_spawn}")
    if platforms["antigravity"]["routing"]["context_delivery"] != "injectSteps.ephemeralMessage":
        fail("Antigravity contract must declare PreInvocation context injection")
    if platforms["cursor"]["orchestration"]["model_attestation"] != "deferred_host_attestation":
        fail("Cursor must remain an explicit deferred supported target")
    # New hosts must be declared UNSUPPORTED/NOT_LIVE_VERIFIED until a native
    # projection exists: DSH uses managed Cordis bundle/profile (host_native),
    # Command Code uses session-scoped mods (host_native).
    if platforms["deepseek-harness"]["bootstrap"]["strategy"] != "managed_bundle_profile":
        fail("DeepSeek Harness must use the Cordis bundle/profile bootstrap")
    if platforms["command-code"]["bootstrap"]["strategy"] != "managed_session_mod":
        fail("Command Code must use session-scoped mod bootstrap")
    expected_materialization = {name: "managed_directory" for name in PLATFORMS + DEFERRED}
    expected_materialization.update({"deepseek-harness": "host_native", "command-code": "host_native"})
    actual_materialization = {name: platforms[name]["orchestration"]["agent_materialization"] for name in RENDERED_PLATFORMS}
    if actual_materialization != expected_materialization:
        fail(f"agent materialization contract drift: {actual_materialization}")
    for name, materialization in actual_materialization.items():
        if materialization != "managed_directory":
            continue
        agents_dir = ROOT / "platforms" / name / "agents"
        definitions = [path for path in agents_dir.rglob("*") if path.is_file() and path.name.lower() != "readme.md"] if agents_dir.is_dir() else []
        if not definitions:
            fail(f"managed platform {name} has no materializable agent definitions")


def verify_negative_cases(contract: dict[str, object], schema: dict[str, object]) -> None:
    cases = []
    missing = copy.deepcopy(contract)
    del missing["platforms"]["codex"]
    cases.append(("missing", missing))
    extra = copy.deepcopy(contract)
    extra["platforms"]["synthetic"] = copy.deepcopy(extra["platforms"]["codex"])
    cases.append(("extra", extra))
    drift = copy.deepcopy(contract)
    drift["platforms"]["cursor"]["orchestration"]["unexpected"] = "drift"
    cases.append(("drift", drift))
    for label, candidate in cases:
        try:
            validate(candidate, schema)
        except SystemExit:
            continue
        fail(f"negative {label} contract was accepted")


def verify_rendered_build(contract: dict[str, object], platforms: tuple[str, ...] = RENDERED_PLATFORMS) -> None:
    shell = shutil.which("pwsh") or shutil.which("powershell")
    if not shell:
        fail("PowerShell is required for build rendering verification")
    with tempfile.TemporaryDirectory(prefix="agent-rules-platform-contract-") as raw:
        build_root = Path(raw) / "runtime-build"
        result = subprocess.run(
            [shell, "-NoProfile", "-File", str(ROOT / "automation/01-build-runtime.ps1"), "-Root", str(ROOT), "-BuildRoot", str(build_root), "-SkipContextGraph"],
            cwd=ROOT,
            capture_output=True,
            text=True,
            timeout=120,
        )
        if result.returncode:
            fail(f"build failed: {(result.stdout + result.stderr)[-2400:]}")
        for name in platforms:
            rendered_path = build_root / name / "runtime-contract.json"
            if not rendered_path.is_file():
                fail(f"build omitted required runtime contract for {name}")
            rendered = json.loads(rendered_path.read_text(encoding="utf-8-sig"))
            expected = {"version": 1, "platform": name, "source": "platforms/platform-contracts.json", "contract": contract["platforms"][name]}
            if rendered != expected:
                fail(f"rendered runtime contract drift for {name}")


def main() -> int:
    contract = json.loads(CONTRACT.read_text(encoding="utf-8"))
    schema = json.loads(SCHEMA.read_text(encoding="utf-8"))
    validate(contract, schema)
    verify_negative_cases(contract, schema)
    for name in PLATFORMS:
        legacy = ROOT / "platforms" / name / "runtime.yaml"
        if legacy.exists():
            fail(f"legacy runtime manifest remains: {legacy.relative_to(ROOT)}")
    # Exact mappings above are negative tests for missing, extra, and field drift.
    rendered_platforms = RENDERED_PLATFORMS
    readme = (ROOT / "platforms" / "README.md").read_text(encoding="utf-8")
    if "only differ" in readme or "artifact parity" in readme.lower():
        fail("platform README retains the artifact-parity thesis")
    verify_rendered_build(contract, rendered_platforms)
    print("PASS: platform contracts")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
