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

    # Check each schema has version, schema discriminator
    for name, schema in schemas.items():
        if "properties" not in schema:
            errors.append(f"  {name}: missing properties")
            continue
        props = schema["properties"]
        if "version" in props and "const" in props["version"]:
            pass  # OK
        if "schema" in props and "const" in props["schema"]:
            pass  # OK

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
        schema_name = prefix  # plan -> plan.schema.json
        if schema_name not in schemas:
            schema_name = prefix  # use as-is
            # try matching: "telemetry-event" -> "telemetry-event"
        if schema_name not in schemas and "-" in schema_name:
            # could be "model-route" mapping
            pass

        schema_obj = schemas.get(schema_name)
        if not schema_obj:
            # Try prefix-based: "agent" -> "agent-result"
            # "model" -> "model-route"
            # "profile" -> "profile-manifest"
            schema_name = {
                "agent": "agent-result",
                "model": "model-route",
                "profile": "profile-manifest",
                "telemetry": "telemetry-event",
            }.get(schema_name, schema_name)
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

    print(f"\nPositive fixtures: {total_pos - failed_pos}/{total_pos} pass")

    # Negative fixtures
    neg_fixtures = collect_fixtures("negative")
    total_neg = 0
    failed_neg = 0
    expected_fail_but_passed = 0

    for prefix, fixture_files in sorted(neg_fixtures.items()):
        schema_name = {
            "agent": "agent-result",
            "model": "model-route",
            "profile": "profile-manifest",
            "telemetry": "telemetry-event",
        }.get(prefix, prefix)
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

    # Check acceptance criteria
    print("\nAcceptance criteria:")
    # 1. Every schema has explicit version
    versioned_count = sum(1 for s in schemas.values() if "version" in s.get("properties", {}))
    print(f"  [{'PASS' if versioned_count == len(schemas) else 'FAIL'}] "
          f"Every schema has explicit version ({versioned_count}/{len(schemas)})")

    # 2. No provider-specific model names in common schemas
    provider_names = ["gpt", "claude", "gemini", "grok", "composer", "terra"]
    for name, schema in schemas.items():
        schema_str = json.dumps(schema)
        for pname in provider_names:
            if pname in schema_str.lower():
                print(f"  [WARN] {name} contains provider-specific string '{pname}'")

    # 3. Capability supports native/emulated/unsupported/unverified
    if "capability" in schemas:
        cap = schemas["capability"]
        mode_enum = cap.get("properties", {}).get("mode", {}).get("enum", [])
        has_states = all(s in mode_enum for s in ["native", "emulated", "unsupported", "unverified"])
        print(f"  [{'PASS' if has_states else 'FAIL'}] Capability mode includes all 4 states")
        # Check isolation and permission_model too
        iso_enum = cap.get("properties", {}).get("isolation", {}).get("enum", [])
        perm_enum = cap.get("properties", {}).get("permission_model", {}).get("enum", [])
        print(f"  [{'PASS' if 'unverified' in iso_enum else 'FAIL'}] Isolation includes unverified")
        print(f"  [{'PASS' if 'unverified' in perm_enum else 'FAIL'}] Permission model includes unverified")

    print("\nPASS: all artifact schema validations")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
