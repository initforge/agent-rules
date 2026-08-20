#!/usr/bin/env python3
"""Conformance suite for parity verification — claim schema, evidence schema, pipeline contract."""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

CLAIM_SCHEMA_PATH = ROOT / "automation" / "parity-claim-schema.json"
EVIDENCE_SCHEMA_PATH = ROOT / "skills" / "parity-verification" / "references" / "evidence-schema.json"
VERIFY_SCRIPT_PATH = ROOT / "automation" / "parity-verify.ps1"
SKILL_PATH = ROOT / "skills" / "parity-verification" / "SKILL.md"
PIPELINE_PATH = ROOT / "skills" / "parity-verification" / "references" / "pipeline.md"
CLAIM_FORMAT_PATH = ROOT / "skills" / "parity-verification" / "references" / "claim-format.md"
RUNBOOK_PATH = ROOT / "skills" / "parity-verification" / "references" / "runbook.md"
EVIDENCE_PROFILES_PATH = ROOT / "automation" / "evidence-profiles.json"
REGISTRY_PATH = ROOT / "integrations" / "registry.json"
BROWSER_QA_PATH = ROOT / "skills" / "browser-qa" / "SKILL.md"
PENCIL_MCP_PATH = ROOT / "integrations" / "manual" / "pencil-mcp" / "README.md"
VERIFICATION_ROUTER_PATH = ROOT / "skills" / "verification-router" / "SKILL.md"


def fail(case_id: str, message: str) -> None:
    raise AssertionError(f"{case_id}: {message}")


def validate_claim_schema() -> int:
    """Validate parity-claim-schema.json is valid JSON and contains required fields."""
    cases = 0
    try:
        schema = json.loads(CLAIM_SCHEMA_PATH.read_text(encoding="utf-8-sig"))
    except json.JSONDecodeError as e:
        fail("CLAIM-SCHEMA-001", f"Invalid JSON: {e}")
    cases += 1

    assert schema.get("$schema"), "CLAIM-SCHEMA-002: Missing $schema"
    assert schema.get("title") == "Parity Claim Packet", "CLAIM-SCHEMA-003: Wrong title"
    assert "claims" in schema.get("required", []), "CLAIM-SCHEMA-004: claims not required at top level"
    assert "claim" in schema.get("$defs", {}), "CLAIM-SCHEMA-005: claim definition missing"
    assert "id" in schema.get("$defs", {}).get("claim", {}).get("required", []), "CLAIM-SCHEMA-006: claim.id not required"
    assert "dimension" in schema["$defs"]["claim"]["required"], "CLAIM-SCHEMA-007: claim.dimension not required"
    assert "viewport" in schema["$defs"]["claim"]["required"], "CLAIM-SCHEMA-008: claim.viewport not required"
    assert "state" in schema["$defs"]["claim"]["required"], "CLAIM-SCHEMA-009: claim.state not required"
    assert "expected" in schema["$defs"]["claim"]["required"], "CLAIM-SCHEMA-010: claim.expected not required"
    assert "proof_profile" in schema["$defs"]["claim"]["required"], "CLAIM-SCHEMA-011: claim.proof_profile not required"
    assert "required_evidence" in schema["$defs"]["claim"]["required"], "CLAIM-SCHEMA-012: claim.required_evidence not required"
    cases += 1

    dims = schema["$defs"]["claim"]["properties"]["dimension"]["enum"]
    expected_dims = {"visual", "responsive", "behavioral", "accessibility", "console", "network", "data-state"}
    assert set(dims) == expected_dims, f"CLAIM-SCHEMA-013: dimensions mismatch: {set(dims)} != {expected_dims}"
    cases += 1

    states = schema["$defs"]["claim"]["properties"]["state"]["enum"]
    expected_states = {"loading", "populated", "empty", "error", "hover", "focus", "keyboard", "touch"}
    assert set(states) == expected_states, f"CLAIM-SCHEMA-014: states mismatch: {set(states)} != {expected_states}"
    cases += 1

    viewports = schema["$defs"]["claim"]["properties"]["viewport"]["enum"]
    assert set(viewports) == {"desktop", "mobile", "both"}, f"CLAIM-SCHEMA-015: viewports mismatch: {set(viewports)}"
    cases += 1

    evidence_kinds = schema["$defs"]["claim"]["properties"]["required_evidence"]["items"]["enum"]
    expected_kinds = {"screenshot", "a11y_snapshot", "console_log", "network_log", "source_assertion", "visual_diff"}
    assert set(evidence_kinds) == expected_kinds, f"CLAIM-SCHEMA-016: evidence kinds mismatch: {set(evidence_kinds)}"
    cases += 1

    assert "accepted_deviation" in schema["$defs"]["claim"]["properties"], "CLAIM-SCHEMA-017: accepted_deviation missing"
    dev_fields = schema["$defs"]["claim"]["properties"]["accepted_deviation"]["required"]
    assert "field" in dev_fields, "CLAIM-SCHEMA-018: accepted_deviation.field missing"
    assert "expected" in dev_fields, "CLAIM-SCHEMA-019: accepted_deviation.expected missing"
    assert "actual" in dev_fields, "CLAIM-SCHEMA-020: accepted_deviation.actual missing"
    assert "reason" in dev_fields, "CLAIM-SCHEMA-021: accepted_deviation.reason missing"
    assert "approved_by" in dev_fields, "CLAIM-SCHEMA-022: accepted_deviation.approved_by missing"
    cases += 1

    print(f"  claim schema: {cases} checks passed")
    return 0


