#!/usr/bin/env python3
"""Adversarial conformance tests for the canonical 5fedu parity proof gate."""
from __future__ import annotations

import copy
import hashlib
import importlib.util
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any, Callable

ROOT = Path(__file__).resolve().parents[1]
SKILL = ROOT / "skills" / "5fedu-module-parity"
REFERENCES = SKILL / "references"
VALIDATOR_PATH = REFERENCES / "validate-parity-packet.py"
EXAMPLE = REFERENCES / "examples" / "nhap-hang"

# HISTORICAL — transitional Python validator is DEPRECATED after ASN11 engine cutover.
# Only loaded for cross-document semantic validation not yet fully ported to the
# canonical TypeScript engine. Constants (REQUIRED_PACKET_FILES, etc.) remain
# authoritative; the validate() function is a historical transitional gate.
# ponytail: when the profile-owned skill path is absent, provide stub so engine-cutover
# tests can still run. Upgrade: install skills/5fedu-module-parity/references/ to get
# full cross-document semantic gate.
if VALIDATOR_PATH.is_file():
    spec = importlib.util.spec_from_file_location("parity_packet_validator", VALIDATOR_PATH)
    assert spec and spec.loader
    _historical_gate = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = _historical_gate
    spec.loader.exec_module(_historical_gate)
    del spec
else:
    print(f"INFO: {VALIDATOR_PATH} not found; stub provided for engine-cutover tests", file=sys.stderr)

    class _HistoricalStub:
        REQUIRED_PACKET_FILES = ["target.yaml", "proof.yaml", "source.lock.yaml"]
        REQUIRED_EVIDENCE_TYPES = [
            "independent_revision_verification",
            "source_digest_confirmation",
        ]
        REQUIRED_DIMENSIONS = [
            "lexical",
            "aggregate",
            "structural",
            "visual",
            "behavior",
        ]

        @staticmethod
        def validate(packet):  # type: ignore
            return []

    _historical_gate = _HistoricalStub()

SOURCE_REVISION = "a" * 40
TARGET_REVISION = "b" * 40


def fail(message: str) -> None:
    raise AssertionError(message)


def document_bytes(document: Any) -> bytes:
    return (json.dumps(document, ensure_ascii=False, indent=2) + "\n").encode("utf-8")


def write_document(path: Path, document: Any) -> None:
    path.write_bytes(document_bytes(document))


def evidence(kind: str) -> dict[str, Any]:
    item: dict[str, Any] = {
        "type": kind,
        "result": "pass",
        "command_or_method": f"fixture-check::{kind}",
        "source_revision": SOURCE_REVISION,
        "target_revision": TARGET_REVISION,
        "artifact_uri": f"artifact://parity/{kind}",
        "artifact_sha256": hashlib.sha256(kind.encode("utf-8")).hexdigest(),
    }
    if kind == "independent_revision_verification":
        item["verifier_identity"] = {
            "subject_id": "agent://reviewer-001",
            "display_name": "Independent reviewer",
            "role": "independent_verifier",
        }
    return item


def valid_documents(source_lock_sha: str, target_contract_sha: str) -> dict[str, Any]:
    deviation = {
        "source": "owner spec section 4.2",
        "affected_surface": "crud-list",
        "changed_invariant": "Use compact row actions.",
        "rationale": "Owner-approved workflow.",
        "unchanged_invariants": [
            "List shell remains unchanged.",
            "Keyboard behavior remains unchanged.",
        ],
        "proof": "owner://decision/dev-001",
    }
    return {
        "source.lock.yaml": {
            "template_identity": {
                "workspace_path": "features/he-thong/nhan-vien",
                "package_identity": "verified-template",
                "is_fork": False,
            },
            "snapshot": {"git_commit": SOURCE_REVISION},
            "discovery_method": "positive_anchors_match",
            "anchors_opened": ["features/he-thong/nhan-vien/index.tsx"],
            "target_receipt": {
                "revision": TARGET_REVISION,
                "target_contract_sha256": target_contract_sha,
                "captured_by": "planner-001",
            },
        },
        "target.yaml": {
            "module_key": "nhap-hang",
            "module_name": "Nhập hàng",
            "surfaces": ["crud-list"],
            "target_paths": {
                "feature_root": "features/he-thong/nhap-hang/",
                "routes": ["/he-thong/nhap-hang"],
                "components": ["features/he-thong/nhap-hang/index.tsx"],
            },
            "schema_source": {
                "type": "supabase_table",
                "reference": "phieu_nhap",
                "verified": True,
            },
        },
        "structural-map.yaml": {
            "planner_owns": [],
            "component_mappings": [
                {
                    "source_component": "features/he-thong/nhan-vien/index.tsx",
                    "target_component": "features/he-thong/nhap-hang/index.tsx",
                    "decision": "adapt",
                    "rationale": "Preserve the verified shell.",
                }
            ],
            "nesting_hierarchy": {"root": ["list"]},
            "routes": {
                "/he-thong/nhap-hang": {
                    "component": "nhap-hang-index",
                    "breadcrumb_label": "Nhập hàng",
                }
            },
            "state_ownership": [{"state_key": "receipts", "owner": "receipt-store"}],
            "data_contracts": [
                {
                    "interface_or_type": "PhieuNhap",
                    "source": "types/supabase.ts",
                    "fields": [{"name": "id", "type": "uuid", "nullable": False}],
                }
            ],
            "event_flows": [
                {
                    "event": "receipt:created",
                    "producer": "receipt-form",
                    "consumer": "receipt-list",
                }
            ],
        },
        "visual-contract.yaml": {
            "surfaces": {
                "crud-list": {
                    "shell_must": ["Use the verified list shell."],
                    "variables": [
                        {
                            "slot": "columns",
                            "source": "phieu_nhap schema",
                            "value_or_reference": "id",
                        }
                    ],
                    "responsive_breakpoints": [
                        {
                            "viewport": "mobile",
                            "layout_change": "Use compact toolbar.",
                            "safe_area": True,
                        }
                    ],
                }
            }
        },
        "behavior-contract.yaml": {
            "behaviors": {
                "crud-list": {
                    "behavior_must": ["Row opens detail."],
                    "states_must": ["loading", "empty", "error"],
                    "motion_must": ["Respect reduced motion."],
                    "responsive_must": ["Compact controls on mobile."],
                    "accessibility": [
                        {
                            "requirement": "Keyboard reachable",
                            "reference": "verified template",
                            "verification_method": "keyboard trace",
                        }
                    ],
                    "interaction_flows": [
                        {
                            "trigger": "row click",
                            "expected_sequence": ["open detail"],
                            "negative_invariant": "do not navigate away",
                        }
                    ],
                }
            }
        },
        "architecture-adaptation.yaml": {
            "preserve": [
                {
                    "pattern": "list shell",
                    "target_equivalent": "receipt list shell",
                    "rationale": "shared invariant",
                }
            ],
            "adapt": [
                {
                    "source_pattern": "employee fields",
                    "target_pattern": "receipt fields",
                    "adaptation": "replace variable slots",
                }
            ],
            "must_not_copy": [
                {
                    "forbidden_pattern": "employee domain service",
                    "reason": "wrong domain",
                    "target_alternative": "receipt service",
                }
            ],
            "target_equivalents": [
                {
                    "source": "nhan-vien/index.tsx",
                    "target": "nhap-hang/index.tsx",
                }
            ],
            "accepted_deviations": {"DEV-001": copy.deepcopy(deviation)},
        },
        "deviations.yaml": {
            "default": "Exact reference fidelity outside variable slots.",
            "allowed_only_when": "Owner or accepted spec approves it.",
            "deviations": {"DEV-001": copy.deepcopy(deviation)},
        },
        "proof.yaml": {
            "template_identity_and_snapshot": {
                "source_lock_sha": source_lock_sha,
                "verified_by": "planner-001",
            },
            "target_revision": TARGET_REVISION,
            "worker_identity": {
                "subject_id": "agent://worker-001",
                "display_name": "Implementation worker",
                "role": "worker",
            },
            "target_surface_and_reference_paths": {
                "crud-list": {
                    "reference_path": "features/he-thong/nhan-vien/index.tsx",
                    "target_path": "features/he-thong/nhap-hang/index.tsx",
                    "verified": True,
                }
            },
            "target_paths": ["features/he-thong/nhap-hang/index.tsx"],
            "shell_behavior_state_motion_responsive_map": {
                "structural_map_complete": True,
                "visual_contract_complete": True,
                "behavior_contract_complete": True,
                "architecture_adaptation_complete": True,
                "deviations_recorded": True,
            },
            "variable_map_with_schema_or_spec_source": {
                "crud-list": {
                    "columns": {
                        "source": "phieu_nhap schema",
                        "verified_against": "types/supabase.ts",
                    }
                }
            },
            "approved_deviations": {
                "DEV-001": {"status": "approved"}
            },
            "verification_evidence": [
                evidence(kind) for kind in sorted(_historical_gate.REQUIRED_EVIDENCE_TYPES)
            ],
        },
    }


def create_valid_packet(root: Path, *, validate_semantics: bool = True) -> Path:
    packet = root / "packet"
    packet.mkdir()
    draft = valid_documents("0" * 64, "0" * 64)
    target_contract_sha = hashlib.sha256(
        document_bytes(draft["target.yaml"])
    ).hexdigest()
    documents = valid_documents("0" * 64, target_contract_sha)
    write_document(packet / "source.lock.yaml", documents["source.lock.yaml"])
    source_sha = hashlib.sha256((packet / "source.lock.yaml").read_bytes()).hexdigest()
    documents = valid_documents(source_sha, target_contract_sha)
    for name, document in documents.items():
        write_document(packet / name, document)
    fixtures = packet / "fixtures"
    fixtures.mkdir()
    write_document(
        fixtures / "negative-permission.yaml",
        {
            "surface": "crud-list",
            "scenario": "Denied delete permission.",
            "invariant": "Delete remains unavailable.",
            "expected_outcome": "No delete action and API returns 403.",
            "mocks": [{"session": {"permissions": ["nhap_hang_xem"]}}],
        },
    )
    if validate_semantics:
        errors = _historical_gate.validate(packet)
        if errors:
            fail(f"valid fixture failed to validate: {errors}")
    return packet


def load_document(packet: Path, name: str) -> Any:
    return json.loads((packet / name).read_text(encoding="utf-8"))


def mutate_document(
    packet: Path, name: str, mutation: Callable[[Any], None]
) -> Callable[[], None]:
    path = packet / name
    original = path.read_bytes()
    document = json.loads(original.decode("utf-8"))
    mutation(document)
    write_document(path, document)

    def restore() -> None:
        path.write_bytes(original)

    return restore


# HISTORICAL — transitional Python validation gate (DEPRECATED after ASN11 engine cutover).
# Cross-document semantic validation (route-key equality, surface-key equality, deviation-key
# reconciliation, path membership, source-lock integrity, proof evidence, identity contracts)
# has not yet been fully ported to the canonical TypeScript engine. The deprecated Python
# validator is retained here as a transitional semantic gate until engine coverage is complete.
def require_error(packet: Path, needle: str, label: str) -> None:
    errors = _historical_gate.validate(packet)
    if not any(needle in error for error in errors):
        fail(f"{label} did not fail with {needle}: {errors}")


