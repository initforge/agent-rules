#!/usr/bin/env python3
# DEPRECATED — transitional Python validator.
# Use the canonical engine: npx @initforge/agent-rules-engine validate <packet>
# This file is retained as a historical reference. Byte content preserved below.
# Final Git blob: 30f582e3cff146ab9de8439c29a40ffcce2a06b2
# Deprecated: ASN11 engine cutover, 2026-07-27.
"""Fail-closed, dependency-free validator for a 5fedu parity packet.

This intentionally implements the packet's documented YAML subset and its
schema/semantic contracts. It is not, and does not claim to be, a general YAML
or JSON Schema implementation.
"""
from __future__ import annotations

import argparse
import ast
import hashlib
import json
import re
import sys
import unicodedata
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Any, Callable

REQUIRED_PACKET_FILES = (
    "source.lock.yaml",
    "target.yaml",
    "structural-map.yaml",
    "visual-contract.yaml",
    "behavior-contract.yaml",
    "architecture-adaptation.yaml",
    "deviations.yaml",
    "proof.yaml",
)
REQUIRED_EVIDENCE_TYPES = frozenset(
    {
        "structural_parity",
        "visual_parity",
        "behavioral_parity",
        "architectural_parity",
        "browser_interaction",
        "accessibility",
        "console",
        "network",
        "browser_trace",
        "responsive_states",
        "keyboard",
        "touch",
        "reduced_motion",
        "permission_state_matrix",
        "independent_revision_verification",
    }
)
REQUIRED_DIMENSIONS = (
    "structural_map_complete",
    "visual_contract_complete",
    "behavior_contract_complete",
    "architecture_adaptation_complete",
)
IDENTITY_ROLES = {"worker", "independent_verifier"}
SHA40 = re.compile(r"^[0-9a-f]{40}$")
SHA64 = re.compile(r"^[0-9a-f]{64}$")
MODULE_KEY = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
SUBJECT_ID = re.compile(
    r"^[a-z][a-z0-9+.-]*://"
    r"[a-z0-9](?:[a-z0-9._~-]*[a-z0-9])?"
    r"(?:/[a-z0-9](?:[a-z0-9._~-]*[a-z0-9])?)*$"
)


class PacketContractError(ValueError):
    """A deterministic packet parsing or contract failure."""


@dataclass(frozen=True)
class _YamlLine:
    indent: int
    content: str
    number: int


def _without_comment(raw: str) -> str:
    quote: str | None = None
    escaped = False
    for index, char in enumerate(raw):
        if escaped:
            escaped = False
            continue
        if quote == '"' and char == "\\":
            escaped = True
            continue
        if char in {"'", '"'}:
            if quote is None:
                quote = char
            elif quote == char:
                quote = None
            continue
        if char == "#" and quote is None and (index == 0 or raw[index - 1].isspace()):
            return raw[:index]
    if quote is not None:
        raise PacketContractError("unterminated quoted scalar")
    return raw


def _split_mapping(content: str) -> tuple[str, str] | None:
    quote: str | None = None
    escaped = False
    depth = 0
    for index, char in enumerate(content):
        if escaped:
            escaped = False
            continue
        if quote == '"' and char == "\\":
            escaped = True
            continue
        if char in {"'", '"'}:
            if quote is None:
                quote = char
            elif quote == char:
                quote = None
            continue
        if quote is not None:
            continue
        if char in "[{":
            depth += 1
        elif char in "]}":
            depth -= 1
            if depth < 0:
                raise PacketContractError("unbalanced inline collection")
        elif char == ":" and depth == 0:
            key = content[:index].strip()
            if not re.fullmatch(r"[$A-Za-z0-9_./~-]+", key):
                raise PacketContractError(f"unsupported mapping key {key!r}")
            return key, content[index + 1 :].strip()
    if quote is not None or depth != 0:
        raise PacketContractError("unterminated scalar or inline collection")
    return None


def _scalar(value: str) -> Any:
    if value in {"", "~", "null", "Null", "NULL"}:
        return None
    if value in {"true", "True", "TRUE"}:
        return True
    if value in {"false", "False", "FALSE"}:
        return False
    if value[0] in {"'", '"'}:
        try:
            parsed = ast.literal_eval(value)
        except (SyntaxError, ValueError) as exc:
            raise PacketContractError(f"invalid quoted scalar: {exc}") from exc
        if not isinstance(parsed, str):
            raise PacketContractError("quoted scalar must decode to a string")
        return parsed
    if value[0] in "[{":
        try:
            return json.loads(value)
        except json.JSONDecodeError as exc:
            if value.startswith("[") and value.endswith("]"):
                items = [item.strip() for item in value[1:-1].split(",")]
                if all(re.fullmatch(r"[$A-Za-z0-9_.-]+", item) for item in items if item):
                    return [item for item in items if item]
            raise PacketContractError(
                "inline collections must use JSON syntax or a simple bare-string array; "
                f"invalid value at column {exc.colno}"
            ) from exc
    if value[0] in {"&", "*", "!"}:
        raise PacketContractError("YAML anchors, aliases, and tags are not supported")
    if re.fullmatch(r"-?(?:0|[1-9][0-9]*)", value):
        return int(value)
    if re.fullmatch(r"-?(?:0|[1-9][0-9]*)\.[0-9]+", value):
        return float(value)
    return value


