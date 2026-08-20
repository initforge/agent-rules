#!/usr/bin/env python3
"""Validate machine-readable rule ownership and enforcement metadata."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import yaml


ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "rules" / "manifest.yaml"


def fail(message: str) -> None:
    print(f"FAIL: {message}")
    raise SystemExit(1)


def main() -> None:
    try:
        manifest = yaml.safe_load(MANIFEST.read_text(encoding="utf-8"))
    except Exception as exc:
        fail(f"invalid rules/manifest.yaml: {exc}")
    contracts = manifest.get("rule_contracts")
    if not isinstance(contracts, dict) or not contracts:
        fail("rule_contracts must be a non-empty mapping")

    rule_files = sorted(p.name for p in (ROOT / "rules").glob("*.md") if p.name != "README.md")
    if set(contracts) != set(rule_files):
        missing = sorted(set(rule_files) - set(contracts))
        extra = sorted(set(contracts) - set(rule_files))
        fail(f"rule contract set mismatch; missing={missing}, extra={extra}")

    required = {"kind", "trigger", "normative", "owner", "enforcement", "evidence", "precedence", "failure", "fixture"}
    kinds = {"invariant", "policy", "gate"}
    failures = {"PASS", "BLOCKED", "NEEDS_USER", "FAILED"}
    precedences = []
    for filename in rule_files:
        entry = contracts[filename]
        if not isinstance(entry, dict):
            fail(f"{filename}: contract must be a mapping")
        missing = sorted(required - set(entry))
        if missing:
            fail(f"{filename}: missing metadata {missing}")
        if entry["kind"] not in kinds:
            fail(f"{filename}: invalid kind {entry['kind']!r}")
        if not all(isinstance(entry[field], str) and entry[field].strip() for field in ("trigger", "normative", "owner", "enforcement", "fixture")):
            fail(f"{filename}: trigger/normative/owner/enforcement/fixture must be non-empty strings")
        if entry["failure"] not in failures:
            fail(f"{filename}: invalid failure state {entry['failure']!r}")
        if not isinstance(entry["precedence"], int) or entry["precedence"] < 0:
            fail(f"{filename}: precedence must be a non-negative integer")
        precedences.append(entry["precedence"])
        evidence = entry["evidence"]
        if not isinstance(evidence, list) or not evidence:
            fail(f"{filename}: evidence must be a non-empty list")
        for raw_path in [*evidence, entry["fixture"]]:
            if not isinstance(raw_path, str) or not raw_path or not (ROOT / raw_path).is_file():
                fail(f"{filename}: evidence/fixture path missing: {raw_path!r}")

    if len(precedences) != len(set(precedences)):
        fail("rule precedence values must be unique")
    load_order = manifest.get("load_order")
    if not isinstance(load_order, list) or not all(isinstance(item, str) and item in contracts for item in load_order):
        fail("load_order must reference only contracted rule files")

    print(json.dumps({
        "status": "PASS",
        "rules": len(rule_files),
        "always_load": len(load_order),
        "precedence": [min(precedences), max(precedences)],
        "contract_sha256": __import__("hashlib").sha256(MANIFEST.read_bytes()).hexdigest(),
    }))


if __name__ == "__main__":
    main()