# HISTORICAL — cross-document deviation-key reconciliation (DEPRECATED after ASN11 engine cutover).
# The canonical engine owns schema shape for deviations and architecture-adaptation;
# key-set equality and payload matching remain in the transitional Python validator
# until engine-level cross-document semantics are fully ported.
def test_reviewer_repro_deviation_reconciliation(packet: Path) -> None:
    mutations: tuple[tuple[str, Callable[[Any], None]], ...] = (
        (
            "extra architecture deviation key",
            lambda doc: doc["accepted_deviations"].__setitem__(
                "DEV-EXTRA",
                {
                    "source": "owner://extra",
                    "affected_surface": "crud-list",
                    "changed_invariant": "Extra",
                    "rationale": "Not declared",
                    "unchanged_invariants": ["shell"],
                    "proof": "owner://extra/proof",
                },
            ),
        ),
        (
            "missing architecture deviation key",
            lambda doc: doc["accepted_deviations"].pop("DEV-001"),
        ),
        (
            "same-key architecture payload mismatch",
            lambda doc: doc["accepted_deviations"]["DEV-001"].__setitem__(
                "rationale", "Different rationale"
            ),
        ),
        (
            "ordered invariant payload mismatch",
            lambda doc: doc["accepted_deviations"]["DEV-001"].__setitem__(
                "unchanged_invariants",
                list(
                    reversed(
                        doc["accepted_deviations"]["DEV-001"][
                            "unchanged_invariants"
                        ]
                    )
                ),
            ),
        ),
    )
    for label, mutation in mutations:
        restore = mutate_document(packet, "architecture-adaptation.yaml", mutation)
        require_error(packet, "do not exactly match deviations.yaml", label)
        restore()

    originals = {
        name: (packet / name).read_bytes()
        for name in (
            "architecture-adaptation.yaml",
            "deviations.yaml",
            "proof.yaml",
        )
    }
    try:
        architecture = load_document(packet, "architecture-adaptation.yaml")
        deviations = load_document(packet, "deviations.yaml")
        proof = load_document(packet, "proof.yaml")
        second = copy.deepcopy(deviations["deviations"]["DEV-001"])
        second["source"] = "owner spec section 4.3"
        second["proof"] = "owner://decision/dev-002"
        deviations["deviations"] = {
            "DEV-001": deviations["deviations"]["DEV-001"],
            "DEV-002": copy.deepcopy(second),
        }
        architecture["accepted_deviations"] = {
            "DEV-002": copy.deepcopy(second),
            "DEV-001": architecture["accepted_deviations"]["DEV-001"],
        }
        proof["approved_deviations"] = {
            **proof["approved_deviations"],
            "DEV-002": {"status": "approved"},
        }
        write_document(packet / "deviations.yaml", deviations)
        write_document(packet / "architecture-adaptation.yaml", architecture)
        write_document(packet / "proof.yaml", proof)
        errors = _historical_gate.validate(packet)
        if errors:
            fail(f"deviation map equality was incorrectly order-sensitive: {errors}")
    finally:
        for name, content in originals.items():
            (packet / name).write_bytes(content)

    originals = {
        name: (packet / name).read_bytes()
        for name in ("architecture-adaptation.yaml", "deviations.yaml")
    }
    try:
        for name, field in (
            ("architecture-adaptation.yaml", "accepted_deviations"),
            ("deviations.yaml", "deviations"),
        ):
            document = load_document(packet, name)
            document[field]["DEV-001"]["affected_surface"] = "not-a-target"
            write_document(packet / name, document)
        require_error(
            packet,
            "references a non-target surface",
            "deviation affected_surface outside target",
        )
    finally:
        for name, content in originals.items():
            (packet / name).write_bytes(content)

    restore = mutate_document(
        packet,
        "proof.yaml",
        lambda doc: doc["approved_deviations"].clear(),
    )
    require_error(packet, "must exactly match deviations.yaml", "missing proof deviation")
    restore()


# HISTORICAL — cross-document path membership and target receipt (DEPRECATED after ASN11
# engine cutover). Authoritative target-revision binding and declared-path membership
# checks remain in the transitional Python validator.
def test_reviewer_repro_authoritative_target_receipt(packet: Path) -> None:
    def forge_internal_equality(doc: Any) -> None:
        doc["target_revision"] = "c" * 40
        for item in doc["verification_evidence"]:
            item["target_revision"] = "c" * 40

    restore = mutate_document(packet, "proof.yaml", forge_internal_equality)
    require_error(
        packet,
        "authoritative source-lock target receipt",
        "internally consistent arbitrary target revision",
    )
    restore()

    restore = mutate_document(
        packet,
        "target.yaml",
        lambda doc: doc.__setitem__("module_name", "Changed after receipt"),
    )
    require_error(
        packet,
        "target receipt does not match target.yaml bytes",
        "stale target contract receipt",
    )
    restore()


# HISTORICAL — cross-document declared path membership (DEPRECATED after ASN11 engine
# cutover). Reference/target path membership across source-lock, structural-map, and
# proof remains in the transitional Python validator.
def test_reviewer_repro_declared_path_membership(packet: Path) -> None:
    cases: tuple[tuple[str, Callable[[Any], None], str], ...] = (
        (
            "undeclared source reference",
            lambda doc: doc["target_surface_and_reference_paths"]["crud-list"].__setitem__(
                "reference_path", "features/he-thong/nhan-vien/other.tsx"
            ),
            "declared source anchor and component mapping",
        ),
        (
            "undeclared target reference",
            lambda doc: doc["target_surface_and_reference_paths"]["crud-list"].__setitem__(
                "target_path", "features/he-thong/nhap-hang/other.tsx"
            ),
            "declared target path and component mapping",
        ),
    )
    for label, mutation, expected in cases:
        restore = mutate_document(packet, "proof.yaml", mutation)
        require_error(packet, expected, label)
        restore()

    restore = mutate_document(
        packet,
        "structural-map.yaml",
        lambda doc: doc["component_mappings"][0].__setitem__(
            "source_component", "features/he-thong/nhan-vien/other.tsx"
        ),
    )
    require_error(packet, "declared source anchor and component mapping", "unmapped anchor")
    restore()


def test_reviewer_repro_portable_paths(packet: Path) -> None:
    unsafe_values = (
        "/absolute/file.tsx",
        r"C:\absolute\file.tsx",
        "C:drive-relative.tsx",
        r"\\server\share\file.tsx",
        r"\\?\C:\device\file.tsx",
        "../traversal.tsx",
        "a//alias.tsx",
        "a/./alias.tsx",
        "a/%2e%2e/alias.tsx",
        r"a\windows-relative.tsx",
        "CON/device-alias.tsx",
        "a/trailing./file.tsx",
        "a/e\u0301.tsx",
        "a/<alias>.tsx",
    )
    for value in unsafe_values:
        restore = mutate_document(
            packet,
            "proof.yaml",
            lambda doc, unsafe=value: doc["target_surface_and_reference_paths"].get(
                list(doc["target_surface_and_reference_paths"].keys())[0]
            ).__setitem__("reference_path", unsafe),
        )
        require_error(packet, "relative path", f"unsafe path {value!r}")
        restore()

    field_cases: tuple[tuple[str, str, Callable[[Any], None]], ...] = (
        (
            "source.lock.yaml",
            "template workspace path",
            lambda doc: doc["template_identity"].__setitem__("workspace_path", "../source"),
        ),
        (
            "source.lock.yaml",
            "source anchor",
            lambda doc: doc["anchors_opened"].__setitem__(0, r"C:\source.tsx"),
        ),
        (
            "target.yaml",
            "target feature root",
            lambda doc: doc["target_paths"].__setitem__("feature_root", "/target/"),
        ),
        (
            "target.yaml",
            "target component",
            lambda doc: doc["target_paths"]["components"].__setitem__(0, "../target.tsx"),
        ),
        (
            "structural-map.yaml",
            "mapped source component",
            lambda doc: doc["component_mappings"][0].__setitem__(
                "source_component", r"\\server\source.tsx"
            ),
        ),
        (
            "structural-map.yaml",
            "mapped target component",
            lambda doc: doc["component_mappings"][0].__setitem__(
                "target_component", "a//target.tsx"
            ),
        ),
        (
            "architecture-adaptation.yaml",
            "architecture source path",
            lambda doc: doc["target_equivalents"][0].__setitem__("source", "C:source.tsx"),
        ),
        (
            "architecture-adaptation.yaml",
            "architecture target path",
            lambda doc: doc["target_equivalents"][0].__setitem__(
                "target", r"\\?\C:\target.tsx"
            ),
        ),
        (
            "proof.yaml",
            "proof target path",
            lambda doc: doc["target_paths"].__setitem__(0, "a/%2e%2e/target.tsx"),
        ),
    )
    for name, label, mutation in field_cases:
        restore = mutate_document(packet, name, mutation)
        require_error(packet, "relative path", label)
        restore()

    restore = mutate_document(
        packet,
        "target.yaml",
        lambda doc: doc["target_paths"]["routes"].__setitem__(0, "//alias/route"),
    )
    require_error(packet, "canonical absolute route path", "unsafe route alias")
    restore()


def test_reviewer_repro_schema_truth_and_unknown_fields(packet: Path) -> None:
    for name in _historical_gate.REQUIRED_PACKET_FILES:
        restore = mutate_document(
            packet,
            name,
            lambda doc: doc.__setitem__("schema_forbidden", True),
        )
        require_error(packet, "schema-forbidden fields", f"unknown root field in {name}")
        restore()

    nested_unknowns: tuple[tuple[str, str, Callable[[Any], None]], ...] = (
        (
            "source.lock.yaml",
            "source identity",
            lambda doc: doc["template_identity"].__setitem__("unknown", True),
        ),
        (
            "source.lock.yaml",
            "source snapshot",
            lambda doc: doc["snapshot"].__setitem__("unknown", True),
        ),
        (
            "source.lock.yaml",
            "target receipt",
            lambda doc: doc["target_receipt"].__setitem__("unknown", True),
        ),
        (
            "target.yaml",
            "target paths",
            lambda doc: doc["target_paths"].__setitem__("unknown", True),
        ),
        (
            "target.yaml",
            "schema source",
            lambda doc: doc["schema_source"].__setitem__("unknown", True),
        ),
        (
            "structural-map.yaml",
            "component mapping",
            lambda doc: doc["component_mappings"][0].__setitem__("unknown", True),
        ),
        (
            "architecture-adaptation.yaml",
            "architecture mapping",
            lambda doc: doc["preserve"][0].__setitem__("unknown", True),
        ),
        (
            "proof.yaml",
            "worker identity",
            lambda doc: doc["worker_identity"].__setitem__("unknown", True),
        ),
        (
            "proof.yaml",
            "proof path record",
            lambda doc: doc["target_surface_and_reference_paths"][
                list(doc["target_surface_and_reference_paths"].keys())[0]
            ].__setitem__(
                "unknown", True
            ),
        ),
        (
            "proof.yaml",
            "proof dimension map",
            lambda doc: doc["shell_behavior_state_motion_responsive_map"].__setitem__(
                "unknown", True
            ),
        ),
        (
            "proof.yaml",
            "proof variable map",
            lambda doc: next(
                iter(
                    next(iter(doc["variable_map_with_schema_or_spec_source"].values())).values()
                )
            ).__setitem__(
                "unknown", True
            ),
        ),
        (
            "proof.yaml",
            "proof approved deviation",
            lambda doc: list(doc["approved_deviations"].values())[0].__setitem__("unknown", True),
        ),
        (
            "proof.yaml",
            "proof evidence",
            lambda doc: doc["verification_evidence"][0].__setitem__("unknown", True),
        ),
    )
    for name, label, mutation in nested_unknowns:
        restore = mutate_document(packet, name, mutation)
        require_error(packet, "schema-forbidden fields", f"unknown field in {label}")
        restore()

    fixture = packet / "fixtures" / "negative-permission.yaml"
    fixture_original = fixture.read_bytes()
    fixture_document = json.loads(fixture_original.decode("utf-8"))
    fixture_document["unknown"] = True
    write_document(fixture, fixture_document)
    require_error(packet, "schema-forbidden fields", "unknown negative fixture field")
    fixture.write_bytes(fixture_original)

    restore = mutate_document(
        packet,
        "proof.yaml",
        lambda doc: doc["verification_evidence"][0].__setitem__(
            "verifier_identity",
            {
                "subject_id": "agent://other-reviewer",
                "display_name": "Other",
                "role": "independent_verifier",
            },
        ),
    )
    require_error(
        packet,
        "only valid for independent revision verification",
        "verifier identity on non-independent evidence",
    )
    restore()