def validate_evidence_schema() -> int:
    """Validate evidence-schema.json structure."""
    cases = 0
    try:
        schema = json.loads(EVIDENCE_SCHEMA_PATH.read_text(encoding="utf-8-sig"))
    except json.JSONDecodeError as e:
        fail("EVID-001", f"Invalid JSON: {e}")
    cases += 1

    assert schema.get("title") == "Parity Evidence", "EVID-002: Wrong title"
    required = set(schema.get("required", []))
    for field in ("claim_id", "dimension", "state", "viewport", "verdict", "captured_at", "environment", "evidence_artifacts"):
        assert field in required, f"EVID-003: {field} not required"
    cases += 1

    verdicts = schema["properties"]["verdict"]["enum"]
    expected_verdicts = {"PASS", "FAIL", "UNVERIFIED", "FLAKY", "BLOCKED"}
    assert set(verdicts) == expected_verdicts, f"EVID-004: verdicts mismatch: {set(verdicts)} != {expected_verdicts}"
    cases += 1

    residuals = schema["properties"]["residual"]["properties"]["classification"]["enum"]
    expected_residuals = {"defect", "accepted_deviation", "environment_rendering", "unknown"}
    assert set(residuals) == expected_residuals, f"EVID-005: residuals mismatch: {set(residuals)} != {expected_residuals}"
    cases += 1

    assert "visual_diff" in schema["properties"], "EVID-006: visual_diff missing"
    assert "flaky_detected" in schema["properties"]["visual_diff"]["properties"], "EVID-007: flaky_detected missing"
    assert "console" in schema["properties"], "EVID-008: console section missing"
    assert "network" in schema["properties"], "EVID-009: network section missing"
    assert "a11y" in schema["properties"], "EVID-010: a11y section missing"
    cases += 1

    artifact_kinds = schema["$defs"]["artifact"]["properties"]["kind"]["enum"]
    expected_artifact_kinds = {"screenshot", "a11y_snapshot", "console_log", "network_log", "visual_diff", "source_assertion", "performance_trace"}
    assert set(artifact_kinds) == expected_artifact_kinds, f"EVID-011: artifact kinds mismatch: {set(artifact_kinds)}"
    cases += 1

    for required_field in ("kind", "path", "sha256"):
        assert required_field in schema["$defs"]["artifact"]["required"], f"EVID-012: artifact.{required_field} not required"
    cases += 1

    print(f"  evidence schema: {cases} checks passed")
    return 0


def validate_pipeline_docs() -> int:
    """Validate all pipeline reference docs exist."""
    cases = 0

    assert SKILL_PATH.exists(), "DOC-001: SKILL.md missing"
    cases += 1

    for ref_path, ref_name in [
        (PIPELINE_PATH, "pipeline.md"),
        (CLAIM_FORMAT_PATH, "claim-format.md"),
        (EVIDENCE_SCHEMA_PATH, "evidence-schema.json"),
        (RUNBOOK_PATH, "runbook.md"),
    ]:
        assert ref_path.exists(), f"DOC-002: {ref_name} missing"
        assert ref_path.stat().st_size > 0, f"DOC-003: {ref_name} is empty"
        cases += 1

    skill_content = SKILL_PATH.read_text(encoding="utf-8")
    assert "parity verification" in skill_content.lower(), "DOC-004: SKILL.md missing expected content"
    assert "browser-qa" in skill_content, "DOC-005: SKILL.md missing browser-qa reference"
    assert "qa-skills" in skill_content, "DOC-006: SKILL.md missing qa-skills reference"
    assert "active-profile" in skill_content or "<active-profile>" in skill_content, "DOC-007: SKILL.md missing active-profile reference"
    cases += 1

    pipeline_content = PIPELINE_PATH.read_text(encoding="utf-8")
    for stage in ("claim definition", "environment pinning", "state/viewport matrix", "evidence collection", "verdict computation", "residual classification", "report generation"):
        assert stage in pipeline_content.lower(), f"DOC-008: pipeline.md missing stage: {stage}"
    cases += 1

    runbook_content = RUNBOOK_PATH.read_text(encoding="utf-8")
    for section in ("preconditions", "session flow", "flake detection", "expected screenshots", "evidence collection commands"):
        assert section in runbook_content.lower(), f"DOC-009: runbook.md missing section: {section}"
    cases += 1

    print(f"  pipeline docs: {cases} checks passed")
    return 0


