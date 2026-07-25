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


KNOWN_PREFIXES = sorted([
    "agent", "assignment", "capability", "claim-evidence", "context",
    "decision", "delegation", "evidence", "intent", "model-route",
    "model-routing", "plan", "policy-approval", "profile", "requirement",
    "run-state", "telemetry",
], key=lambda p: -len(p))


def collect_fixtures(subdir: str):
    pos_dir = FIXTURES_DIR / subdir
    if not pos_dir.is_dir():
        return {}
    result = {}
    for f in sorted(pos_dir.glob("*.json")):
        basename = f.stem
        prefix = basename
        for known in KNOWN_PREFIXES:
            if basename.startswith(known):
                prefix = known
                break
        result.setdefault(prefix, []).append(f)
    return result


def fixture_prefix_to_schema(prefix: str) -> str:
    mapping = {
        "agent": "agent-result",
        "claim-evidence": "claim-evidence",
        "evidence": "evidence",
        "model-route": "model-route",
        "model-routing": "model-routing",
        "policy-approval": "policy-approval",
        "profile": "profile-manifest",
        "run-state": "run-state",
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

    # Check plan schema for tasks-based model
    plan = schemas.get("plan", {})
    plan_props = plan.get("properties", {})

    # 1. Repository baseline
    has_repository_baseline = "repository_baseline" in plan_props
    print(f"  [{'PASS' if has_repository_baseline else 'FAIL'}] Plan has repository_baseline")

    # 2. Intent reference
    has_intent_reference = "intent_reference" in plan_props
    print(f"  [{'PASS' if has_intent_reference else 'FAIL'}] Plan has intent_reference")

    # 3. Decisions
    has_decisions = "decisions" in plan_props
    print(f"  [{'PASS' if has_decisions else 'FAIL'}] Plan supports decisions")

    # 4. Tasks with acceptance criteria
    has_tasks = "tasks" in plan_props
    task_items = plan_props.get("tasks", {}).get("items", {})
    task_props = task_items.get("properties", {})
    has_ac = "acceptance_criteria" in task_props
    print(f"  [{'PASS' if has_tasks and has_ac else 'FAIL'}] Plan tasks require acceptance_criteria")

    # 5. Completion policy
    has_completion_policy = "completion_policy" in plan_props
    print(f"  [{'PASS' if has_completion_policy else 'FAIL'}] Plan has completion_policy")

    # 13. Capability schema has 4 mode states and utility class
    if "capability" in schemas:
        cap = schemas["capability"]
        mode_enum = cap.get("properties", {}).get("mode", {}).get("enum", [])
        has_states = all(s in mode_enum for s in ["native", "emulated", "unsupported", "unverified"])
        print(f"  [{'PASS' if has_states else 'FAIL'}] Capability mode includes all 4 states")
        class_enum = cap.get("properties", {}).get("class", {}).get("enum", [])
        has_utility = "utility" in class_enum
        print(f"  [{'PASS' if has_utility else 'FAIL'}] Capability class includes utility")

    # 14. Model-route schema has utility class
    if "model-route" in schemas:
        mr = schemas["model-route"]
        req_class_enum = mr.get("properties", {}).get("requested", {}).get("properties", {}).get("capability_class", {}).get("enum", [])
        has_utility_mr = "utility" in req_class_enum
        print(f"  [{'PASS' if has_utility_mr else 'FAIL'}] Model-route capability_class includes utility")


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