def _parse_block(
    lines: list[_YamlLine], position: int, indent: int
) -> tuple[Any, int]:
    if position >= len(lines) or lines[position].indent != indent:
        raise PacketContractError("invalid indentation")
    if lines[position].content == "-" or lines[position].content.startswith("- "):
        return _parse_sequence(lines, position, indent)
    return _parse_mapping(lines, position, indent)


def _parse_mapping(
    lines: list[_YamlLine], position: int, indent: int
) -> tuple[dict[str, Any], int]:
    result: dict[str, Any] = {}
    while position < len(lines) and lines[position].indent == indent:
        line = lines[position]
        if line.content == "-" or line.content.startswith("- "):
            break
        pair = _split_mapping(line.content)
        if pair is None:
            raise PacketContractError(f"line {line.number}: expected key: value")
        key, remainder = pair
        if key in result:
            raise PacketContractError(f"line {line.number}: duplicate key {key!r}")
        position += 1
        if remainder:
            result[key] = _scalar(remainder)
        elif position < len(lines) and lines[position].indent > indent:
            result[key], position = _parse_block(
                lines, position, lines[position].indent
            )
        else:
            result[key] = None
        if position < len(lines) and lines[position].indent < indent:
            break
        if position < len(lines) and lines[position].indent > indent:
            raise PacketContractError(
                f"line {lines[position].number}: unexpected indentation"
            )
    return result, position


def _parse_sequence(
    lines: list[_YamlLine], position: int, indent: int
) -> tuple[list[Any], int]:
    result: list[Any] = []
    item_indent = indent + 2
    while position < len(lines) and lines[position].indent == indent:
        line = lines[position]
        if not (line.content == "-" or line.content.startswith("- ")):
            break
        remainder = line.content[1:].strip()
        position += 1
        if not remainder:
            if position >= len(lines) or lines[position].indent <= indent:
                raise PacketContractError(f"line {line.number}: empty list item")
            value, position = _parse_block(lines, position, lines[position].indent)
            result.append(value)
            continue

        pair = _split_mapping(remainder)
        if pair is None:
            result.append(_scalar(remainder))
            continue

        key, first_value = pair
        item: dict[str, Any] = {}
        if first_value:
            item[key] = _scalar(first_value)
        elif position < len(lines) and lines[position].indent > item_indent:
            item[key], position = _parse_block(
                lines, position, lines[position].indent
            )
        else:
            item[key] = None

        if position < len(lines) and lines[position].indent == item_indent:
            continuation, position = _parse_mapping(lines, position, item_indent)
            duplicate = set(item).intersection(continuation)
            if duplicate:
                raise PacketContractError(
                    f"duplicate list-item keys: {', '.join(sorted(duplicate))}"
                )
            item.update(continuation)
        if position < len(lines) and lines[position].indent > indent:
            raise PacketContractError(
                f"line {lines[position].number}: unexpected list-item indentation"
            )
        result.append(item)
    return result, position


def parse_yaml_subset(text: str, source: str) -> Any:
    """Parse JSON or the packet's indentation-based YAML subset."""
    if not text.strip():
        raise PacketContractError(f"{source}: document is empty")
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    lines: list[_YamlLine] = []
    for number, raw in enumerate(text.splitlines(), start=1):
        if "\t" in raw:
            raise PacketContractError(f"{source}:{number}: tabs are not allowed")
        content = _without_comment(raw).rstrip()
        if not content.strip() or content.strip() in {"---", "..."}:
            continue
        indent = len(content) - len(content.lstrip(" "))
        lines.append(_YamlLine(indent, content.lstrip(" "), number))
    if not lines:
        raise PacketContractError(f"{source}: document contains no data")
    if lines[0].indent != 0:
        raise PacketContractError(f"{source}:{lines[0].number}: root must be unindented")
    value, position = _parse_block(lines, 0, 0)
    if position != len(lines):
        line = lines[position]
        raise PacketContractError(f"{source}:{line.number}: trailing invalid content")
    return value