def validate_verification_matrix() -> int:
    """Validate the SKILL.md declares the required verification matrix."""
    cases = 0
    content = SKILL_PATH.read_text(encoding="utf-8")

    for state in ("loading", "populated", "empty", "error", "hover", "focus", "keyboard", "touch"):
        assert state in content.lower(), f"MATRIX-001: State '{state}' not mentioned in SKILL.md"
    cases += 1

    assert "desktop" in content.lower() and "mobile" in content.lower(), "MATRIX-002: Viewports not in SKILL.md"
    cases += 1

    for cap in ("console", "network", "a11y", "screenshot", "viewport"):
        assert cap in content.lower(), f"MATRIX-003: Capability '{cap}' not in SKILL.md"
    cases += 1

    print(f"  verification matrix: {cases} checks passed")
    return 0


def validate_source_of_truth() -> int:
    """Validate source-of-truth rules in SKILL.md."""
    cases = 0
    content = SKILL_PATH.read_text(encoding="utf-8")

    assert "runtime behavior" in content, "TRUTH-001: template runtime behavior not in SKILL.md"
    assert "source code" in content, "TRUTH-002: source code not in SKILL.md"
    assert "visual captures" in content, "TRUTH-003: visual captures not in SKILL.md"
    assert "accepted deviations" in content, "TRUTH-004: accepted deviations not in SKILL.md"
    assert "universal truth" in content, "TRUTH-005: universal truth guard not in SKILL.md"
    cases += 1

    assert "build success alone is insufficient" in content.lower(), "TRUTH-006: build-is-not-enough guard not in SKILL.md"
    cases += 1

    print(f"  source of truth: {cases} checks passed")
    return 0


def validate_evidence_profiles() -> int:
    """Validate evidence profiles include ui-parity profile."""
    cases = 0
    try:
        profiles = json.loads(EVIDENCE_PROFILES_PATH.read_text(encoding="utf-8-sig"))
    except json.JSONDecodeError as e:
        fail("PROF-001", f"Invalid evidence-profiles.json: {e}")
    cases += 1

    assert "ui-parity" in profiles.get("profiles", {}), "PROF-002: ui-parity profile missing"
    ui_parity = profiles["profiles"]["ui-parity"]
    assert ui_parity.get("runtime_evidence_required") is True, "PROF-003: ui-parity must require runtime evidence"
    assert ui_parity.get("build_only_forbidden") is True, "PROF-004: ui-parity must forbid build-only"
    required_dims = set(ui_parity.get("required_dimensions", []))
    for dim in ("interaction", "state", "regression", "visual", "reference"):
        assert dim in required_dims, f"PROF-005: ui-parity missing dimension '{dim}'"
    cases += 1

    allowed = set(ui_parity.get("allowed_kinds", []))
    for kind in ("browser-test", "component-test", "custom-runtime"):
        assert kind in allowed, f"PROF-006: ui-parity missing allowed kind '{kind}'"
    cases += 1

    print(f"  evidence profiles: {cases} checks passed")
    return 0


