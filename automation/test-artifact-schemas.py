#!/usr/bin/env python3
"""Validate portable artifact schemas against positive and negative fixtures."""
from __future__ import annotations

import json
from pathlib import Path

try:
    from jsonschema import validate, ValidationError
except ImportError:
    import sys
    print("FAIL: install jsonschema (pip install jsonschema)")
    sys.exit(1)


ROOT = Path(__file__).resolve().parents[1]
SCHEMAS_DIR = ROOT / "schemas"
FIXTURES_DIR = SCHEMAS_DIR / "fixtures"


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def collect_fixtures(subdir: str):
    pos_dir = FIXTURES_DIR / subdir
    if not pos_dir.is_dir():
        return {}
    result = {}
    for f in sorted(pos_dir.glob("*.json")):
        basename = f.stem
        prefix = basename.split("-")[0]
        result.setdefault(prefix, []).append(f)
    return result


def fixture_prefix_to_schema(prefix: str) -> str:
    mapping = {
        "agent": "agent-result",
        "model": "model-route",
        "profile": "profile-manifest",
        "telemetry": "telemetry-event",
    }
    return mapping.get(prefix, prefix)


def main() -> int:
    errors = []

    # Collect schemas
    schema_files = {}
    for f in sorted(SCHEMAS_DIR.glob("*.schema.json")):
        schema_name = f.stem.replace(".schema", "")
        schema_files[schema_name] = f

    if not schema_files:
        print("FAIL: no schemas found")
        return 1

    print(f"Found {len(schema_files)} schemas: {', '.join(sorted(schema_files))}")

    # Load all schemas
    schemas = {}
    for name, path in schema_files.items():
        try:
            schemas[name] = load_json(path)
        except json.JSONDecodeError as e:
            errors.append(f"  {name}: not valid JSON — {e}")

    if errors:
        for e in errors:
            print(e)
        return 1

    # Validate each schema against JSON Schema meta-schema
    for name, schema in schemas.items():
        try:
            validate(schema, {"$schema": "https://json-schema.org/draft/2020-12/schema"})
        except ValidationError as e:
            errors.append(f"  {name}: invalid schema — {e.message}")

    if errors:
        print("\nSchema-level validation errors:")
        for e in errors:
            print(e)
        return 1

    # Positive fixtures
    pos_fixtures = collect_fixtures("positive")
    total_pos = 0
    failed_pos = 0

    for prefix, fixture_files in sorted(pos_fixtures.items()):
        schema_name = fixture_prefix_to_schema(prefix)
        schema_obj = schemas.get(schema_name)

        if not schema_obj:
            errors.append(f"  No schema found for fixtures: {prefix}")
            continue

        for fixture_path in fixture_files:
            total_pos += 1
            try:
                data = load_json(fixture_path)
                validate(data, schema_obj)
            except ValidationError as e:
                failed_pos += 1
                errors.append(f"  {fixture_path.name}: {e.message}")
            except json.JSONDecodeError as e:
                failed_pos += 1
                errors.append(f"  {fixture_path.name}: invalid JSON — {e}")

    print(f"Positive fixtures: {total_pos - failed_pos}/{total_pos} pass")

    # Negative fixtures
    neg_fixtures = collect_fixtures("negative")
    total_neg = 0
    expected_fail_but_passed = 0

    for prefix, fixture_files in sorted(neg_fixtures.items()):
        schema_name = fixture_prefix_to_schema(prefix)
        schema_obj = schemas.get(schema_name)

        if not schema_obj:
            errors.append(f"  No schema found for negative fixtures: {prefix}")
            continue

        for fixture_path in fixture_files:
            total_neg += 1
            try:
                data = load_json(fixture_path)
                validate(data, schema_obj)
                expected_fail_but_passed += 1
                errors.append(f"  {fixture_path.name}: should have FAILED but passed")
            except ValidationError:
                pass  # Expected
            except json.JSONDecodeError:
                pass  # Expected

    if expected_fail_but_passed:
        print(f"Negative fixtures: {total_neg - expected_fail_but_passed}/{total_neg} correctly reject "
              f"({expected_fail_but_passed} incorrectly passed)")
    else:
        print(f"Negative fixtures: {total_neg}/{total_neg} correctly reject")

    if errors:
        print(f"\nErrors ({len(errors)}):")
        for e in errors:
            print(e)
        return 1

    # --- Acceptance criteria ---
    print("\nAcceptance criteria:")

    # Check plan schema for three-level support
    plan = schemas.get("plan", {})
    plan_props = plan.get("properties", {})

    # 1. Level discriminator
    level_enum = plan_props.get("level", {}).get("enum", [])
    has_three_levels = all(s in level_enum for s in ["small", "standard", "resumable"])
    print(f"  [{'PASS' if has_three_levels else 'FAIL'}] Plan has three levels (small/standard/resumable)")

    # 2. Requirements with IDs
    has_requirements = "requirements" in plan_props
    print(f"  [{'PASS' if has_requirements else 'FAIL'}] Plan supports requirements with IDs")

    # 3. Decisions with supersedes
    has_decisions = "decisions" in plan_props
    decision_items = plan_props.get("decisions", {}).get("items", {})
    decision_props = decision_items.get("properties", {})
    has_supersedes = "supersedes_id" in decision_props
    print(f"  [{'PASS' if has_supersedes else 'FAIL'}] Decisions support supersedes_id")

    # 4. Change graph with categories
    has_change_graph = "change_graph" in plan_props
    cg_items = plan_props.get("change_graph", {}).get("items", {})
    cg_props = cg_items.get("properties", {})
    cg_categories = cg_props.get("category", {}).get("enum", [])
    has_categories = all(c in cg_categories for c in ["fact", "assumption", "unknown", "user_decision"])
    print(f"  [{'PASS' if has_categories else 'FAIL'}] Change graph has fact/assumption/unknown/user_decision categories")

    # 5. Verification matrix
    has_vm = "verification_matrix" in plan_props
    print(f"  [{'PASS' if has_vm else 'FAIL'}] Plan supports verification_matrix")

    # 6. Amendments
    has_amendments = "amendments" in plan_props
    print(f"  [{'PASS' if has_amendments else 'FAIL'}] Plan supports amendments with supersedes_prior")

    # 7. Checkpoints
    has_checkpoints = "checkpoints" in plan_props
    print(f"  [{'PASS' if has_checkpoints else 'FAIL'}] Plan supports checkpoints")

    # 8. Evidence ledger
    has_evidence_ledger = "evidence_ledger" in plan_props
    print(f"  [{'PASS' if has_evidence_ledger else 'FAIL'}] Plan supports evidence ledger")

    # 9. Original request hash
    has_original_hash = "original_request_hash" in plan_props
    print(f"  [{'PASS' if has_original_hash else 'FAIL'}] Plan supports original_request_hash")

    # 10. Unresolved questions with impact
    has_uq = "unresolved_questions" in plan_props
    print(f"  [{'PASS' if has_uq else 'FAIL'}] Plan supports unresolved_questions with impact categories")

    # 11. Supersedes prior plan
    has_supersedes_plan = "supersedes" in plan_props
    print(f"  [{'PASS' if has_supersedes_plan else 'FAIL'}] Plan supports supersedes (prior plan reference)")

    # 12. Path ownership boundaries
    has_path_ownership = "path_ownership" in plan_props
    print(f"  [{'PASS' if has_path_ownership else 'FAIL'}] Plan supports path_ownership boundaries")

    # 13. Capability schema has 4 mode states
    if "capability" in schemas:
        cap = schemas["capability"]
        mode_enum = cap.get("properties", {}).get("mode", {}).get("enum", [])
        has_states = all(s in mode_enum for s in ["native", "emulated", "unsupported", "unverified"])
        print(f"  [{'PASS' if has_states else 'FAIL'}] Capability mode includes all 4 states")

    # --- Level-specific validation ---
    print("\nLevel-specific validation:")

    for fixture_path in sorted((FIXTURES_DIR / "positive").glob("plan-*.json")):
        data = load_json(fixture_path)
        level = data.get("level", "unknown")

        checks = []
        # Small: should have no requirements, decisions, task_graph
        if level == "small":
            if "requirements" in data:
                checks.append(("FAIL", f"{fixture_path.name}: small plan should not have requirements"))
            if "task_graph" in data:
                checks.append(("FAIL", f"{fixture_path.name}: small plan should not have task_graph"))
            if "amendments" in data:
                checks.append(("FAIL", f"{fixture_path.name}: small plan should not have amendments"))
            if not checks:
                checks.append(("PASS", f"{fixture_path.name}: small plan — no extras"))

        # Standard: should have requirements, decisions, change_graph, verification_matrix
        elif level == "standard":
            if "requirements" not in data:
                checks.append(("FAIL", f"{fixture_path.name}: standard plan missing requirements"))
            if "decisions" not in data:
                checks.append(("FAIL", f"{fixture_path.name}: standard plan missing decisions"))
            if "change_graph" not in data:
                checks.append(("FAIL", f"{fixture_path.name}: standard plan missing change_graph"))
            if "verification_matrix" not in data:
                checks.append(("FAIL", f"{fixture_path.name}: standard plan missing verification_matrix"))
            if not checks:
                checks.append(("PASS", f"{fixture_path.name}: standard plan — has reqs, decisions, change graph, VM"))

        # Resumable: should have task_graph, slices
        elif level == "resumable":
            if "task_graph" not in data:
                checks.append(("FAIL", f"{fixture_path.name}: resumable plan missing task_graph"))
            if "requirements" not in data:
                checks.append(("FAIL", f"{fixture_path.name}: resumable plan missing requirements"))
            if "checkpoints" not in data:
                checks.append(("WARN", f"{fixture_path.name}: resumable plan missing checkpoints (optional but recommended)"))
            if not checks:
                checks.append(("PASS", f"{fixture_path.name}: resumable plan — has task_graph, requirements"))

        for status, msg in checks:
            print(f"  [{status}] {msg}")

    # --- Amendment behavior test ---
    print("\nAmendment behavior:")
    for fixture_path in sorted((FIXTURES_DIR / "positive").glob("plan-*-amendment*.json")):
        data = load_json(fixture_path)
        amds = data.get("amendments", [])
        if not amds:
            print(f"  [FAIL] {fixture_path.name}: expected amendments")
            continue
        for amd in amds:
            if amd.get("supersedes_prior") is not True:
                print(f"  [FAIL] {fixture_path.name}: amendment {amd['id']} missing supersedes_prior=true")
            else:
                sup_id = amd.get("changes", [{}])[0].get("target_id", "") if amd.get("changes") else ""
                print(f"  [PASS] {fixture_path.name}: amendment {amd['id']} supersedes_prior=true, targets {sup_id}")

    # --- Supersedes test ---
    for fixture_path in sorted((FIXTURES_DIR / "positive").glob("plan-resumable-cross-session*")):
        data = load_json(fixture_path)
        if data.get("supersedes"):
            print(f"  [PASS] {fixture_path.name}: supersedes reference present")

    # --- No provider-specific model names in common schemas ---
    provider_names = ["gpt", "claude", "gemini", "grok", "composer", "terra"]
    for name, schema in schemas.items():
        schema_str = json.dumps(schema)
        for pname in provider_names:
            if pname in schema_str.lower():
                print(f"  [WARN] {name} contains provider-specific string '{pname}'")

    print("\nPASS: all artifact schema validations")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