def _mapping(value: Any, path: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise PacketContractError(f"{path} must be an object")
    return value


def _list(value: Any, path: str, *, nonempty: bool = True) -> list[Any]:
    if not isinstance(value, list):
        raise PacketContractError(f"{path} must be an array")
    if nonempty and not value:
        raise PacketContractError(f"{path} must not be empty")
    return value


def _string(value: Any, path: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise PacketContractError(f"{path} must be a non-empty string")
    return value


def _boolean(value: Any, path: str) -> bool:
    if not isinstance(value, bool):
        raise PacketContractError(f"{path} must be a boolean")
    return value


def _required(obj: dict[str, Any], fields: tuple[str, ...], path: str) -> None:
    missing = [field for field in fields if field not in obj]
    if missing:
        raise PacketContractError(f"{path} missing required: {', '.join(missing)}")


def _closed(obj: dict[str, Any], fields: tuple[str, ...], path: str) -> None:
    unknown = sorted(set(obj) - set(fields))
    if unknown:
        raise PacketContractError(
            f"{path} contains schema-forbidden fields: {', '.join(unknown)}"
        )


def _unique_strings(value: Any, path: str, *, nonempty: bool = True) -> list[str]:
    items = _list(value, path, nonempty=nonempty)
    strings = [_string(item, f"{path}[{index}]") for index, item in enumerate(items)]
    if len(strings) != len(set(strings)):
        raise PacketContractError(f"{path} contains duplicate values")
    return strings


def _objects(value: Any, path: str, *, nonempty: bool = True) -> list[dict[str, Any]]:
    return [
        _mapping(item, f"{path}[{index}]")
        for index, item in enumerate(_list(value, path, nonempty=nonempty))
    ]


def _relative_path(value: Any, path: str, *, directory: bool = False) -> str:
    text = _string(value, path)
    if (
        "\\" in text
        or text.startswith(("/", "~"))
        or re.match(r"^[A-Za-z]:", text)
        or ":" in text
        or "%" in text
        or "?" in text
        or "#" in text
        or any(char in '<>"|*' for char in text)
        or any(ord(char) < 32 for char in text)
        or unicodedata.normalize("NFC", text) != text
    ):
        raise PacketContractError(f"{path} must be a portable workspace-relative path")
    candidate = text[:-1] if directory and text.endswith("/") else text
    if directory and not text.endswith("/"):
        raise PacketContractError(f"{path} must end with /")
    if not directory and text.endswith("/"):
        raise PacketContractError(f"{path} must not end with /")
    parts = PurePosixPath(candidate).parts
    canonical = PurePosixPath(*parts).as_posix() if parts else ""
    windows_reserved = {
        "CON",
        "PRN",
        "AUX",
        "NUL",
        *(f"COM{index}" for index in range(1, 10)),
        *(f"LPT{index}" for index in range(1, 10)),
    }
    if (
        not parts
        or any(part in {"", ".", ".."} for part in parts)
        or any(part.endswith((" ", ".")) for part in parts)
        or any(part.split(".", 1)[0].upper() in windows_reserved for part in parts)
        or candidate != canonical
    ):
        raise PacketContractError(f"{path} must be a normalized relative path")
    return text


def _route_path(value: Any, path: str) -> str:
    text = _string(value, path)
    if (
        not text.startswith("/")
        or text.startswith("//")
        or "\\" in text
        or "%" in text
        or "?" in text
        or "#" in text
        or ":" in text
        or any(ord(char) < 32 for char in text)
    ):
        raise PacketContractError(f"{path} must be a canonical absolute route path")
    parts = text[1:].split("/")
    if not parts or any(part in {"", ".", ".."} for part in parts):
        raise PacketContractError(f"{path} must be a canonical absolute route path")
    return text


def _deviation_map(value: Any, path: str) -> dict[str, dict[str, Any]]:
    declarations = _mapping(value, path)
    parsed: dict[str, dict[str, Any]] = {}
    for identifier, declaration in declarations.items():
        canonical_id = _string(identifier, f"{path} key")
        parsed[canonical_id] = _mapping(declaration, f"{path}.{canonical_id}")
    return parsed


def _validate_source_lock(doc: Any) -> tuple[str, dict[str, str], set[str]]:
    root = _mapping(doc, "source.lock.yaml")
    root_fields = (
        "template_identity",
        "snapshot",
        "discovery_method",
        "anchors_opened",
        "target_receipt",
        "source_revision_note",
        "source_lock_ref",
    )
    _required(
        root,
        ("template_identity", "snapshot", "discovery_method", "anchors_opened", "target_receipt"),
        "source.lock.yaml",
    )
    _closed(root, root_fields, "source.lock.yaml")
    identity = _mapping(root["template_identity"], "source.lock.yaml.template_identity")
    identity_fields = (
        "workspace_path",
        "package_identity",
        "is_fork",
        "fork_confirmed_by",
    )
    _required(
        identity,
        ("workspace_path", "package_identity"),
        "source.lock.yaml.template_identity",
    )
    _closed(identity, identity_fields, "source.lock.yaml.template_identity")
    _relative_path(identity["workspace_path"], "template_identity.workspace_path")
    _string(identity["package_identity"], "template_identity.package_identity")
    if "is_fork" in identity:
        is_fork = _boolean(identity["is_fork"], "template_identity.is_fork")
        if is_fork:
            _string(identity.get("fork_confirmed_by"), "template_identity.fork_confirmed_by")

    snapshot = _mapping(root["snapshot"], "source.lock.yaml.snapshot")
    _closed(snapshot, ("git_commit", "deterministic_hash"), "source.lock.yaml.snapshot")
    present = [key for key in ("git_commit", "deterministic_hash") if key in snapshot]
    if len(present) != 1:
        raise PacketContractError(
            "source.lock.yaml.snapshot requires exactly one of git_commit or deterministic_hash"
        )
    revision = _string(snapshot[present[0]], f"snapshot.{present[0]}")
    expected = SHA40 if present[0] == "git_commit" else SHA64
    if not expected.fullmatch(revision):
        raise PacketContractError(f"snapshot.{present[0]} must be a full lowercase hash")
    method = _string(root.get("discovery_method"), "source.lock.yaml.discovery_method")
    if method not in {"positive_anchors_match", "owner_provided", "owner_confirmed"}:
        raise PacketContractError("source.lock.yaml.discovery_method is invalid")
    anchors = _unique_strings(root.get("anchors_opened"), "source.lock.yaml.anchors_opened")
    for index, anchor in enumerate(anchors):
        _relative_path(anchor, f"source.lock.yaml.anchors_opened[{index}]")
    if "source_lock_ref" in root:
        _relative_path(root["source_lock_ref"], "source.lock.yaml.source_lock_ref")
    if "source_revision_note" in root:
        _string(root["source_revision_note"], "source.lock.yaml.source_revision_note")

    target_receipt = _mapping(root["target_receipt"], "source.lock.yaml.target_receipt")
    receipt_fields = ("revision", "target_contract_sha256", "captured_by")
    _required(target_receipt, receipt_fields, "source.lock.yaml.target_receipt")
    _closed(target_receipt, receipt_fields, "source.lock.yaml.target_receipt")
    target_revision = _string(
        target_receipt["revision"], "source.lock.yaml.target_receipt.revision"
    )
    if not SHA40.fullmatch(target_revision):
        raise PacketContractError("target_receipt.revision must be a full lowercase commit SHA")
    target_contract_sha = _string(
        target_receipt["target_contract_sha256"],
        "source.lock.yaml.target_receipt.target_contract_sha256",
    )
    if not SHA64.fullmatch(target_contract_sha):
        raise PacketContractError("target_receipt.target_contract_sha256 must be SHA-256")
    _string(target_receipt["captured_by"], "source.lock.yaml.target_receipt.captured_by")
    return revision, {
        "revision": target_revision,
        "target_contract_sha256": target_contract_sha,
    }, set(anchors)


def _validate_target(doc: Any) -> tuple[list[str], list[str], list[str]]:
    root = _mapping(doc, "target.yaml")
    _required(root, ("module_key", "module_name", "surfaces", "target_paths"), "target.yaml")
    _closed(
        root,
        ("module_key", "module_name", "surfaces", "target_paths", "schema_source"),
        "target.yaml",
    )
    module_key = _string(root["module_key"], "target.yaml.module_key")
    if not MODULE_KEY.fullmatch(module_key):
        raise PacketContractError("target.yaml.module_key is invalid")
    _string(root["module_name"], "target.yaml.module_name")
    surfaces = _unique_strings(root["surfaces"], "target.yaml.surfaces")
    paths = _mapping(root["target_paths"], "target.yaml.target_paths")
    _required(paths, ("feature_root", "routes", "components"), "target.yaml.target_paths")
    path_groups = ("components", "services", "hooks", "stores", "tests")
    _closed(paths, ("feature_root", "routes") + path_groups, "target.yaml.target_paths")
    _relative_path(paths["feature_root"], "target_paths.feature_root", directory=True)
    routes = _unique_strings(paths["routes"], "target_paths.routes")
    for index, route in enumerate(routes):
        _route_path(route, f"target_paths.routes[{index}]")
    implementation_paths: list[str] = []
    for group in path_groups:
        if group not in paths:
            continue
        values = _unique_strings(paths[group], f"target_paths.{group}", nonempty=group == "components")
        for index, item in enumerate(values):
            implementation_paths.append(
                _relative_path(item, f"target_paths.{group}[{index}]")
            )
    schema = _mapping(root.get("schema_source"), "target.yaml.schema_source")
    _required(schema, ("type", "reference", "verified"), "target.yaml.schema_source")
    _closed(schema, ("type", "reference", "verified"), "target.yaml.schema_source")
    schema_type = _string(schema["type"], "schema_source.type")
    if schema_type not in {"spec", "supabase_table", "api_endpoint", "owner_confirmed"}:
        raise PacketContractError("schema_source.type is invalid")
    _string(schema["reference"], "schema_source.reference")
    if _boolean(schema["verified"], "schema_source.verified") is not True:
        raise PacketContractError("schema_source.verified must be true")
    return surfaces, routes, implementation_paths


def _validate_structural(doc: Any) -> dict[str, list[str]]:
    root = _mapping(doc, "structural-map.yaml")
    fields = (
        "component_mappings",
        "nesting_hierarchy",
        "routes",
        "state_ownership",
        "data_contracts",
        "event_flows",
        "planner_owns",
    )
    _required(root, fields, "structural-map.yaml")
    _closed(root, fields, "structural-map.yaml")
    _unique_strings(root["planner_owns"], "structural-map.yaml.planner_owns", nonempty=False)
    source_components: list[str] = []
    target_components: list[str] = []
    for index, item in enumerate(_objects(root["component_mappings"], "component_mappings")):
        path = f"component_mappings[{index}]"
        _required(item, ("source_component", "target_component", "decision"), path)
        _closed(
            item,
            (
                "source_component",
                "target_component",
                "decision",
                "uncertainty",
                "rationale",
                "key_properties",
            ),
            path,
        )
        source_components.append(
            _relative_path(item["source_component"], f"{path}.source_component")
        )
        target_components.append(
            _relative_path(item["target_component"], f"{path}.target_component")
        )
        if _string(item["decision"], f"{path}.decision") not in {
            "create",
            "adapt",
            "reuse",
            "not_applicable",
        }:
            raise PacketContractError(f"{path}.decision is invalid")
        if "uncertainty" in item and _boolean(item["uncertainty"], f"{path}.uncertainty"):
            raise PacketContractError(f"{path}.uncertainty must be resolved before proof")
        if "key_properties" in item:
            _unique_strings(item["key_properties"], f"{path}.key_properties", nonempty=False)
    if not _mapping(root["nesting_hierarchy"], "nesting_hierarchy"):
        raise PacketContractError("nesting_hierarchy must not be empty")
    # Ajv owns the V3 route-map shape. This transitional validator only extracts
    # its keys for the cross-document equality check until ASN11 cutover.
    route_paths = list(_mapping(root["routes"], "structural-map.yaml.routes"))
    for index, item in enumerate(_objects(root["state_ownership"], "state_ownership")):
        path = f"state_ownership[{index}]"
        _required(item, ("state_key", "owner"), path)
        _closed(item, ("state_key", "owner", "shared_with"), path)
        _string(item["state_key"], f"{path}.state_key")
        _string(item["owner"], f"{path}.owner")
        if "shared_with" in item:
            _unique_strings(item["shared_with"], f"{path}.shared_with", nonempty=False)
    for index, item in enumerate(_objects(root["data_contracts"], "data_contracts")):
        path = f"data_contracts[{index}]"
        _required(item, ("interface_or_type", "source"), path)
        _closed(item, ("interface_or_type", "source", "fields"), path)
        _string(item["interface_or_type"], f"{path}.interface_or_type")
        _string(item["source"], f"{path}.source")
        if "fields" in item:
            for field_index, field in enumerate(_objects(item["fields"], f"{path}.fields")):
                field_path = f"{path}.fields[{field_index}]"
                _required(field, ("name", "type", "nullable"), field_path)
                _closed(field, ("name", "type", "nullable"), field_path)
                _string(field["name"], f"{field_path}.name")
                _string(field["type"], f"{field_path}.type")
                _boolean(field["nullable"], f"{field_path}.nullable")
    for index, item in enumerate(_objects(root["event_flows"], "event_flows")):
        path = f"event_flows[{index}]"
        _required(item, ("event", "producer", "consumer"), path)
        _closed(item, ("event", "producer", "consumer", "payload_type"), path)
        for field in ("event", "producer", "consumer"):
            _string(item[field], f"{path}.{field}")
        if "payload_type" in item:
            _string(item["payload_type"], f"{path}.payload_type")
    return {
        "routes": route_paths,
        "source_components": source_components,
        "target_components": target_components,
    }


def _validate_visual(doc: Any) -> list[str]:
    root = _mapping(doc, "visual-contract.yaml")
    _required(root, ("surfaces",), "visual-contract.yaml")
    _closed(root, ("surfaces",), "visual-contract.yaml")
    # Ajv owns the V3 visual surface-map shape. This transitional validator only
    # extracts its keys for the cross-document equality check until ASN11 cutover.
    return list(_mapping(root["surfaces"], "visual-contract.yaml.surfaces"))


def _validate_behavior(doc: Any) -> list[str]:
    root = _mapping(doc, "behavior-contract.yaml")
    _required(root, ("behaviors",), "behavior-contract.yaml")
    _closed(root, ("behaviors",), "behavior-contract.yaml")
    # Ajv owns the V3 behavior surface-map shape. This transitional validator
    # only extracts its keys for the cross-document equality check until ASN11.
    return list(_mapping(root["behaviors"], "behavior-contract.yaml.behaviors"))


def _validate_architecture(doc: Any) -> dict[str, dict[str, Any]]:
    root = _mapping(doc, "architecture-adaptation.yaml")
    fields = ("preserve", "adapt", "must_not_copy", "target_equivalents", "accepted_deviations")
    _required(root, fields, "architecture-adaptation.yaml")
    _closed(root, fields, "architecture-adaptation.yaml")
    contracts = (
        ("preserve", ("pattern", "rationale"), ("target_equivalent",)),
        ("adapt", ("source_pattern", "target_pattern", "adaptation"), ("justification",)),
        ("must_not_copy", ("forbidden_pattern", "reason", "target_alternative"), ()),
        ("target_equivalents", ("source", "target"), ("notes",)),
    )
    for group, required_fields, optional_fields in contracts:
        for index, item in enumerate(_objects(root[group], group)):
            path = f"{group}[{index}]"
            _required(item, required_fields, path)
            _closed(item, required_fields + optional_fields, path)
            for field in required_fields:
                _string(item[field], f"{path}.{field}")
            for field in optional_fields:
                if field in item:
                    _string(item[field], f"{path}.{field}")
            if group == "target_equivalents":
                _relative_path(item["source"], f"{path}.source")
                _relative_path(item["target"], f"{path}.target")
    # Ajv owns each declaration's closed six-field shape. The semantic layer
    # parses the map so it can enforce keyed cross-document identity.
    return _deviation_map(root["accepted_deviations"], "accepted_deviations")


def _validate_deviations(doc: Any) -> dict[str, dict[str, Any]]:
    root = _mapping(doc, "deviations.yaml")
    _required(root, ("default", "allowed_only_when", "deviations"), "deviations.yaml")
    _closed(root, ("default", "allowed_only_when", "deviations"), "deviations.yaml")
    _string(root["default"], "deviations.yaml.default")
    _string(root["allowed_only_when"], "deviations.yaml.allowed_only_when")
    # Ajv owns each declaration's closed six-field shape. The semantic layer
    # retains list order inside payloads and ignores only mapping insertion order.
    return _deviation_map(root["deviations"], "deviations")


def _identity(value: Any, path: str, expected_role: str) -> dict[str, str]:
    identity = _mapping(value, path)
    _required(identity, ("subject_id", "display_name", "role"), path)
    _closed(identity, ("subject_id", "display_name", "role"), path)
    subject_id = _string(identity["subject_id"], f"{path}.subject_id")
    if not SUBJECT_ID.fullmatch(subject_id):
        raise PacketContractError(
            f"{path}.subject_id must be a canonical lowercase scheme-qualified id "
            "without aliases, query, fragment, percent-encoding, or dot segments"
        )
    display_name = _string(identity["display_name"], f"{path}.display_name")
    role = _string(identity["role"], f"{path}.role")
    if role not in IDENTITY_ROLES or role != expected_role:
        raise PacketContractError(f"{path}.role must be {expected_role}")
    return {"subject_id": subject_id, "display_name": display_name, "role": role}


def _validate_proof(
    doc: Any,
    *,
    source_lock_sha: str,
    source_revision: str,
    expected_target_revision: str,
    target_surfaces: list[str],
    target_paths: list[str],
    source_reference_paths: set[str],
    mapped_target_paths: set[str],
    deviation_ids: set[str],
) -> None:
    root = _mapping(doc, "proof.yaml")
    fields = (
        "template_identity_and_snapshot",
        "target_revision",
        "worker_identity",
        "target_surface_and_reference_paths",
        "target_paths",
        "shell_behavior_state_motion_responsive_map",
        "variable_map_with_schema_or_spec_source",
        "approved_deviations",
        "verification_evidence",
    )
    _required(root, fields, "proof.yaml")
    _closed(root, fields + ("planner_notes",), "proof.yaml")
    if "planner_notes" in root:
        _string(root["planner_notes"], "proof.planner_notes")

    snapshot = _mapping(
        root["template_identity_and_snapshot"],
        "proof.template_identity_and_snapshot",
    )
    _required(snapshot, ("source_lock_sha", "verified_by"), "template_identity_and_snapshot")
    _closed(snapshot, ("source_lock_sha", "verified_by"), "template_identity_and_snapshot")
    if _string(snapshot["source_lock_sha"], "source_lock_sha") != source_lock_sha:
        raise PacketContractError("proof source_lock_sha does not match source.lock.yaml bytes")
    _string(snapshot["verified_by"], "template_identity_and_snapshot.verified_by")
    target_revision = _string(root["target_revision"], "proof.target_revision")
    if not SHA40.fullmatch(target_revision):
        raise PacketContractError("proof.target_revision must be a full lowercase commit SHA")
    if target_revision != expected_target_revision:
        raise PacketContractError(
            "proof.target_revision does not match authoritative source-lock target receipt"
        )
    worker = _identity(root["worker_identity"], "proof.worker_identity", "worker")

    referenced_surfaces: list[str] = []
    target_surface_records = _mapping(
        root["target_surface_and_reference_paths"],
        "target_surface_and_reference_paths",
    )
    for surface_key, item in target_surface_records.items():
        path = f"target_surface_and_reference_paths.{surface_key}"
        surface = _string(surface_key, "target_surface_and_reference_paths key")
        record = _mapping(item, path)
        _required(record, ("reference_path", "target_path", "verified"), path)
        _closed(record, ("reference_path", "target_path", "verified"), path)
        referenced_surfaces.append(surface)
        reference_path = _relative_path(record["reference_path"], f"{path}.reference_path")
        target_path = _relative_path(record["target_path"], f"{path}.target_path")
        if reference_path not in source_reference_paths:
            raise PacketContractError(
                f"{path}.reference_path is not a declared source anchor and component mapping"
            )
        if target_path not in set(target_paths) or target_path not in mapped_target_paths:
            raise PacketContractError(
                f"{path}.target_path is not a declared target path and component mapping"
            )
        if _boolean(record["verified"], f"{path}.verified") is not True:
            raise PacketContractError(f"{path}.verified must be true")
    if set(referenced_surfaces) != set(target_surfaces) or len(referenced_surfaces) != len(
        target_surfaces
    ):
        raise PacketContractError("proof surfaces must exactly cover target.yaml surfaces")

    proof_paths = _unique_strings(root["target_paths"], "proof.target_paths")
    for index, item in enumerate(proof_paths):
        _relative_path(item, f"proof.target_paths[{index}]")
    if set(proof_paths) != set(target_paths) or len(proof_paths) != len(target_paths):
        raise PacketContractError("proof.target_paths must exactly match implementation target paths")

    dimensions = _mapping(
        root["shell_behavior_state_motion_responsive_map"],
        "shell_behavior_state_motion_responsive_map",
    )
    _required(
        dimensions,
        REQUIRED_DIMENSIONS + ("deviations_recorded",),
        "shell_behavior_state_motion_responsive_map",
    )
    _closed(
        dimensions,
        REQUIRED_DIMENSIONS + ("deviations_recorded",),
        "shell_behavior_state_motion_responsive_map",
    )
    for field in REQUIRED_DIMENSIONS + ("deviations_recorded",):
        if _boolean(dimensions[field], f"proof dimensions.{field}") is not True:
            raise PacketContractError(f"proof dimensions.{field} must be true")

    variable_surfaces: set[str] = set()
    variable_map = _mapping(
        root["variable_map_with_schema_or_spec_source"],
        "variable_map_with_schema_or_spec_source",
    )
    for surface_key, slots in variable_map.items():
        surface = _string(surface_key, "variable_map_with_schema_or_spec_source key")
        surface_path = f"variable_map_with_schema_or_spec_source.{surface}"
        slot_map = _mapping(slots, surface_path)
        if surface not in target_surfaces:
            raise PacketContractError(f"{surface_path} is not a target surface")
        variable_surfaces.add(surface)
        for slot_key, slot_item in slot_map.items():
            slot_path = f"{surface_path}.{slot_key}"
            slot = _string(slot_key, f"{surface_path} key")
            record = _mapping(slot_item, slot_path)
            _required(record, ("source", "verified_against"), slot_path)
            _closed(record, ("source", "verified_against"), slot_path)
            for field in ("source", "verified_against"):
                _string(record[field], f"{slot_path}.{field}")
    if variable_surfaces != set(target_surfaces):
        raise PacketContractError("variable map must cover every target surface")

    approved: set[str] = set()
    approved_map = _mapping(root["approved_deviations"], "approved_deviations")
    for deviation_id, item in approved_map.items():
        identifier = _string(deviation_id, "approved_deviations key")
        path = f"approved_deviations.{identifier}"
        record = _mapping(item, path)
        _required(record, ("status",), path)
        _closed(record, ("status",), path)
        if _string(record["status"], f"{path}.status") != "approved":
            raise PacketContractError(f"{path}.status must be approved")
        approved.add(identifier)
    if approved != deviation_ids:
        raise PacketContractError("proof approved deviations must exactly match deviations.yaml")

    evidence = _objects(root["verification_evidence"], "verification_evidence")
    evidence_types: list[str] = []
    independent_identity: dict[str, str] | None = None
    required_evidence_fields = (
        "type",
        "result",
        "command_or_method",
        "source_revision",
        "target_revision",
        "artifact_uri",
        "artifact_sha256",
    )
    for index, item in enumerate(evidence):
        path = f"verification_evidence[{index}]"
        _required(item, required_evidence_fields, path)
        allowed_evidence_fields = required_evidence_fields + ("verifier_identity",)
        _closed(item, allowed_evidence_fields, path)
        evidence_type = _string(item["type"], f"{path}.type")
        evidence_types.append(evidence_type)
        if evidence_type not in REQUIRED_EVIDENCE_TYPES:
            raise PacketContractError(f"{path}.type is not a required evidence category")
        if _string(item["result"], f"{path}.result") != "pass":
            raise PacketContractError(f"{path}.result must be pass")
        _string(item["command_or_method"], f"{path}.command_or_method")
        if _string(item["source_revision"], f"{path}.source_revision") != source_revision:
            raise PacketContractError(f"{path}.source_revision is stale or mismatched")
        if _string(item["target_revision"], f"{path}.target_revision") != target_revision:
            raise PacketContractError(f"{path}.target_revision is stale or mismatched")
        artifact_uri = _string(item["artifact_uri"], f"{path}.artifact_uri")
        if not re.fullmatch(r"[a-z][a-z0-9+.-]*://[^\s?#]+", artifact_uri):
            raise PacketContractError(
                f"{path}.artifact_uri must be a stable scheme-qualified artifact URI"
            )
        artifact_sha = _string(item["artifact_sha256"], f"{path}.artifact_sha256")
        if not SHA64.fullmatch(artifact_sha):
            raise PacketContractError(f"{path}.artifact_sha256 must be a lowercase SHA-256")
        if evidence_type == "independent_revision_verification":
            independent_identity = _identity(
                item.get("verifier_identity"),
                f"{path}.verifier_identity",
                "independent_verifier",
            )
        elif "verifier_identity" in item:
            raise PacketContractError(
                f"{path}.verifier_identity is only valid for independent revision verification"
            )
    if len(evidence_types) != len(set(evidence_types)):
        raise PacketContractError("verification_evidence contains duplicate types")
    missing = REQUIRED_EVIDENCE_TYPES - set(evidence_types)
    if missing:
        raise PacketContractError(
            "verification_evidence missing required types: " + ", ".join(sorted(missing))
        )
    if independent_identity is None:
        raise PacketContractError("independent verifier identity is missing")
    if worker["subject_id"] == independent_identity["subject_id"]:
        raise PacketContractError(
            "worker and independent verifier must have distinct stable subject ids"
        )


def _validate_fixtures(packet: Path, target_surfaces: list[str]) -> None:
    fixtures = packet / "fixtures"
    if not fixtures.is_dir() or fixtures.is_symlink():
        raise PacketContractError("fixtures/ directory is required")
    entries = sorted(fixtures.iterdir(), key=lambda item: item.name)
    if not entries:
        raise PacketContractError("fixtures/ must contain negative fixtures")
    for candidate in entries:
        if (
            not candidate.is_file()
            or candidate.is_symlink()
            or candidate.suffix not in {".yaml", ".yml"}
        ):
            raise PacketContractError(f"fixtures/{candidate.name} is not a YAML fixture file")
        doc = parse_yaml_subset(candidate.read_text(encoding="utf-8"), str(candidate))
        root = _mapping(doc, f"fixtures/{candidate.name}")
        _required(
            root,
            ("surface", "scenario", "invariant", "expected_outcome", "mocks"),
            f"fixtures/{candidate.name}",
        )
        _closed(
            root,
            ("surface", "scenario", "invariant", "expected_outcome", "mocks"),
            f"fixtures/{candidate.name}",
        )
        surface = _string(root["surface"], f"fixtures/{candidate.name}.surface")
        if surface not in target_surfaces:
            raise PacketContractError(
                f"fixtures/{candidate.name}.surface is not a target surface"
            )
        for field in ("scenario", "invariant", "expected_outcome"):
            _string(root[field], f"fixtures/{candidate.name}.{field}")
        for index, mock in enumerate(_objects(root["mocks"], f"fixtures/{candidate.name}.mocks")):
            if not mock:
                raise PacketContractError(
                    f"fixtures/{candidate.name}.mocks[{index}] must not be empty"
                )


def validate(packet: Path) -> list[str]:
    errors: list[str] = []
    if not packet.is_dir() or packet.is_symlink():
        return [f"PARITY_PACKET_REQUIRED: packet directory is missing or unsafe: {packet}"]

    allowed = set(REQUIRED_PACKET_FILES) | {"fixtures"}
    actual = {entry.name for entry in packet.iterdir()}
    missing = set(REQUIRED_PACKET_FILES) - actual
    extra = actual - allowed
    if missing:
        errors.append(
            "PARITY_PACKET_REQUIRED: missing packet files: " + ", ".join(sorted(missing))
        )
    if extra:
        errors.append(
            "PARITY_PACKET_EXTRA: unexpected packet entries: " + ", ".join(sorted(extra))
        )
    if errors:
        return errors

    documents: dict[str, Any] = {}
    raw_bytes: dict[str, bytes] = {}
    for name in REQUIRED_PACKET_FILES:
        candidate = packet / name
        if not candidate.is_file() or candidate.is_symlink():
            errors.append(f"PARITY_PACKET_REQUIRED: {name} must be a regular file")
            continue
        try:
            raw = candidate.read_bytes()
            text = raw.decode("utf-8")
            raw_bytes[name] = raw
            documents[name] = parse_yaml_subset(text, name)
        except (OSError, UnicodeDecodeError, PacketContractError) as exc:
            errors.append(f"PARITY_YAML_INVALID: {name}: {exc}")
    if errors:
        return errors

    validations: tuple[tuple[str, Callable[[Any], Any]], ...] = (
        ("source.lock.yaml", _validate_source_lock),
        ("target.yaml", _validate_target),
        ("structural-map.yaml", _validate_structural),
        ("visual-contract.yaml", _validate_visual),
        ("behavior-contract.yaml", _validate_behavior),
        ("architecture-adaptation.yaml", _validate_architecture),
        ("deviations.yaml", _validate_deviations),
    )
    results: dict[str, Any] = {}
    for name, validator in validations:
        try:
            results[name] = validator(documents[name])
        except PacketContractError as exc:
            errors.append(f"PARITY_SCHEMA_INVALID: {name}: {exc}")
    if errors:
        return errors

    source_revision, target_receipt, source_anchors = results["source.lock.yaml"]
    target_contract_sha = hashlib.sha256(raw_bytes["target.yaml"]).hexdigest()
    if target_receipt["target_contract_sha256"] != target_contract_sha:
        errors.append(
            "PARITY_CROSS_CONTRACT: source-lock target receipt does not match target.yaml bytes"
        )
    target_surfaces, target_routes, target_paths = results["target.yaml"]
    structural = results["structural-map.yaml"]
    structural_routes = structural["routes"]
    visual_surfaces = results["visual-contract.yaml"]
    behavior_surfaces = results["behavior-contract.yaml"]
    if set(target_routes) != set(structural_routes):
        errors.append(
            "PARITY_CROSS_CONTRACT: structural route keys do not exactly match target routes"
        )
    if set(target_surfaces) != set(visual_surfaces):
        errors.append(
            "PARITY_CROSS_CONTRACT: visual surface keys do not exactly match "
            "target surfaces"
        )
    if set(target_surfaces) != set(behavior_surfaces):
        errors.append(
            "PARITY_CROSS_CONTRACT: behavior surface keys do not exactly match "
            "target surfaces"
        )
    architecture_deviations = results["architecture-adaptation.yaml"]
    declared_deviations = results["deviations.yaml"]
    if set(architecture_deviations) != set(declared_deviations):
        errors.append(
            "PARITY_CROSS_CONTRACT: architecture accepted_deviations keys do not "
            "exactly match deviations.yaml"
        )
    elif any(
        architecture_deviations[identifier] != declared_deviations[identifier]
        for identifier in declared_deviations
    ):
        errors.append(
            "PARITY_CROSS_CONTRACT: architecture accepted_deviations payloads do not "
            "exactly match deviations.yaml"
        )
    if any(
        declaration.get("affected_surface") not in target_surfaces
        for declaration in declared_deviations.values()
    ):
        errors.append(
            "PARITY_CROSS_CONTRACT: architecture deviation references a non-target surface"
        )
    source_reference_paths = source_anchors.intersection(structural["source_components"])
    mapped_target_paths = set(structural["target_components"])
    try:
        _validate_fixtures(packet, target_surfaces)
    except (OSError, UnicodeDecodeError, PacketContractError) as exc:
        errors.append(f"PARITY_FIXTURE_INVALID: {exc}")
    if errors:
        return errors

    try:
        _validate_proof(
            documents["proof.yaml"],
            source_lock_sha=hashlib.sha256(raw_bytes["source.lock.yaml"]).hexdigest(),
            source_revision=source_revision,
            expected_target_revision=target_receipt["revision"],
            target_surfaces=target_surfaces,
            target_paths=target_paths,
            source_reference_paths=source_reference_paths,
            mapped_target_paths=mapped_target_paths,
            deviation_ids=set(declared_deviations),
        )
    except PacketContractError as exc:
        errors.append(f"PARITY_PROOF_INVALID: {exc}")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("packet", type=Path)
    args = parser.parse_args()
    errors = validate(args.packet)
    if errors:
        print("\n".join(errors), file=sys.stderr)
        return 1
    print(f"PARITY_PACKET_PASS: {args.packet}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
