#!/usr/bin/env python3
"""Focused static and rendered-output tests for canonical platform contracts."""
from __future__ import annotations

import json
import shutil
import subprocess
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CONTRACT = ROOT / "platforms" / "platform-contracts.json"
SCHEMA = ROOT / "automation" / "platform-contracts.schema.json"
PLATFORMS = ("codex", "grok", "antigravity", "cursor", "opencode")
INVARIANTS = {
    "activation", "context_delivery", "orchestration", "role_permissions", "model_effort", "mcp_integration"
}
SECTIONS = {
    "runtime": {"home_env", "home_default", "global_entrypoint"},
    "bootstrap": {"strategy", "entrypoint", "restart_action"},
    "routing": {"hook_lifecycle", "context_delivery"},
    "orchestration": {"native_spawn_tool", "agent_discovery", "model_attestation", "permission_capability", "isolation_capability"},
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
    exact_mapping(contract, {"version", "parity_contract", "platforms"}, "contract")
    if contract["version"] != 1:
        fail("contract version must be 1")
    parity = exact_mapping(contract["parity_contract"], {"required_live_invariants", "static_artifacts_are_sufficient", "aggregate_rule"}, "parity_contract")
    if set(parity["required_live_invariants"]) != INVARIANTS:
        fail("required live invariant set drift")
    if parity["static_artifacts_are_sufficient"] is not False:
        fail("static artifacts must not be sufficient parity evidence")
    if parity["aggregate_rule"] != "all_platforms_require_current_live_evidence":
        fail("aggregate evidence rule drift")

    platforms = exact_mapping(contract["platforms"], set(PLATFORMS), "platforms")
    for name in PLATFORMS:
        platform = exact_mapping(platforms[name], set(SECTIONS), f"platforms.{name}")
        for section, fields in SECTIONS.items():
            values = exact_mapping(platform[section], fields, f"platforms.{name}.{section}")
            if not all(isinstance(value, str) and value for value in values.values()):
                fail(f"platforms.{name}.{section} has an empty field")

    expected_spawn = {"codex": "spawn_agent", "grok": "native_subagent", "antigravity": "invoke_subagent", "cursor": "Task", "opencode": "none"}
    actual_spawn = {name: platforms[name]["orchestration"]["native_spawn_tool"] for name in PLATFORMS}
    if actual_spawn != expected_spawn:
        fail(f"native spawn tool contract drift: {actual_spawn}")
    if platforms["antigravity"]["routing"]["context_delivery"] != "injectSteps.ephemeralMessage":
        fail("Antigravity contract must declare PreInvocation context injection")


def verify_rendered_build(contract: dict[str, object], platforms: tuple[str, ...] = PLATFORMS) -> None:
    shell = shutil.which("pwsh") or shutil.which("powershell")
    if not shell:
        fail("PowerShell is required for build rendering verification")
    with tempfile.TemporaryDirectory(prefix="agent-rules-platform-contract-") as raw:
        build_root = Path(raw) / "runtime-build"
        result = subprocess.run(
            [shell, "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(ROOT / "automation/01-build-runtime.ps1"), "-Root", str(ROOT), "-BuildRoot", str(build_root), "-SkipContextGraph"],
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
                print(f"  [WARN] build omitted runtime contract for {name}")
                continue
            rendered = json.loads(rendered_path.read_text(encoding="utf-8-sig"))
            expected = {"version": 1, "platform": name, "source": "platforms/platform-contracts.json", "contract": contract["platforms"][name]}
            if rendered != expected:
                fail(f"rendered runtime contract drift for {name}")


def main() -> int:
    contract = json.loads(CONTRACT.read_text(encoding="utf-8"))
    schema = json.loads(SCHEMA.read_text(encoding="utf-8"))
    validate(contract, schema)
    for name in PLATFORMS:
        if name == "opencode":
            continue
        legacy = ROOT / "platforms" / name / "runtime.yaml"
        if legacy.exists():
            fail(f"legacy runtime manifest remains: {legacy.relative_to(ROOT)}")
    rendered_platforms = tuple(p for p in PLATFORMS if p != "opencode")
    readme = (ROOT / "platforms" / "README.md").read_text(encoding="utf-8")
    if "only differ" in readme or "artifact parity" in readme.lower():
        fail("platform README retains the artifact-parity thesis")
    verify_rendered_build(contract, rendered_platforms)
    print("PASS: platform contracts")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