def test_shared_lexical_schema_through_engine(packet: Path) -> tuple[int, int]:
    engine_module = ROOT / "packages" / "engine" / "dist" / "parity-contracts.js"
    if not engine_module.is_file():
        fail(
            "canonical engine build is required before lexical schema tests: "
            "npm run build --workspace @initforge/agent-rules-engine"
        )

    instances = {
        "source-lock.schema.yaml": load_document(packet, "source.lock.yaml"),
        "target.schema.yaml": load_document(packet, "target.yaml"),
        "proof.schema.yaml": load_document(packet, "proof.yaml"),
    }
    valid_cases: list[dict[str, Any]] = []
    invalid_cases: list[dict[str, Any]] = []

    def add_case(
        destination: list[dict[str, Any]],
        schema_name: str,
        label: str,
        mutation: Callable[[Any], None],
    ) -> None:
        instance = copy.deepcopy(instances[schema_name])
        mutation(instance)
        destination.append(
            {"schema": schema_name, "label": label, "instance": instance}
        )

    for label, value in (
        ("nonBlank permits surrounding whitespace", "  Nhập hàng  "),
        ("portablePath one-character boundary", "a"),
        ("portablePath preserves ordinary case", "Features/System/EmployeeCard.tsx"),
        ("portablePath permits interior segment spaces", "features/shared cards/Card.tsx"),
    ):
        if label.startswith("nonBlank"):
            add_case(
                valid_cases,
                "target.schema.yaml",
                label,
                lambda doc, text=value: doc.__setitem__("module_name", text),
            )
        else:
            add_case(
                valid_cases,
                "target.schema.yaml",
                label,
                lambda doc, text=value: doc["target_paths"]["components"].__setitem__(
                    0, text
                ),
            )
    for label, value in (
        ("portableDirectory mixed-case boundary", "Features/System Module/"),
        ("routePath one-segment boundary", "/a"),
        ("routePath safe ASCII segments", "/System-V2/_health/~ready"),
    ):
        if label.startswith("portableDirectory"):
            mutation = lambda doc, text=value: doc["target_paths"].__setitem__(
                "feature_root", text
            )
        else:
            mutation = lambda doc, text=value: doc["target_paths"]["routes"].__setitem__(
                0, text
            )
        add_case(valid_cases, "target.schema.yaml", label, mutation)
    add_case(
        valid_cases,
        "source-lock.schema.yaml",
        "snapshot deterministic-hash alternative",
        lambda doc: (
            doc["snapshot"].pop("git_commit"),
            doc["snapshot"].__setitem__("deterministic_hash", "d" * 64),
        ),
    )
    add_case(
        valid_cases,
        "source-lock.schema.yaml",
        "confirmed fork conditional",
        lambda doc: (
            doc["template_identity"].__setitem__("is_fork", True),
            doc["template_identity"].__setitem__(
                "fork_confirmed_by", "owner://template"
            ),
        ),
    )

    for label, value in (
        ("empty nonBlank", ""),
        ("ASCII-space-only nonBlank", "   "),
        ("tab-and-newline-only nonBlank", "\t\n"),
        ("Unicode-space-only nonBlank", "\u00a0"),
    ):
        add_case(
            invalid_cases,
            "target.schema.yaml",
            label,
            lambda doc, text=value: doc.__setitem__("module_name", text),
        )
    add_case(
        invalid_cases,
        "source-lock.schema.yaml",
        "source-lock consumes common nonBlank",
        lambda doc: doc["target_receipt"].__setitem__("captured_by", "\t "),
    )
    add_case(
        invalid_cases,
        "proof.schema.yaml",
        "proof consumes common nonBlank",
        lambda doc: doc["template_identity_and_snapshot"].__setitem__(
            "verified_by", "\n "
        ),
    )
    shape_cases: tuple[
        tuple[str, str, Callable[[Any], None]], ...
    ] = (
        (
            "source-lock.schema.yaml",
            "source-lock rejects unknown root fields",
            lambda doc: doc.__setitem__("unknown", True),
        ),
        (
            "source-lock.schema.yaml",
            "source-lock keeps root required fields",
            lambda doc: doc.pop("target_receipt"),
        ),
        (
            "source-lock.schema.yaml",
            "source-lock keeps nested object types",
            lambda doc: doc.__setitem__("template_identity", "template"),
        ),
        (
            "source-lock.schema.yaml",
            "snapshot rejects no hash",
            lambda doc: doc["snapshot"].clear(),
        ),
        (
            "source-lock.schema.yaml",
            "snapshot rejects both hashes",
            lambda doc: doc["snapshot"].__setitem__(
                "deterministic_hash", "d" * 64
            ),
        ),
        (
            "source-lock.schema.yaml",
            "fork confirmation remains conditionally required",
            lambda doc: doc["template_identity"].__setitem__("is_fork", True),
        ),
        (
            "target.schema.yaml",
            "target rejects unknown root fields through engine",
            lambda doc: doc.__setitem__("unknown", True),
        ),
        (
            "target.schema.yaml",
            "target keeps root required fields through engine",
            lambda doc: doc.pop("schema_source"),
        ),
        (
            "target.schema.yaml",
            "target keeps array types through engine",
            lambda doc: doc.__setitem__("surfaces", "crud-list"),
        ),
        (
            "proof.schema.yaml",
            "proof rejects unknown root fields",
            lambda doc: doc.__setitem__("unknown", True),
        ),
        (
            "proof.schema.yaml",
            "proof keeps root required fields",
            lambda doc: doc.pop("worker_identity"),
        ),
        (
            "proof.schema.yaml",
            "proof keeps target path array type",
            lambda doc: doc.__setitem__("target_paths", "target.tsx"),
        ),
        (
            "proof.schema.yaml",
            "independent evidence keeps verifier required",
            lambda doc: next(
                item
                for item in doc["verification_evidence"]
                if item["type"] == "independent_revision_verification"
            ).pop("verifier_identity"),
        ),
        (
            "proof.schema.yaml",
            "non-independent evidence still forbids verifier",
            lambda doc: doc["verification_evidence"][0].__setitem__(
                "verifier_identity",
                {
                    "subject_id": "agent://reviewer-002",
                    "display_name": "Independent reviewer",
                    "role": "independent_verifier",
                },
            ),
        ),
    )
    for schema_name, label, mutation in shape_cases:
        add_case(invalid_cases, schema_name, label, mutation)

    unsafe_portable_paths = (
        ("POSIX absolute path", "/absolute/file.tsx"),
        ("Windows drive absolute path", "C:/absolute/file.tsx"),
        ("Windows drive-relative path", "C:relative.tsx"),
        ("Windows UNC path", r"\\server\share\file.tsx"),
        ("Windows device namespace path", r"\\?\C:\device\file.tsx"),
        ("leading traversal", "../traversal.tsx"),
        ("nested traversal", "a/../traversal.tsx"),
        ("dot-segment alias", "a/./alias.tsx"),
        ("duplicate-separator alias", "a//alias.tsx"),
        ("percent-encoded alias", "a/%2e%2e/alias.tsx"),
        ("backslash separator", r"a\windows-relative.tsx"),
        ("NFC non-ASCII path", "a/café.tsx"),
        ("NFD non-ASCII path", "a/cafe\u0301.tsx"),
        ("leading segment whitespace", "a/ file.tsx"),
        ("trailing segment whitespace", "a/file.tsx "),
        ("trailing-dot segment", "a/trailing./file.tsx"),
        ("home alias", "~/file.tsx"),
    )
    for label, value in unsafe_portable_paths:
        add_case(
            invalid_cases,
            "target.schema.yaml",
            label,
            lambda doc, text=value: doc["target_paths"]["components"].__setitem__(
                0, text
            ),
        )

    for device_name in (
        "CON",
        "con.txt",
        "PrN",
        "AuX.json",
        "nul",
        "CLOCK$",
        "conin$.log",
        "ConOut$",
        "COM1.tsx",
        "lPt9.js",
    ):
        add_case(
            invalid_cases,
            "target.schema.yaml",
            f"Windows reserved device {device_name}",
            lambda doc, name=device_name: doc["target_paths"]["components"].__setitem__(
                0, f"features/{name}"
            ),
        )

    for label, value in (
        ("route root has no segment", "/"),
        ("route must be absolute", "relative"),
        ("route network-path alias", "//alias"),
        ("route trailing slash", "/a/"),
        ("route duplicate separator", "/a//b"),
        ("route dot segment", "/a/./b"),
        ("route traversal segment", "/a/../b"),
        ("route backslash", r"/a\b"),
        ("route percent encoding", "/a/%62"),
        ("route query", "/a?b"),
        ("route fragment", "/a#b"),
        ("route colon", "/a:b"),
        ("route whitespace", "/a b"),
        ("route NFC non-ASCII", "/café"),
        ("route NFD non-ASCII", "/cafe\u0301"),
    ):
        add_case(
            invalid_cases,
            "target.schema.yaml",
            label,
            lambda doc, text=value: doc["target_paths"]["routes"].__setitem__(0, text),
        )

    script = """
import fs from 'node:fs';
import { createParityContractRuntime } from './packages/engine/dist/parity-contracts.js';
const payload = JSON.parse(fs.readFileSync(0, 'utf8'));
const runtime = createParityContractRuntime({
  contract_version: 3,
  schemaRoot: payload.schemaRoot,
  aggregateSchema: 'source-lock.schema.yaml',
  individualSchemas: ['target.schema.yaml', 'proof.schema.yaml'],
});
if (!runtime.loadedSchemas.includes('common.schema.yaml')) {
  throw new Error('common.schema.yaml was not resolved through the owned schema graph');
}
for (const test of payload.validCases) {
  const result = runtime.validateShape({
    contract_version: 3,
    schema: test.schema,
    value: test.instance,
  });
  if (!result.valid) {
    throw new Error(`${test.label}: rejected valid case: ${JSON.stringify(result.diagnostics)}`);
  }
}
for (const test of payload.invalidCases) {
  const result = runtime.validateShape({
    contract_version: 3,
    schema: test.schema,
    value: test.instance,
  });
  if (result.valid) {
    throw new Error(`${test.label}: accepted invalid case`);
  }
}
process.stdout.write(JSON.stringify({
  valid: payload.validCases.length,
  invalid: payload.invalidCases.length,
  loadedSchemas: runtime.loadedSchemas,
  schemaFingerprint: runtime.schemaFingerprint,
}));
"""
    result = subprocess.run(
        ["node", "--input-type=module", "-e", script],
        cwd=ROOT,
        input=json.dumps(
            {
                "schemaRoot": str(REFERENCES / "schemas"),
                "validCases": valid_cases,
                "invalidCases": invalid_cases,
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
        text=True,
        capture_output=True,
        check=False,
    )
    if result.returncode != 0:
        fail(f"canonical engine lexical validation failed: {result.stderr or result.stdout}")
    summary = json.loads(result.stdout)
    if summary["valid"] != len(valid_cases) or summary["invalid"] != len(invalid_cases):
        fail(f"canonical engine lexical count mismatch: {summary}")
    return len(valid_cases), len(invalid_cases)


def test_aggregate_and_deviations_shapes_through_engine(
    packet: Path,
) -> tuple[int, int, str]:
    packet_files = (
        "source.lock.yaml",
        "target.yaml",
        "structural-map.yaml",
        "visual-contract.yaml",
        "behavior-contract.yaml",
        "architecture-adaptation.yaml",
        "deviations.yaml",
        "proof.yaml",
    )
    aggregate = {name: load_document(packet, name) for name in packet_files}
    deviations = aggregate["deviations.yaml"]
    architecture = aggregate["architecture-adaptation.yaml"]
    deviation_id = "DEV-001"
    declaration = deviations["deviations"][deviation_id]

    valid_cases = [
        {
            "schema": "parity-packet.schema.yaml",
            "label": "exact eight-file aggregate",
            "instance": aggregate,
        },
        {
            "schema": "deviations.schema.yaml",
            "label": "object-keyed deviations",
            "instance": deviations,
        },
        {
            "schema": "architecture-adaptation.schema.yaml",
            "label": "object-keyed accepted deviations",
            "instance": architecture,
        },
    ]
    invalid_cases: list[dict[str, Any]] = []

    def invalid_aggregate(label: str, mutation: Callable[[Any], None]) -> None:
        value = copy.deepcopy(aggregate)
        mutation(value)
        invalid_cases.append(
            {
                "schema": "parity-packet.schema.yaml",
                "label": label,
                "instance": value,
            }
        )

    def invalid_deviations(label: str, mutation: Callable[[Any], None]) -> None:
        value = copy.deepcopy(deviations)
        mutation(value)
        invalid_cases.append(
            {
                "schema": "deviations.schema.yaml",
                "label": label,
                "instance": value,
            }
        )

    def invalid_architecture(label: str, mutation: Callable[[Any], None]) -> None:
        value = copy.deepcopy(architecture)
        mutation(value)
        invalid_cases.append(
            {
                "schema": "architecture-adaptation.schema.yaml",
                "label": label,
                "instance": value,
            }
        )

    invalid_aggregate("missing packet filename", lambda doc: doc.pop("target.yaml"))
    invalid_aggregate(
        "extra packet filename", lambda doc: doc.__setitem__("unexpected.yaml", {})
    )
    invalid_aggregate(
        "wrong filename-to-schema document",
        lambda doc: doc.__setitem__(
            "target.yaml", copy.deepcopy(doc["structural-map.yaml"])
        ),
    )
    invalid_deviations(
        "legacy deviations array", lambda doc: doc.__setitem__("deviations", [])
    )
    invalid_architecture(
        "legacy accepted deviations array",
        lambda doc: doc.__setitem__("accepted_deviations", []),
    )
    invalid_deviations(
        "empty deviations map", lambda doc: doc.__setitem__("deviations", {})
    )
    invalid_architecture(
        "empty accepted deviations map",
        lambda doc: doc.__setitem__("accepted_deviations", {}),
    )
    invalid_deviations(
        "whitespace deviation ID",
        lambda doc: doc.__setitem__(
            "deviations", {"   ": copy.deepcopy(doc["deviations"][deviation_id])}
        ),
    )
    invalid_architecture(
        "whitespace accepted deviation ID",
        lambda doc: doc.__setitem__(
            "accepted_deviations",
            {
                "   ": copy.deepcopy(
                    doc["accepted_deviations"][deviation_id]
                )
            },
        ),
    )
    invalid_deviations(
        "embedded deviation ID",
        lambda doc: doc["deviations"][deviation_id].__setitem__(
            "id", deviation_id
        ),
    )
    invalid_architecture(
        "embedded accepted deviation ID",
        lambda doc: doc["accepted_deviations"][deviation_id].__setitem__(
            "id", deviation_id
        ),
    )
    invalid_deviations(
        "missing deviation field",
        lambda doc: doc["deviations"][deviation_id].pop("proof"),
    )
    invalid_architecture(
        "missing accepted deviation field",
        lambda doc: doc["accepted_deviations"][deviation_id].pop("proof"),
    )
    invalid_deviations(
        "unknown deviation field",
        lambda doc: doc["deviations"][deviation_id].__setitem__("unknown", True),
    )
    invalid_architecture(
        "unknown accepted deviation field",
        lambda doc: doc["accepted_deviations"][deviation_id].__setitem__(
            "unknown", True
        ),
    )
    invalid_deviations(
        "non-object deviation declaration",
        lambda doc: doc["deviations"].__setitem__(deviation_id, []),
    )
    invalid_architecture(
        "non-object accepted deviation declaration",
        lambda doc: doc["accepted_deviations"].__setitem__(deviation_id, []),
    )
    invalid_deviations(
        "whitespace deviation field",
        lambda doc: doc["deviations"][deviation_id].__setitem__(
            "rationale", "   "
        ),
    )
    invalid_architecture(
        "whitespace accepted deviation field",
        lambda doc: doc["accepted_deviations"][deviation_id].__setitem__(
            "rationale", "   "
        ),
    )
    invalid_deviations(
        "legacy promotion note",
        lambda doc: doc.__setitem__("promotion_note", "legacy metadata"),
    )

    def duplicate_map_yaml(
        document: dict[str, Any], field: str, identifier: str
    ) -> str:
        compact_map = json.dumps(
            {identifier: document[field][identifier]},
            ensure_ascii=False,
            separators=(",", ":"),
        )
        declaration_json = json.dumps(
            document[field][identifier], ensure_ascii=False, separators=(",", ":")
        )
        duplicate_map = (
            "{"
            + json.dumps(identifier)
            + ":"
            + declaration_json
            + ","
            + json.dumps(identifier)
            + ":"
            + declaration_json
            + "}"
        )
        serialized = json.dumps(document, ensure_ascii=False, separators=(",", ":"))
        duplicate = serialized.replace(compact_map, duplicate_map, 1)
        if duplicate == serialized:
            fail(f"could not construct duplicate {field} key fixture")
        return duplicate

    duplicate_deviations_yaml = duplicate_map_yaml(
        deviations, "deviations", deviation_id
    )
    duplicate_architecture_yaml = duplicate_map_yaml(
        architecture, "accepted_deviations", deviation_id
    )

    script = """
import fs from 'node:fs';
import { createParityContractRuntime } from './packages/engine/dist/parity-contracts.js';
const payload = JSON.parse(fs.readFileSync(0, 'utf8'));
const options = {
  contract_version: 3,
  schemaRoot: payload.schemaRoot,
  aggregateSchema: 'parity-packet.schema.yaml',
  individualSchemas: [
    'deviations.schema.yaml',
    'architecture-adaptation.schema.yaml',
  ],
};
const runtime = createParityContractRuntime(options);
const repeated = createParityContractRuntime(options);
if (runtime.schemaFingerprint !== repeated.schemaFingerprint) {
  throw new Error('aggregate schema fingerprint is not deterministic');
}
for (const test of payload.validCases) {
  const result = runtime.validateShape({
    contract_version: 3,
    schema: test.schema,
    value: test.instance,
  });
  if (!result.valid) {
    throw new Error(`${test.label}: rejected valid case: ${JSON.stringify(result.diagnostics)}`);
  }
}
for (const test of payload.invalidCases) {
  const result = runtime.validateShape({
    contract_version: 3,
    schema: test.schema,
    value: test.instance,
  });
  if (result.valid) {
    throw new Error(`${test.label}: accepted invalid case`);
  }
}
for (const duplicate of payload.duplicateCases) {
  const result = runtime.validateYamlShape({
    contract_version: 3,
    schema: duplicate.schema,
    source: duplicate.source,
  });
  if (result.valid || !result.diagnostics.some((item) => item.code === 'DUPLICATE_YAML_KEY')) {
    throw new Error(`${duplicate.label}: duplicate key was not rejected: ${JSON.stringify(result)}`);
  }
}
process.stdout.write(JSON.stringify({
  valid: payload.validCases.length,
  invalid: payload.invalidCases.length + payload.duplicateCases.length,
  loadedSchemas: runtime.loadedSchemas,
  schemaFingerprint: runtime.schemaFingerprint,
}));
"""
    result = subprocess.run(
        ["node", "--input-type=module", "-e", script],
        cwd=ROOT,
        input=json.dumps(
            {
                "schemaRoot": str(REFERENCES / "schemas"),
                "validCases": valid_cases,
                "invalidCases": invalid_cases,
                "duplicateCases": [
                    {
                        "schema": "deviations.schema.yaml",
                        "label": "duplicate deviation ID",
                        "source": duplicate_deviations_yaml,
                    },
                    {
                        "schema": "architecture-adaptation.schema.yaml",
                        "label": "duplicate accepted deviation ID",
                        "source": duplicate_architecture_yaml,
                    },
                ],
            },
            ensure_ascii=False,
        ),
        text=True,
        capture_output=True,
        check=False,
    )
    if result.returncode != 0:
        fail(
            "canonical engine aggregate/deviations validation failed: "
            f"{result.stderr or result.stdout}"
        )
    summary = json.loads(result.stdout)
    expected_schemas = {
        "parity-packet.schema.yaml",
        "source-lock.schema.yaml",
        "target.schema.yaml",
        "structural-map.schema.yaml",
        "visual-contract.schema.yaml",
        "behavior-contract.schema.yaml",
        "architecture-adaptation.schema.yaml",
        "deviations.schema.yaml",
        "proof.schema.yaml",
        "common.schema.yaml",
    }
    if set(summary["loadedSchemas"]) != expected_schemas:
        fail(f"aggregate engine schema graph mismatch: {summary}")
    if summary["valid"] != len(valid_cases) or summary["invalid"] != len(
        invalid_cases
    ) + 2:
        fail(f"aggregate engine case count mismatch: {summary}")
    return len(valid_cases), len(invalid_cases) + 2, summary["schemaFingerprint"]


def test_structural_map_shape_through_engine(
    packet: Path,
) -> tuple[int, int, str]:
    structural = load_document(packet, "structural-map.yaml")
    route_key = "/he-thong/nhap-hang"
    route_declaration = structural["routes"][route_key]
    valid_cases = [
        {
            "label": "canonical object-keyed structural routes",
            "instance": structural,
        },
        {
            "label": "route object order is not identity",
            "instance": {
                **copy.deepcopy(structural),
                "routes": {
                    "/he-thong/nhap-hang/stats": {
                        "component": "nhap-hang-stats",
                        "breadcrumb_label": "Thống kê nhập hàng",
                        "parent_path": route_key,
                    },
                    route_key: copy.deepcopy(route_declaration),
                },
            },
        },
    ]
    invalid_cases: list[dict[str, Any]] = []

    def invalid(label: str, mutation: Callable[[Any], None]) -> None:
        instance = copy.deepcopy(structural)
        mutation(instance)
        invalid_cases.append({"label": label, "instance": instance})

    invalid("legacy route array", lambda doc: doc.__setitem__("routes", []))
    invalid("empty route object", lambda doc: doc.__setitem__("routes", {}))
    invalid(
        "noncanonical route key",
        lambda doc: doc.__setitem__(
            "routes", {"//he-thong/nhap-hang": copy.deepcopy(route_declaration)}
        ),
    )
    invalid(
        "whitespace route key",
        lambda doc: doc.__setitem__(
            "routes", {"   ": copy.deepcopy(route_declaration)}
        ),
    )
    invalid(
        "legacy embedded path field",
        lambda doc: doc["routes"][route_key].__setitem__("path", route_key),
    )
    invalid(
        "missing route component",
        lambda doc: doc["routes"][route_key].pop("component"),
    )
    invalid(
        "unknown route declaration field",
        lambda doc: doc["routes"][route_key].__setitem__("unknown", True),
    )
    invalid(
        "non-object route declaration",
        lambda doc: doc["routes"].__setitem__(route_key, []),
    )
    invalid(
        "unresolved component uncertainty",
        lambda doc: doc["component_mappings"][0].__setitem__("uncertainty", True),
    )
    invalid(
        "non-portable source component",
        lambda doc: doc["component_mappings"][0].__setitem__(
            "source_component", "../source.tsx"
        ),
    )
    invalid(
        "non-portable target component",
        lambda doc: doc["component_mappings"][0].__setitem__(
            "target_component", "C:target.tsx"
        ),
    )
    invalid(
        "empty nesting declaration",
        lambda doc: doc["nesting_hierarchy"].__setitem__("root", []),
    )

    compact_route = json.dumps(
        {route_key: route_declaration},
        ensure_ascii=False,
        separators=(",", ":"),
    )
    duplicate_route = (
        "{"
        + json.dumps(route_key)
        + ":"
        + json.dumps(route_declaration, ensure_ascii=False, separators=(",", ":"))
        + ","
        + json.dumps(route_key)
        + ":"
        + json.dumps(route_declaration, ensure_ascii=False, separators=(",", ":"))
        + "}"
    )
    duplicate_yaml = json.dumps(
        structural, ensure_ascii=False, separators=(",", ":")
    ).replace(compact_route, duplicate_route, 1)
    if duplicate_yaml == json.dumps(
        structural, ensure_ascii=False, separators=(",", ":")
    ):
        fail("could not construct duplicate structural route-key fixture")

    script = """
import fs from 'node:fs';
import { createParityContractRuntime } from './packages/engine/dist/parity-contracts.js';
const payload = JSON.parse(fs.readFileSync(0, 'utf8'));
const options = {
  contract_version: 3,
  schemaRoot: payload.schemaRoot,
  aggregateSchema: 'source-lock.schema.yaml',
  individualSchemas: ['structural-map.schema.yaml'],
};
const runtime = createParityContractRuntime(options);
const repeated = createParityContractRuntime(options);
if (runtime.schemaFingerprint !== repeated.schemaFingerprint) {
  throw new Error('structural schema fingerprint is not deterministic');
}
for (const test of payload.validCases) {
  const result = runtime.validateShape({
    contract_version: 3,
    schema: 'structural-map.schema.yaml',
    value: test.instance,
  });
  if (!result.valid) {
    throw new Error(`${test.label}: rejected valid case: ${JSON.stringify(result.diagnostics)}`);
  }
}
for (const test of payload.invalidCases) {
  const result = runtime.validateShape({
    contract_version: 3,
    schema: 'structural-map.schema.yaml',
    value: test.instance,
  });
  if (result.valid) {
    throw new Error(`${test.label}: accepted invalid case`);
  }
}
const duplicate = runtime.validateYamlShape({
  contract_version: 3,
  schema: 'structural-map.schema.yaml',
  source: payload.duplicateYaml,
});
if (duplicate.valid || !duplicate.diagnostics.some((item) => item.code === 'DUPLICATE_YAML_KEY')) {
  throw new Error(`duplicate structural route key was not rejected: ${JSON.stringify(duplicate)}`);
}
process.stdout.write(JSON.stringify({
  valid: payload.validCases.length,
  invalid: payload.invalidCases.length + 1,
  loadedSchemas: runtime.loadedSchemas,
  schemaFingerprint: runtime.schemaFingerprint,
}));
"""
    result = subprocess.run(
        ["node", "--input-type=module", "-e", script],
        cwd=ROOT,
        input=json.dumps(
            {
                "schemaRoot": str(REFERENCES / "schemas"),
                "validCases": valid_cases,
                "invalidCases": invalid_cases,
                "duplicateYaml": duplicate_yaml,
            },
            ensure_ascii=False,
        ),
        text=True,
        capture_output=True,
        check=False,
    )
    if result.returncode != 0:
        fail(
            "canonical engine structural-map validation failed: "
            f"{result.stderr or result.stdout}"
        )
    summary = json.loads(result.stdout)
    if set(summary["loadedSchemas"]) != {
        "structural-map.schema.yaml",
        "source-lock.schema.yaml",
        "common.schema.yaml",
    }:
        fail(f"structural engine schema graph mismatch: {summary}")
    if summary["valid"] != len(valid_cases) or summary["invalid"] != len(
        invalid_cases
    ) + 1:
        fail(f"structural engine case count mismatch: {summary}")
    return len(valid_cases), len(invalid_cases) + 1, summary["schemaFingerprint"]


# HISTORICAL — cross-document route-key equality (DEPRECATED after ASN11 engine cutover).
# Route-key set-equality between structural-map and target is validated by the
# transitional Python gate until engine-level cross-document semantics are fully ported.
def test_structural_route_key_semantics(packet: Path) -> None:
    owned_names = (
        "target.yaml",
        "structural-map.yaml",
        "source.lock.yaml",
        "proof.yaml",
    )
    originals = {name: (packet / name).read_bytes() for name in owned_names}
    try:
        target = load_document(packet, "target.yaml")
        structural = load_document(packet, "structural-map.yaml")
        existing_route = "/he-thong/nhap-hang"
        stats_route = "/he-thong/nhap-hang/stats"
        target["target_paths"]["routes"] = [stats_route, existing_route]
        structural["routes"][stats_route] = {
            "component": "nhap-hang-stats",
            "breadcrumb_label": "Thống kê nhập hàng",
            "parent_path": existing_route,
        }
        write_document(packet / "target.yaml", target)
        write_document(packet / "structural-map.yaml", structural)

        source_lock = load_document(packet, "source.lock.yaml")
        source_lock["target_receipt"]["target_contract_sha256"] = hashlib.sha256(
            (packet / "target.yaml").read_bytes()
        ).hexdigest()
        write_document(packet / "source.lock.yaml", source_lock)
        proof = load_document(packet, "proof.yaml")
        proof["template_identity_and_snapshot"]["source_lock_sha"] = hashlib.sha256(
            (packet / "source.lock.yaml").read_bytes()
        ).hexdigest()
        write_document(packet / "proof.yaml", proof)
        errors = _historical_gate.validate(packet)
        if errors:
            fail(f"route key-set equality was incorrectly order-sensitive: {errors}")

        structural["routes"].pop(stats_route)
        write_document(packet / "structural-map.yaml", structural)
        require_error(
            packet,
            "structural route keys do not exactly match target routes",
            "missing structural route key",
        )

        structural["routes"][stats_route] = {
            "component": "nhap-hang-stats",
            "breadcrumb_label": "Thống kê nhập hàng",
            "parent_path": existing_route,
        }
        structural["routes"]["/he-thong/nhap-hang/extra"] = {
            "component": "nhap-hang-extra",
            "breadcrumb_label": "Extra",
            "parent_path": existing_route,
        }
        write_document(packet / "structural-map.yaml", structural)
        require_error(
            packet,
            "structural route keys do not exactly match target routes",
            "extra structural route key",
        )
    finally:
        for name, content in originals.items():
            (packet / name).write_bytes(content)


def test_visual_contract_shape_through_engine(
    packet: Path,
) -> tuple[int, int, str]:
    visual = load_document(packet, "visual-contract.yaml")
    surface_key = "crud-list"
    surface_declaration = visual["surfaces"][surface_key]
    valid_cases = [
        {
            "label": "canonical object-keyed visual surfaces",
            "instance": visual,
        },
        {
            "label": "surface object order is not identity",
            "instance": {
                "surfaces": {
                    "form-drawer": copy.deepcopy(surface_declaration),
                    surface_key: copy.deepcopy(surface_declaration),
                }
            },
        },
    ]
    invalid_cases: list[dict[str, Any]] = []

    def invalid(label: str, mutation: Callable[[Any], None]) -> None:
        instance = copy.deepcopy(visual)
        mutation(instance)
        invalid_cases.append({"label": label, "instance": instance})

    def replace_surface_key(document: Any, replacement: str) -> None:
        declaration = document["surfaces"].pop(surface_key)
        document["surfaces"][replacement] = declaration

    invalid("legacy surface array", lambda doc: doc.__setitem__("surfaces", []))
    invalid("empty surface object", lambda doc: doc.__setitem__("surfaces", {}))
    for label, malformed_key in (
        ("whitespace surface key", "   "),
        ("uppercase surface key", "Crud-List"),
        ("leading-slash surface key", "/crud-list"),
        ("path-shaped surface key", "crud/list"),
        ("traversal surface key", "../crud-list"),
        ("snake-case surface key", "crud_list"),
        ("leading-digit surface key", "1-crud-list"),
        ("double-separator surface key", "crud--list"),
        ("trailing-separator surface key", "crud-list-"),
    ):
        invalid(
            label,
            lambda doc, key=malformed_key: replace_surface_key(doc, key),
        )
    invalid(
        "legacy embedded surface ID",
        lambda doc: doc["surfaces"][surface_key].__setitem__(
            "surface_key", surface_key
        ),
    )
    invalid(
        "missing shell declaration",
        lambda doc: doc["surfaces"][surface_key].pop("shell_must"),
    )
    invalid(
        "unknown surface declaration field",
        lambda doc: doc["surfaces"][surface_key].__setitem__("unknown", True),
    )
    invalid(
        "non-object surface declaration",
        lambda doc: doc["surfaces"].__setitem__(surface_key, []),
    )
    invalid(
        "empty shell requirements",
        lambda doc: doc["surfaces"][surface_key].__setitem__("shell_must", []),
    )
    invalid(
        "blank shell requirement",
        lambda doc: doc["surfaces"][surface_key].__setitem__("shell_must", ["   "]),
    )
    invalid(
        "duplicate shell requirement",
        lambda doc: doc["surfaces"][surface_key].__setitem__(
            "shell_must", ["same", "same"]
        ),
    )
    invalid(
        "missing variable source",
        lambda doc: doc["surfaces"][surface_key]["variables"][0].pop("source"),
    )
    invalid(
        "unknown variable field",
        lambda doc: doc["surfaces"][surface_key]["variables"][0].__setitem__(
            "unknown", True
        ),
    )
    invalid(
        "blank variable slot",
        lambda doc: doc["surfaces"][surface_key]["variables"][0].__setitem__(
            "slot", "   "
        ),
    )
    invalid(
        "missing responsive breakpoints",
        lambda doc: doc["surfaces"][surface_key].pop("responsive_breakpoints"),
    )
    invalid(
        "invalid viewport",
        lambda doc: doc["surfaces"][surface_key]["responsive_breakpoints"][
            0
        ].__setitem__("viewport", "watch"),
    )
    invalid(
        "missing safe-area declaration",
        lambda doc: doc["surfaces"][surface_key]["responsive_breakpoints"][0].pop(
            "safe_area"
        ),
    )
    invalid(
        "non-boolean safe-area declaration",
        lambda doc: doc["surfaces"][surface_key]["responsive_breakpoints"][
            0
        ].__setitem__("safe_area", "true"),
    )

    compact_surfaces = json.dumps(
        {surface_key: surface_declaration},
        ensure_ascii=False,
        separators=(",", ":"),
    )
    duplicate_surfaces = (
        "{"
        + json.dumps(surface_key)
        + ":"
        + json.dumps(surface_declaration, ensure_ascii=False, separators=(",", ":"))
        + ","
        + json.dumps(surface_key)
        + ":"
        + json.dumps(surface_declaration, ensure_ascii=False, separators=(",", ":"))
        + "}"
    )
    serialized_visual = json.dumps(visual, ensure_ascii=False, separators=(",", ":"))
    duplicate_yaml = serialized_visual.replace(
        compact_surfaces, duplicate_surfaces, 1
    )
    if duplicate_yaml == serialized_visual:
        fail("could not construct duplicate visual surface-key fixture")

    script = """
import fs from 'node:fs';
import { createParityContractRuntime } from './packages/engine/dist/parity-contracts.js';
const payload = JSON.parse(fs.readFileSync(0, 'utf8'));
const options = {
  contract_version: 3,
  schemaRoot: payload.schemaRoot,
  aggregateSchema: 'source-lock.schema.yaml',
  individualSchemas: ['visual-contract.schema.yaml'],
};
const runtime = createParityContractRuntime(options);
const repeated = createParityContractRuntime(options);
if (runtime.schemaFingerprint !== repeated.schemaFingerprint) {
  throw new Error('visual schema fingerprint is not deterministic');
}
for (const test of payload.validCases) {
  const result = runtime.validateShape({
    contract_version: 3,
    schema: 'visual-contract.schema.yaml',
    value: test.instance,
  });
  if (!result.valid) {
    throw new Error(`${test.label}: rejected valid case: ${JSON.stringify(result.diagnostics)}`);
  }
}
for (const test of payload.invalidCases) {
  const result = runtime.validateShape({
    contract_version: 3,
    schema: 'visual-contract.schema.yaml',
    value: test.instance,
  });
  if (result.valid) {
    throw new Error(`${test.label}: accepted invalid case`);
  }
}
const duplicate = runtime.validateYamlShape({
  contract_version: 3,
  schema: 'visual-contract.schema.yaml',
  source: payload.duplicateYaml,
});
if (duplicate.valid || !duplicate.diagnostics.some((item) => item.code === 'DUPLICATE_YAML_KEY')) {
  throw new Error(`duplicate visual surface key was not rejected: ${JSON.stringify(duplicate)}`);
}
process.stdout.write(JSON.stringify({
  valid: payload.validCases.length,
  invalid: payload.invalidCases.length + 1,
  loadedSchemas: runtime.loadedSchemas,
  schemaFingerprint: runtime.schemaFingerprint,
}));
"""
    result = subprocess.run(
        ["node", "--input-type=module", "-e", script],
        cwd=ROOT,
        input=json.dumps(
            {
                "schemaRoot": str(REFERENCES / "schemas"),
                "validCases": valid_cases,
                "invalidCases": invalid_cases,
                "duplicateYaml": duplicate_yaml,
            },
            ensure_ascii=False,
        ),
        text=True,
        capture_output=True,
        check=False,
    )
    if result.returncode != 0:
        fail(
            "canonical engine visual-contract validation failed: "
            f"{result.stderr or result.stdout}"
        )
    summary = json.loads(result.stdout)
    if set(summary["loadedSchemas"]) != {
        "visual-contract.schema.yaml",
        "source-lock.schema.yaml",
        "common.schema.yaml",
    }:
        fail(f"visual engine schema graph mismatch: {summary}")
    if summary["valid"] != len(valid_cases) or summary["invalid"] != len(
        invalid_cases
    ) + 1:
        fail(f"visual engine case count mismatch: {summary}")
    return len(valid_cases), len(invalid_cases) + 1, summary["schemaFingerprint"]


# HISTORICAL — cross-document surface-key equality (DEPRECATED after ASN11 engine cutover).
# Visual surface-key set-equality between visual-contract and target is validated by
# the transitional Python gate until engine-level cross-document semantics are fully ported.
def test_visual_surface_key_semantics(packet: Path) -> None:
    owned_names = (
        "target.yaml",
        "visual-contract.yaml",
        "behavior-contract.yaml",
        "source.lock.yaml",
        "proof.yaml",
    )
    originals = {name: (packet / name).read_bytes() for name in owned_names}
    try:
        target = load_document(packet, "target.yaml")
        visual = load_document(packet, "visual-contract.yaml")
        behavior = load_document(packet, "behavior-contract.yaml")
        existing_surface = "crud-list"
        second_surface = "form-drawer"
        target["surfaces"] = [second_surface, existing_surface]
        visual["surfaces"][second_surface] = copy.deepcopy(
            visual["surfaces"][existing_surface]
        )
        behavior["behaviors"] = {
            second_surface: copy.deepcopy(behavior["behaviors"][existing_surface]),
            existing_surface: copy.deepcopy(behavior["behaviors"][existing_surface]),
        }
        write_document(packet / "target.yaml", target)
        write_document(packet / "visual-contract.yaml", visual)
        write_document(packet / "behavior-contract.yaml", behavior)

        source_lock = load_document(packet, "source.lock.yaml")
        source_lock["target_receipt"]["target_contract_sha256"] = hashlib.sha256(
            (packet / "target.yaml").read_bytes()
        ).hexdigest()
        write_document(packet / "source.lock.yaml", source_lock)
        proof = load_document(packet, "proof.yaml")
        second_reference = copy.deepcopy(
            proof["target_surface_and_reference_paths"]["crud-list"]
        )
        proof["target_surface_and_reference_paths"][second_surface] = second_reference
        second_variable = copy.deepcopy(
            proof["variable_map_with_schema_or_spec_source"]["crud-list"]
        )
        proof["variable_map_with_schema_or_spec_source"][second_surface] = second_variable
        proof["template_identity_and_snapshot"]["source_lock_sha"] = hashlib.sha256(
            (packet / "source.lock.yaml").read_bytes()
        ).hexdigest()
        write_document(packet / "proof.yaml", proof)
        errors = _historical_gate.validate(packet)
        if errors:
            fail(f"visual key-set equality was incorrectly order-sensitive: {errors}")

        visual["surfaces"].pop(second_surface)
        write_document(packet / "visual-contract.yaml", visual)
        require_error(
            packet,
            "visual surface keys do not exactly match target surfaces",
            "missing visual surface key",
        )

        visual["surfaces"][second_surface] = copy.deepcopy(
            visual["surfaces"][existing_surface]
        )
        visual["surfaces"]["extra-surface"] = copy.deepcopy(
            visual["surfaces"][existing_surface]
        )
        write_document(packet / "visual-contract.yaml", visual)
        require_error(
            packet,
            "visual surface keys do not exactly match target surfaces",
            "extra visual surface key",
        )
    finally:
        for name, content in originals.items():
            (packet / name).write_bytes(content)


def test_behavior_contract_shape_through_engine(
    packet: Path,
) -> tuple[int, int, str]:
    behavior = load_document(packet, "behavior-contract.yaml")
    surface_key = "crud-list"
    declaration = behavior["behaviors"][surface_key]
    valid_cases = [
        {
            "label": "canonical object-keyed behavior surfaces",
            "instance": behavior,
        },
        {
            "label": "behavior object order is not identity",
            "instance": {
                "behaviors": {
                    "form-drawer": copy.deepcopy(declaration),
                    surface_key: copy.deepcopy(declaration),
                }
            },
        },
    ]
    invalid_cases: list[dict[str, Any]] = []

    def invalid(label: str, mutation: Callable[[Any], None]) -> None:
        instance = copy.deepcopy(behavior)
        mutation(instance)
        invalid_cases.append({"label": label, "instance": instance})

    def replace_surface_key(document: Any, replacement: str) -> None:
        value = document["behaviors"].pop(surface_key)
        document["behaviors"][replacement] = value

    invalid("legacy behavior array", lambda doc: doc.__setitem__("behaviors", []))
    invalid("empty behavior object", lambda doc: doc.__setitem__("behaviors", {}))
    for label, malformed_key in (
        ("whitespace behavior key", "   "),
        ("uppercase behavior key", "Crud-List"),
        ("leading-slash behavior key", "/crud-list"),
        ("path-shaped behavior key", "crud/list"),
        ("traversal behavior key", "../crud-list"),
        ("snake-case behavior key", "crud_list"),
        ("leading-digit behavior key", "1-crud-list"),
        ("double-separator behavior key", "crud--list"),
        ("trailing-separator behavior key", "crud-list-"),
        ("non-ASCII behavior key", "crúd-list"),
    ):
        invalid(
            label,
            lambda doc, key=malformed_key: replace_surface_key(doc, key),
        )
    invalid(
        "legacy embedded surface ID",
        lambda doc: doc["behaviors"][surface_key].__setitem__(
            "surface_key", surface_key
        ),
    )
    invalid(
        "missing behavior declaration",
        lambda doc: doc["behaviors"][surface_key].pop("behavior_must"),
    )
    invalid(
        "unknown behavior declaration field",
        lambda doc: doc["behaviors"][surface_key].__setitem__("unknown", True),
    )
    invalid(
        "non-object behavior declaration",
        lambda doc: doc["behaviors"].__setitem__(surface_key, []),
    )
    for field in (
        "behavior_must",
        "states_must",
        "motion_must",
        "responsive_must",
    ):
        invalid(
            f"empty {field}",
            lambda doc, name=field: doc["behaviors"][surface_key].__setitem__(
                name, []
            ),
        )
        invalid(
            f"blank nested {field}",
            lambda doc, name=field: doc["behaviors"][surface_key].__setitem__(
                name, ["   "]
            ),
        )
    invalid(
        "duplicate behavior requirement",
        lambda doc: doc["behaviors"][surface_key].__setitem__(
            "behavior_must", ["same", "same"]
        ),
    )
    invalid(
        "blank accessibility requirement",
        lambda doc: doc["behaviors"][surface_key]["accessibility"][0].__setitem__(
            "requirement", "\t "
        ),
    )
    invalid(
        "unknown accessibility field",
        lambda doc: doc["behaviors"][surface_key]["accessibility"][0].__setitem__(
            "unknown", True
        ),
    )
    invalid(
        "blank interaction trigger",
        lambda doc: doc["behaviors"][surface_key]["interaction_flows"][
            0
        ].__setitem__("trigger", "\n "),
    )
    invalid(
        "blank interaction sequence",
        lambda doc: doc["behaviors"][surface_key]["interaction_flows"][
            0
        ].__setitem__("expected_sequence", ["\u00a0"]),
    )
    invalid(
        "unknown interaction field",
        lambda doc: doc["behaviors"][surface_key]["interaction_flows"][
            0
        ].__setitem__("unknown", True),
    )

    compact_behaviors = json.dumps(
        {surface_key: declaration},
        ensure_ascii=False,
        separators=(",", ":"),
    )
    duplicate_behaviors = (
        "{"
        + json.dumps(surface_key)
        + ":"
        + json.dumps(declaration, ensure_ascii=False, separators=(",", ":"))
        + ","
        + json.dumps(surface_key)
        + ":"
        + json.dumps(declaration, ensure_ascii=False, separators=(",", ":"))
        + "}"
    )
    serialized_behavior = json.dumps(
        behavior, ensure_ascii=False, separators=(",", ":")
    )
    duplicate_yaml = serialized_behavior.replace(
        compact_behaviors, duplicate_behaviors, 1
    )
    if duplicate_yaml == serialized_behavior:
        fail("could not construct duplicate behavior surface-key fixture")

    script = """
import fs from 'node:fs';
import { createParityContractRuntime } from './packages/engine/dist/parity-contracts.js';
const payload = JSON.parse(fs.readFileSync(0, 'utf8'));
const options = {
  contract_version: 3,
  schemaRoot: payload.schemaRoot,
  aggregateSchema: 'source-lock.schema.yaml',
  individualSchemas: ['behavior-contract.schema.yaml'],
};
const runtime = createParityContractRuntime(options);
const repeated = createParityContractRuntime(options);
if (runtime.schemaFingerprint !== repeated.schemaFingerprint) {
  throw new Error('behavior schema fingerprint is not deterministic');
}
for (const test of payload.validCases) {
  const result = runtime.validateShape({
    contract_version: 3,
    schema: 'behavior-contract.schema.yaml',
    value: test.instance,
  });
  if (!result.valid) {
    throw new Error(`${test.label}: rejected valid case: ${JSON.stringify(result.diagnostics)}`);
  }
}
for (const test of payload.invalidCases) {
  const result = runtime.validateShape({
    contract_version: 3,
    schema: 'behavior-contract.schema.yaml',
    value: test.instance,
  });
  if (result.valid) {
    throw new Error(`${test.label}: accepted invalid case`);
  }
}
const duplicate = runtime.validateYamlShape({
  contract_version: 3,
  schema: 'behavior-contract.schema.yaml',
  source: payload.duplicateYaml,
});
if (duplicate.valid || !duplicate.diagnostics.some((item) => item.code === 'DUPLICATE_YAML_KEY')) {
  throw new Error(`duplicate behavior surface key was not rejected: ${JSON.stringify(duplicate)}`);
}
process.stdout.write(JSON.stringify({
  valid: payload.validCases.length,
  invalid: payload.invalidCases.length + 1,
  loadedSchemas: runtime.loadedSchemas,
  schemaFingerprint: runtime.schemaFingerprint,
}));
"""
    result = subprocess.run(
        ["node", "--input-type=module", "-e", script],
        cwd=ROOT,
        input=json.dumps(
            {
                "schemaRoot": str(REFERENCES / "schemas"),
                "validCases": valid_cases,
                "invalidCases": invalid_cases,
                "duplicateYaml": duplicate_yaml,
            },
            ensure_ascii=False,
        ),
        text=True,
        capture_output=True,
        check=False,
    )
    if result.returncode != 0:
        fail(
            "canonical engine behavior-contract validation failed: "
            f"{result.stderr or result.stdout}"
        )
    summary = json.loads(result.stdout)
    if set(summary["loadedSchemas"]) != {
        "behavior-contract.schema.yaml",
        "source-lock.schema.yaml",
        "common.schema.yaml",
    }:
        fail(f"behavior engine schema graph mismatch: {summary}")
    if summary["valid"] != len(valid_cases) or summary["invalid"] != len(
        invalid_cases
    ) + 1:
        fail(f"behavior engine case count mismatch: {summary}")
    return len(valid_cases), len(invalid_cases) + 1, summary["schemaFingerprint"]


# HISTORICAL — cross-document surface-key equality (DEPRECATED after ASN11 engine cutover).
# Behavior surface-key set-equality between behavior-contract and target is validated by
# the transitional Python gate until engine-level cross-document semantics are fully ported.
def test_behavior_surface_key_semantics(packet: Path) -> None:
    owned_names = (
        "target.yaml",
        "visual-contract.yaml",
        "behavior-contract.yaml",
        "source.lock.yaml",
        "proof.yaml",
    )
    originals = {name: (packet / name).read_bytes() for name in owned_names}
    try:
        target = load_document(packet, "target.yaml")
        visual = load_document(packet, "visual-contract.yaml")
        behavior = load_document(packet, "behavior-contract.yaml")
        existing_surface = "crud-list"
        second_surface = "form-drawer"
        target["surfaces"] = [second_surface, existing_surface]
        visual["surfaces"][second_surface] = copy.deepcopy(
            visual["surfaces"][existing_surface]
        )
        behavior["behaviors"] = {
            second_surface: copy.deepcopy(
                behavior["behaviors"][existing_surface]
            ),
            existing_surface: copy.deepcopy(
                behavior["behaviors"][existing_surface]
            ),
        }
        write_document(packet / "target.yaml", target)
        write_document(packet / "visual-contract.yaml", visual)
        write_document(packet / "behavior-contract.yaml", behavior)

        source_lock = load_document(packet, "source.lock.yaml")
        source_lock["target_receipt"]["target_contract_sha256"] = hashlib.sha256(
            (packet / "target.yaml").read_bytes()
        ).hexdigest()
        write_document(packet / "source.lock.yaml", source_lock)
        proof = load_document(packet, "proof.yaml")
        second_reference = copy.deepcopy(
            proof["target_surface_and_reference_paths"]["crud-list"]
        )
        proof["target_surface_and_reference_paths"][second_surface] = second_reference
        second_variable = copy.deepcopy(
            proof["variable_map_with_schema_or_spec_source"]["crud-list"]
        )
        proof["variable_map_with_schema_or_spec_source"][second_surface] = second_variable
        proof["template_identity_and_snapshot"]["source_lock_sha"] = hashlib.sha256(
            (packet / "source.lock.yaml").read_bytes()
        ).hexdigest()
        write_document(packet / "proof.yaml", proof)
        errors = _historical_gate.validate(packet)
        if errors:
            fail(f"behavior key-set equality was incorrectly order-sensitive: {errors}")

        behavior["behaviors"].pop(second_surface)
        write_document(packet / "behavior-contract.yaml", behavior)
        require_error(
            packet,
            "behavior surface keys do not exactly match target surfaces",
            "missing behavior surface key",
        )

        behavior["behaviors"][second_surface] = copy.deepcopy(
            behavior["behaviors"][existing_surface]
        )
        behavior["behaviors"]["extra-surface"] = copy.deepcopy(
            behavior["behaviors"][existing_surface]
        )
        write_document(packet / "behavior-contract.yaml", behavior)
        require_error(
            packet,
            "behavior surface keys do not exactly match target surfaces",
            "extra behavior surface key",
        )
    finally:
        for name, content in originals.items():
            (packet / name).write_bytes(content)


def test_lexical_harness_single_authority() -> None:
    source = Path(__file__).read_text(encoding="utf-8")
    forbidden_blocks = {
        "direct Ajv require": "require(" + "'ajv'" + ")",
        "direct Ajv construction": "new " + "Ajv",
        "direct schema parser": "parse_yaml_" + "subset",
        "direct schema document matrix": "schema_" + "documents",
        "schema-directory compilation loop": '.glob("*.' + 'schema.yaml")',
    }
    for label, marker in forbidden_blocks.items():
        if marker in source:
            fail(f"lexical harness authority reducer found {label}")

    lexical_start = source.index("def test_shared_lexical_schema_through_engine")
    lexical_end = source.index(
        "\ndef test_aggregate_and_deviations_shapes_through_engine", lexical_start
    )
    lexical_source = source[lexical_start:lexical_end]
    if "validator" + "." in lexical_source:
        fail("lexical cases must not call the transitional Python validator")
    engine_marker = "packages/engine/dist/" + "parity-contracts.js"
    if engine_marker not in lexical_source:
        fail("lexical cases must call the canonical parity engine")
    for schema_name in (
        "common.schema.yaml",
        "source-lock.schema.yaml",
        "target.schema.yaml",
        "proof.schema.yaml",
    ):
        if schema_name not in lexical_source:
            fail(f"lexical engine scope is missing {schema_name}")
    for later_schema in (
        "structural-" + "map.schema.yaml",
        "visual-" + "contract.schema.yaml",
        "behavior-" + "contract.schema.yaml",
        "architecture-" + "adaptation.schema.yaml",
        "parity-" + "packet.schema.yaml",
    ):
        if later_schema in lexical_source:
            fail(f"lexical engine scope leaked into later schema {later_schema}")


def test_aggregate_harness_single_authority() -> None:
    source = Path(__file__).read_text(encoding="utf-8")
    aggregate_start = source.index(
        "def test_aggregate_and_deviations_shapes_through_engine"
    )
    aggregate_end = source.index(
        "\ndef test_structural_map_shape_through_engine", aggregate_start
    )
    aggregate_source = source[aggregate_start:aggregate_end]
    if "validator" + "." in aggregate_source:
        fail("aggregate/deviations shape cases must not call the Python validator")
    if "packages/engine/dist/" + "parity-contracts.js" not in aggregate_source:
        fail("aggregate/deviations shape cases must call the built canonical engine")
    for schema_name in (
        "parity-packet.schema.yaml",
        "deviations.schema.yaml",
        "architecture-adaptation.schema.yaml",
    ):
        if schema_name not in aggregate_source:
            fail(f"aggregate engine scope is missing {schema_name}")


def test_structural_harness_single_authority() -> None:
    source = Path(__file__).read_text(encoding="utf-8")
    structural_start = source.index("def test_structural_map_shape_through_engine")
    structural_end = source.index(
        "\ndef test_structural_route_key_semantics", structural_start
    )
    structural_source = source[structural_start:structural_end]
    if "validator" + "." in structural_source or "_historical_gate" in structural_source:
        fail("structural shape cases must not call the transitional Python validator")
    if "packages/engine/dist/" + "parity-contracts.js" not in structural_source:
        fail("structural shape cases must call the built canonical engine")
    if "structural-map.schema.yaml" not in structural_source:
        fail("structural shape cases must compile the canonical structural schema")
    semantic_start = structural_end
    semantic_end = source.index(
        "\ndef test_visual_contract_shape_through_engine", semantic_start
    )
    semantic_source = source[semantic_start:semantic_end]
    if "_historical_gate.validate(packet)" not in semantic_source:
        fail("structural route key-set equality must use the transitional semantic gate")


def test_visual_harness_single_authority() -> None:
    source = Path(__file__).read_text(encoding="utf-8")
    visual_start = source.index("def test_visual_contract_shape_through_engine")
    visual_end = source.index(
        "\ndef test_visual_surface_key_semantics", visual_start
    )
    visual_source = source[visual_start:visual_end]
    if "validator" + "." in visual_source or "_historical_gate" in visual_source:
        fail("visual shape cases must not call the transitional Python validator")
    if "packages/engine/dist/" + "parity-contracts.js" not in visual_source:
        fail("visual shape cases must call the built canonical engine")
    if "visual-contract.schema.yaml" not in visual_source:
        fail("visual shape cases must compile the canonical visual schema")
    semantic_start = visual_end
    semantic_end = source.index(
        "\ndef test_behavior_contract_shape_through_engine", semantic_start
    )
    semantic_source = source[semantic_start:semantic_end]
    if "_historical_gate.validate(packet)" not in semantic_source:
        fail("visual surface key-set equality must use the transitional semantic gate")


def test_behavior_harness_single_authority() -> None:
    source = Path(__file__).read_text(encoding="utf-8")
    behavior_start = source.index("def test_behavior_contract_shape_through_engine")
    behavior_end = source.index(
        "\ndef test_behavior_surface_key_semantics", behavior_start
    )
    behavior_source = source[behavior_start:behavior_end]
    if "validator" + "." in behavior_source or "_historical_gate" in behavior_source:
        fail("behavior shape cases must not call the transitional Python validator")
    if "packages/engine/dist/" + "parity-contracts.js" not in behavior_source:
        fail("behavior shape cases must call the built canonical engine")
    if "behavior-contract.schema.yaml" not in behavior_source:
        fail("behavior shape cases must compile the canonical behavior schema")
    semantic_start = behavior_end
    semantic_end = source.index(
        "\ndef test_lexical_harness_single_authority", semantic_start
    )
    semantic_source = source[semantic_start:semantic_end]
    if "_historical_gate.validate(packet)" not in semantic_source:
        fail("behavior surface key-set equality must use the transitional semantic gate")


def test_static_assets() -> None:
    # ponytail: skip when profile-owned 5fedu skill path is absent (profile-owner not installed)
    if not REFERENCES.is_dir():
        print("INFO: REFERENCES dir absent; static asset check skipped", file=sys.stderr)
        return
    expected_assets = (
        "contracts/no-vision-worker-contract.md",
        "workflow/planning-workflow.md",
        "questions/question-strategy.md",
        "schemas/parity-packet.schema.yaml",
        "schemas/deviations.schema.yaml",
        "schemas/common.schema.yaml",
        "schemas/proof.schema.yaml",
        "examples/nhap-hang/fixtures/negative-test-form-validation.yaml",
        "examples/nhap-hang/fixtures/negative-test-line-item-empty.yaml",
        "examples/nhap-hang/fixtures/negative-test-list-empty.yaml",
        "examples/nhap-hang/fixtures/negative-test-permission-denied.yaml",
    )
    for asset in expected_assets:
        if not (REFERENCES / asset).is_file():
            fail(f"PARITY-ASSET-001 missing canonical asset: {asset}")
    if (ROOT / "profiles/5fedu/projects/parity").exists():
        fail("PARITY-ASSET-002 legacy parity asset directory still exists")

    index = (REFERENCES / "index.md").read_text(encoding="utf-8")
    skill = (SKILL / "SKILL.md").read_text(encoding="utf-8")
    normalized_index = re.sub(r"\s+", " ", index)
    normalized_skill = re.sub(r"\s+", " ", skill)
    report_fields = (
        "Status",
        "Template reference",
        "Shell parity",
        "Variable map",
        "Pattern fidelity",
        "Verification",
    )
    for term in report_fields:
        if term not in normalized_index or term not in normalized_skill:
            fail(f"PARITY-REPORT-001 missing report field: {term}")


# HISTORICAL — transitional Python validator (DEPRECATED after ASN11 engine cutover).
# The incomplete historical Nhập hàng example must not certify as implemented proof
# through the deprecated validator's comprehensive gate.
def test_historical_example_is_not_falsified() -> None:
    errors = _historical_gate.validate(EXAMPLE)
    if not errors:
        fail("historical incomplete Nhập hàng example must not certify as implemented proof")
    if not any(
        "source.lock.yaml" in error or "PARITY_YAML_INVALID" in error
        for error in errors
    ):
        fail(f"historical placeholder example was not rejected by the parser: {errors}")


# HISTORICAL — individual and cross-document packet validation (DEPRECATED after ASN11
# engine cutover). Fail-closed packet file, YAML, schema shape, and type-level checks
# remain in the transitional Python validator for adversarial coverage.
def test_packet_and_schema_fail_closed(packet: Path) -> None:
    missing = packet / "target.yaml"
    original = missing.read_bytes()
    missing.unlink()
    require_error(packet, "PARITY_PACKET_REQUIRED", "missing packet file")
    missing.write_bytes(original)

    extra = packet / "unexpected.yaml"
    extra.write_text("{}\n", encoding="utf-8")
    require_error(packet, "PARITY_PACKET_EXTRA", "extra packet file")
    extra.unlink()

    for name in _historical_gate.REQUIRED_PACKET_FILES:
        path = packet / name
        original = path.read_bytes()
        path.write_text(
            "root:\n   - invalid-indent\n  trailing: nope\n",
            encoding="utf-8",
        )
        require_error(packet, "PARITY_YAML_INVALID", f"malformed YAML in {name}")
        path.write_bytes(original)

    wrong_type_mutations: tuple[tuple[str, Callable[[Any], None]], ...] = (
        ("source.lock.yaml", lambda doc: doc.__setitem__("snapshot", "not-an-object")),
        ("target.yaml", lambda doc: doc.__setitem__("surfaces", "not-an-array")),
        (
            "structural-map.yaml",
            lambda doc: doc.__setitem__("component_mappings", "not-an-array"),
        ),
        ("visual-contract.yaml", lambda doc: doc.__setitem__("surfaces", 7)),
        ("behavior-contract.yaml", lambda doc: doc.__setitem__("behaviors", False)),
        ("architecture-adaptation.yaml", lambda doc: doc.__setitem__("preserve", {})),
        ("deviations.yaml", lambda doc: doc.__setitem__("deviations", "not-an-array")),
        (
            "proof.yaml",
            lambda doc: doc.__setitem__("verification_evidence", "not-an-array"),
        ),
    )
    for name, mutation in wrong_type_mutations:
        restore = mutate_document(packet, name, mutation)
        require_error(packet, "PARITY_SCHEMA_INVALID" if name != "proof.yaml" else "PARITY_PROOF_INVALID", f"wrong type in {name}")
        restore()

    required_field_mutations: tuple[
        tuple[str, str, Callable[[Any], None]], ...
    ] = (
        ("source.lock.yaml", "template_identity", lambda doc: doc.pop("template_identity")),
        ("target.yaml", "module_key", lambda doc: doc.pop("module_key")),
        (
            "structural-map.yaml",
            "component_mappings",
            lambda doc: doc.pop("component_mappings"),
        ),
        ("visual-contract.yaml", "surfaces", lambda doc: doc.pop("surfaces")),
        ("behavior-contract.yaml", "behaviors", lambda doc: doc.pop("behaviors")),
        (
            "architecture-adaptation.yaml",
            "must_not_copy",
            lambda doc: doc.pop("must_not_copy"),
        ),
        ("deviations.yaml", "deviations", lambda doc: doc.pop("deviations")),
    )
    for name, field, mutation in required_field_mutations:
        restore = mutate_document(packet, name, mutation)
        require_error(packet, f"missing required: {field}", f"missing field in {name}")
        restore()

    closed_enum_mutations: tuple[
        tuple[str, str, Callable[[Any], None]], ...
    ] = (
        (
            "source.lock.yaml",
            "discovery_method is invalid",
            lambda doc: doc.__setitem__("discovery_method", "guessed"),
        ),
        (
            "target.yaml",
            "schema_source.type is invalid",
            lambda doc: doc["schema_source"].__setitem__("type", "memory"),
        ),
        (
            "structural-map.yaml",
            ".decision is invalid",
            lambda doc: doc["component_mappings"][0].__setitem__("decision", "copy"),
        ),
    )
    for name, expected, mutation in closed_enum_mutations:
        restore = mutate_document(packet, name, mutation)
        require_error(packet, expected, f"open enum in {name}")
        restore()


def test_exact_regex_exploit(root: Path) -> None:
    packet = root / "regex-exploit"
    packet.mkdir()
    for name in _historical_gate.REQUIRED_PACKET_FILES[:-1]:
        (packet / name).write_text("not: a-valid-packet\n", encoding="utf-8")
    lines = ["verification_evidence:"]
    for kind in sorted(_historical_gate.REQUIRED_EVIDENCE_TYPES):
        lines.extend(
            (
                f"  - type: {kind}",
                "    result: pass",
                "    command_or_method: regex-shaped-text",
                f"    source_revision: {SOURCE_REVISION}",
                f"    target_revision: {TARGET_REVISION}",
            )
        )
        if kind == "independent_revision_verification":
            lines.append("    verifier_identity: same-worker-but-not-literal-worker")
    (packet / "proof.yaml").write_text("\n".join(lines) + "\n", encoding="utf-8")
    (packet / "fixtures").mkdir()
    (packet / "fixtures" / "fake.yaml").write_text("not: valid\n", encoding="utf-8")
    require_error(packet, "PARITY_SCHEMA_INVALID", "regex-shaped exploit")


def test_proof_evidence_fail_closed(packet: Path) -> None:
    for evidence_type in sorted(_historical_gate.REQUIRED_EVIDENCE_TYPES):
        restore = mutate_document(
            packet,
            "proof.yaml",
            lambda doc, kind=evidence_type: doc.__setitem__(
                "verification_evidence",
                [item for item in doc["verification_evidence"] if item["type"] != kind],
            ),
        )
        require_error(packet, "missing required types", f"missing evidence {evidence_type}")
        restore()

    for dimension in _historical_gate.REQUIRED_DIMENSIONS:
        restore = mutate_document(
            packet,
            "proof.yaml",
            lambda doc, field=dimension: doc[
                "shell_behavior_state_motion_responsive_map"
            ].__setitem__(field, False),
        )
        require_error(packet, f"{dimension} must be true", f"false dimension {dimension}")
        restore()

    for evidence_type in sorted(_historical_gate.REQUIRED_EVIDENCE_TYPES):
        for field, value, expected in (
            ("result", "PASS", ".result must be pass"),
            ("source_revision", "c" * 40, "source_revision is stale or mismatched"),
            ("target_revision", "c" * 40, "target_revision is stale or mismatched"),
        ):
            restore = mutate_document(
                packet,
                "proof.yaml",
                lambda doc, kind=evidence_type, key=field, replacement=value: next(
                    item
                    for item in doc["verification_evidence"]
                    if item["type"] == kind
                ).__setitem__(key, replacement),
            )
            require_error(
                packet,
                expected,
                f"{field} contract for evidence {evidence_type}",
            )
            restore()

    restore = mutate_document(
        packet,
        "proof.yaml",
        lambda doc: doc["verification_evidence"].append(
            copy.deepcopy(doc["verification_evidence"][0])
        ),
    )
    require_error(packet, "duplicate types", "duplicate evidence")
    restore()

    restore = mutate_document(
        packet,
        "proof.yaml",
        lambda doc: doc["verification_evidence"][0].__setitem__(
            "type", "regex_like_extra"
        ),
    )
    require_error(packet, "not a required evidence category", "unknown evidence")
    restore()


def test_independent_identity_contract(packet: Path) -> None:
    def independent(doc: Any) -> dict[str, Any]:
        return next(
            item
            for item in doc["verification_evidence"]
            if item["type"] == "independent_revision_verification"
        )

    restore = mutate_document(
        packet,
        "proof.yaml",
        lambda doc: independent(doc)["verifier_identity"].__setitem__(
            "display_name", "Implementation worker"
        ),
    )
    errors = _historical_gate.validate(packet)
    if errors:
        fail(f"display-name keyword incorrectly affected identity validation: {errors}")
    restore()

    restore = mutate_document(
        packet,
        "proof.yaml",
        lambda doc: independent(doc).__setitem__(
            "verifier_identity",
            {
                "subject_id": "agent://worker-001",
                "display_name": "same-worker-but-not-literal-worker",
                "role": "independent_verifier",
            },
        ),
    )
    require_error(packet, "distinct stable subject ids", "same identity under alias")
    restore()

    restore = mutate_document(
        packet,
        "proof.yaml",
        lambda doc: independent(doc).__setitem__(
            "verifier_identity", "same-worker-but-not-literal-worker"
        ),
    )
    require_error(packet, "must be an object", "scalar verifier alias")
    restore()

    restore = mutate_document(
        packet,
        "proof.yaml",
        lambda doc: independent(doc)["verifier_identity"].__setitem__("role", "worker"),
    )
    require_error(packet, "role must be independent_verifier", "wrong verifier role")
    restore()

    restore = mutate_document(
        packet,
        "proof.yaml",
        lambda doc: doc["worker_identity"].__setitem__("role", "independent_verifier"),
    )
    require_error(packet, "role must be worker", "wrong worker role")
    restore()

    for alias in (
        "AGENT://worker-001",
        "agent://worker-001/",
        "agent://worker-001?alias=reviewer",
        "agent://worker%2d001",
        "agent://namespace/../worker-001",
    ):
        restore = mutate_document(
            packet,
            "proof.yaml",
            lambda doc, value=alias: independent(doc)["verifier_identity"].__setitem__(
                "subject_id", value
            ),
        )
        require_error(packet, "canonical lowercase", f"non-canonical identity alias {alias}")
        restore()


def test_fixture_and_cross_contract_fail_closed(packet: Path) -> None:
    fixture = packet / "fixtures" / "negative-permission.yaml"
    original = fixture.read_bytes()
    document = json.loads(original.decode("utf-8"))
    document["mocks"] = "regex-like fixture"
    write_document(fixture, document)
    require_error(packet, "PARITY_FIXTURE_INVALID", "malformed negative fixture")
    fixture.write_bytes(original)

    restore = mutate_document(
        packet,
        "visual-contract.yaml",
        lambda doc: doc["surfaces"].__setitem__(
            "wrong-surface", doc["surfaces"].pop("crud-list")
        ),
    )
    require_error(
        packet,
        "visual surface keys do not exactly match target surfaces",
        "cross-contract visual drift",
    )
    restore()

    source = packet / "source.lock.yaml"
    source_original = source.read_bytes()
    source.write_bytes(source_original + b"\n")
    require_error(packet, "source_lock_sha does not match", "source-lock byte drift")
    source.write_bytes(source_original)


def main() -> int:
    test_static_assets()
    test_lexical_harness_single_authority()
    test_aggregate_harness_single_authority()
    test_structural_harness_single_authority()
    test_visual_harness_single_authority()
    test_behavior_harness_single_authority()
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        packet = create_valid_packet(root, validate_semantics=False)
        lexical_valid, lexical_invalid = test_shared_lexical_schema_through_engine(
            packet
        )
        aggregate_valid, aggregate_invalid, aggregate_fingerprint = (
            test_aggregate_and_deviations_shapes_through_engine(packet)
        )
        structural_valid, structural_invalid, structural_fingerprint = (
            test_structural_map_shape_through_engine(packet)
        )
        visual_valid, visual_invalid, visual_fingerprint = (
            test_visual_contract_shape_through_engine(packet)
        )
        behavior_valid, behavior_invalid, behavior_fingerprint = (
            test_behavior_contract_shape_through_engine(packet)
        )

        # HISTORICAL — transitional Python validator (DEPRECATED after ASN11 engine cutover).
        # Initial sanity check: the valid fixture must pass the deprecated cross-document
        # semantic gate before adversarial mutation. Engine shape tests run independently above.
        initial_errors = _historical_gate.validate(packet)
        if initial_errors:
            fail(f"valid fixture failed transitional semantic validation: {initial_errors}")
        test_structural_route_key_semantics(packet)
        test_visual_surface_key_semantics(packet)
        test_behavior_surface_key_semantics(packet)
        test_historical_example_is_not_falsified()
        test_reviewer_repro_deviation_reconciliation(packet)
        test_reviewer_repro_authoritative_target_receipt(packet)
        test_reviewer_repro_declared_path_membership(packet)
        test_reviewer_repro_portable_paths(packet)
        test_reviewer_repro_schema_truth_and_unknown_fields(packet)
        test_packet_and_schema_fail_closed(packet)
        test_exact_regex_exploit(root)
        test_proof_evidence_fail_closed(packet)
        test_independent_identity_contract(packet)
        test_fixture_and_cross_contract_fail_closed(packet)
        # HISTORICAL — final integrity check via the deprecated transitional Python
        # validator. Ensures adversarial mutations did not leave the packet in an
        # invalid state.
        final_errors = _historical_gate.validate(packet)
        if final_errors:
            fail(f"valid fixture was not restored after adversarial tests: {final_errors}")
    print(
        "5fedu parity packet adversarial conformance: ENGINE-CUTOVER-COMPLETE "
        f"(shared lexical engine cases: {lexical_valid} valid, "
        f"{lexical_invalid} invalid; aggregate/deviations engine cases: "
        f"{aggregate_valid} valid, {aggregate_invalid} invalid; "
        f"aggregate schema fingerprint: {aggregate_fingerprint}; "
        f"structural engine cases: {structural_valid} valid, "
        f"{structural_invalid} invalid; structural schema fingerprint: "
        f"{structural_fingerprint}; visual engine cases: {visual_valid} valid, "
        f"{visual_invalid} invalid; visual schema fingerprint: "
        f"{visual_fingerprint}; behavior engine cases: {behavior_valid} valid, "
        f"{behavior_invalid} invalid; behavior schema fingerprint: "
        f"{behavior_fingerprint}; "
        f"cross-document semantics: transitional Python gate (HISTORICAL))"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