def validate_verify_script() -> int:
    """Validate parity-verify.ps1 exists and has required structure."""
    cases = 0
    assert VERIFY_SCRIPT_PATH.exists(), "SCRIPT-001: parity-verify.ps1 missing"
    assert VERIFY_SCRIPT_PATH.stat().st_size > 0, "SCRIPT-002: parity-verify.ps1 is empty"
    cases += 1

    content = VERIFY_SCRIPT_PATH.read_text(encoding="utf-8")
    for param in ("ClaimPacket", "TargetUrl", "OutputDir", "BaselineDir"):
        assert f"${param}" in content, f"SCRIPT-003: Missing parameter ${param}"
    cases += 1

    for verdict in ("PASS", "FAIL", "UNVERIFIED", "FLAKY", "BLOCKED"):
        assert verdict in content, f"SCRIPT-004: Missing verdict '{verdict}'"
    cases += 1

    assert "flaky_detected" in content, "SCRIPT-005: Missing flaky detection logic"
    assert "baseline_path" in content or "visual_baseline" in content, "SCRIPT-006: Missing baseline logic"
    assert "evidence_artifacts" in content, "SCRIPT-007: Missing evidence artifact collection"
    assert "console" in content.lower() or "SkipConsole" in content, "SCRIPT-008: Missing console evidence"
    assert "network" in content.lower() or "SkipNetwork" in content, "SCRIPT-009: Missing network evidence"
    assert "a11y" in content.lower() or "SkipA11y" in content, "SCRIPT-010: Missing a11y evidence"
    cases += 1

    print(f"  verify script: {cases} checks passed")
    return 0


def validate_integration_deps() -> int:
    """Validate that integrations required by parity-verification are in registry."""
    cases = 0
    try:
        registry = json.loads(REGISTRY_PATH.read_text(encoding="utf-8-sig"))
    except json.JSONDecodeError as e:
        fail("INT-001", f"Invalid registry.json: {e}")
    cases += 1

    integration_ids = {i["id"] for i in registry["integrations"]}
    for dep in ("playwright-cli", "playwright-mcp", "chrome-devtools-mcp"):
        assert dep in integration_ids, f"INT-002: Browser integration '{dep}' not in registry"
    cases += 1

    profiles = registry.get("profiles", {})
    assert "qa" in profiles, "INT-003: qa profile missing from registry"
    qa_recommended = profiles["qa"].get("recommended", [])
    assert "playwright-cli" in qa_recommended, "INT-004: Playwright CLI must be the QA default/recommended browser verifier"
    assert "playwright-mcp" in qa_recommended, "INT-005: Playwright MCP must remain available for exploratory browser work"
    assert "chrome-devtools-mcp" in qa_recommended, "INT-006: Chrome DevTools MCP must remain available for browser diagnostics"
    assert profiles["qa"].get("required", []) == [], "INT-007: browser tools must not be globally mandatory"
    cases += 1

    print(f"  integration deps: {cases} checks passed")
    return 0


def validate_process_visibility_and_funnel() -> int:
    """Keep visible manual work and plan/run/reducer semantics explicit."""
    cases = 0
    browser = BROWSER_QA_PATH.read_text(encoding="utf-8")
    pencil = PENCIL_MCP_PATH.read_text(encoding="utf-8")
    router = VERIFICATION_ROUTER_PATH.read_text(encoding="utf-8")

    for marker in ("Manual visibility contract", "visible browser/session", "BLOCKED`/`UNAVAILABLE", "headless"):
        assert marker.lower() in browser.lower(), f"VIS-001: browser skill missing '{marker}'"
    cases += 1
    for marker in ("Pencil CLI", "desktop/editor", "foreground", "BLOCKED`/`UNAVAILABLE", "explicit-only"):
        assert marker.lower() in pencil.lower(), f"VIS-002: Pencil contract missing '{marker}'"
    cases += 1
    for marker in ("VERIFICATION_PLAN", "VERIFICATION_RUN", "ACCEPTANCE_REDUCTION", "RUNNABLE` is never run evidence", "human residual packet"):
        assert marker.lower() in router.lower(), f"FUNNEL-001: router missing '{marker}'"
    cases += 1

    print(f"  process visibility/funnel: {cases} checks passed")
    return 0


def main() -> int:
    failures = 0
    checks = [
        ("Claim schema", validate_claim_schema),
        ("Evidence schema", validate_evidence_schema),
        ("Pipeline docs", validate_pipeline_docs),
        ("Verification matrix", validate_verification_matrix),
        ("Source of truth", validate_source_of_truth),
        ("Evidence profiles", validate_evidence_profiles),
        ("Verify script", validate_verify_script),
        ("Integration deps", validate_integration_deps),
        ("Process visibility and funnel", validate_process_visibility_and_funnel),
    ]

    for name, func in checks:
        try:
            func()
            print(f"  PASS: {name}")
        except AssertionError as e:
            print(f"  FAIL: {name}: {e}")
            failures += 1
        except Exception as e:
            print(f"  FAIL: {name}: {e}")
            failures += 1

    total = sum(1 for _ in checks)
    passed = total - failures
    print(f"\n{'=' * 50}")
    print(f"Parity verification conformance: {passed}/{total} passed")
    if failures:
        print(f"{failures} failure(s)")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
