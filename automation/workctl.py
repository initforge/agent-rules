#!/usr/bin/env python3
"""Portable work orchestration state for automatic plan execution.

The host-native agent remains the orchestrator. This tool only classifies work,
keeps resumable state, prevents write-scope collisions, and gates PASS on fresh
proof plus resolved review findings.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import subprocess
import tempfile
import time
import uuid
from contextlib import contextmanager, nullcontext
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from typing import Any, Iterator

try:
    import jsonschema
except ImportError:  # pragma: no cover - exercised by minimal native runtimes.
    jsonschema = None


SCRIPT_DIR = Path(__file__).resolve().parent
ROOT = SCRIPT_DIR.parent
SCHEMA_CANDIDATES = (
    SCRIPT_DIR / "work-ledger.schema.json",  # canonical automation/ and installed bundle
    ROOT / "automation" / "work-ledger.schema.json",  # compatibility fallback
)
WORK_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{2,79}$")
EFFORTS = {"low", "medium", "high"}
EFFORT_RANK = {"low": 0, "medium": 1, "high": 2}
FINAL_ACTIONS = {"edit", "commit", "push", "deploy", "external-write"}
PROOF_KINDS = {
    "static", "diff", "build", "unit", "integration", "api", "e2e",
    "browser", "performance", "security", "manual", "artifact",
}
EXTERNAL_VERIFIERS = {
    "browser-qa", "playwright", "chrome-devtools", "api-runner",
    "test-runner", "human-owner", "external-system",
}
REVIEW_RISKS = {
    "ui-parity", "public-api", "business-invariant", "auth", "permission",
    "security", "migration", "concurrency", "distributed-consistency",
    "performance", "query-index", "cache", "resource-lifetime", "multi-writer",
}
EXECUTOR_ROLES = {"mechanical-executor", "executor", "specialist", "main"}


class WorkError(RuntimeError):
    """A work contract or state transition is invalid."""


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def emit(value: Any) -> None:
    print(json.dumps(value, ensure_ascii=False, indent=2))


def load_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8-sig"))
    if not isinstance(value, dict):
        raise WorkError(f"{path}: expected JSON object")
    return value


def canonical_json(value: Any) -> str:
    """Stable portable identity for JSON plan payloads."""
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def migrate_v2(ledger: dict[str, Any]) -> dict[str, Any]:
    """Upgrade v2 ledgers without discarding their historical evidence."""
    if ledger.get("schema_version") == 3:
        upgraded = dict(ledger)
        upgraded.setdefault("model_policy_reasons", [])
        return upgraded
    if ledger.get("schema_version") != 2:
        return ledger
    upgraded = dict(ledger)
    plan_ref = str(upgraded.pop("plan_ref", "native-plan"))
    upgraded["schema_version"] = 3
    upgraded["plan"] = {
        "ref": plan_ref,
        "sha256": sha256_text(plan_ref),
        "identity": "legacy-v2-plan-ref",
    }
    contract = dict(upgraded.get("execution_contract", {}))
    contract["execute_authorization"] = {
        "authorized": True,
        "recorded_at": upgraded.get("created_at", now()),
        "source": "v2-migration",
        "actions": list(contract.get("authorized_final_actions", ["edit"])),
    }
    upgraded["execution_contract"] = contract
    upgraded["host_refs"] = {"host": "unknown", "task_ref": "", "session_ref": ""}
    upgraded["model_policy_reasons"] = []
    for assignment in upgraded.get("assignments", []):
        assignment.setdefault("model_evidence", legacy_model_evidence(assignment))
    for receipt in upgraded.get("receipts", []):
        receipt.setdefault("model_evidence", legacy_model_evidence(receipt))
    for review in upgraded.get("reviews", []):
        review.setdefault("model_evidence", legacy_model_evidence(review))
    return upgraded


def legacy_model_evidence(value: dict[str, Any]) -> dict[str, Any]:
    model = str(value.get("model", "unknown"))
    effort = str(value.get("effort", "medium"))
    return {
        "requested_model": model,
        "requested_effort": effort,
        "resolved_model": model,
        "resolved_effort": effort,
        "observed_model": None,
        "observed_effort": None,
        "status": "unobserved",
        "fallback_reason": "legacy record did not contain host observation",
        "main_direct_exception_reason": "",
    }


def normalize_model_evidence(value: dict[str, Any]) -> dict[str, Any]:
    """Keep requested routing separate from actual host-observed evidence."""
    requested_model = str(value.get("requested_model", value.get("model", "unknown")))
    requested_effort = str(value.get("requested_effort", value.get("effort", "medium")))
    result = {
        "requested_model": requested_model,
        "requested_effort": requested_effort,
        "resolved_model": str(value.get("resolved_model", requested_model)),
        "resolved_effort": str(value.get("resolved_effort", requested_effort)),
        "observed_model": value.get("observed_model"),
        "observed_effort": value.get("observed_effort"),
        "status": str(value.get("evidence_status", value.get("status", "unobserved"))),
        "fallback_reason": str(value.get("fallback_reason", "")),
        "main_direct_exception_reason": str(value.get("main_direct_exception_reason", "")),
    }
    if result["status"] not in {"observed", "unobserved", "fallback"}:
        result["status"] = "unobserved"
    if result["status"] == "observed":
        if not result["observed_model"] or not result["observed_effort"]:
            raise WorkError("observed model evidence requires observed model and effort")
    elif result["observed_model"] is not None or result["observed_effort"] is not None:
        raise WorkError("unobserved model evidence must not claim observed model or effort")
    if result["status"] == "fallback" and not result["fallback_reason"]:
        raise WorkError("fallback model evidence requires fallback_reason")
    return result


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def acceptance_contract_hash(target: dict[str, Any]) -> str:
    contract = {
        "claim": target["claim"],
        "proof_profile": target["proof_profile"],
        "required_proof_kinds": sorted(target["required_proof_kinds"]),
        "required_dimensions": sorted(target["required_dimensions"]),
    }
    return sha256_text(json.dumps(contract, ensure_ascii=False, sort_keys=True))


def artifact_evidence(
    root: Path, paths: list[str], not_before: datetime | None = None,
) -> list[dict[str, Any]]:
    evidence: list[dict[str, Any]] = []
    for raw in paths:
        candidate = Path(raw)
        if not candidate.is_absolute():
            candidate = root / candidate
        candidate = candidate.resolve()
        if not candidate.is_file():
            raise WorkError(f"proof artifact is missing or not a file: {candidate}")
        modified = datetime.fromtimestamp(candidate.stat().st_mtime, timezone.utc)
        if not_before is not None and modified < not_before:
            raise WorkError(
                f"proof artifact predates the work ledger and is not fresh: {candidate}"
            )
        digest = hashlib.sha256()
        with candidate.open("rb") as handle:
            for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                digest.update(chunk)
        evidence.append({
            "path": str(candidate),
            "sha256": digest.hexdigest(),
            "size_bytes": candidate.stat().st_size,
            "modified_at": modified.isoformat(),
        })
    return evidence


def payload(args: argparse.Namespace) -> dict[str, Any]:
    if getattr(args, "payload_file", None):
        return load_json(Path(args.payload_file))
    raw = getattr(args, "payload_json", "")
    if raw:
        value = json.loads(raw)
        if not isinstance(value, dict):
            raise WorkError("payload must be a JSON object")
        return value
    return {}


def integer(signals: dict[str, Any], key: str) -> int:
    value = signals.get(key, 0)
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise WorkError(f"signal {key} must be numeric")
    return max(0, int(value))


def classify(signals: dict[str, Any]) -> dict[str, Any]:
    files = integer(signals, "file_count")
    domains = integer(signals, "domain_count")
    acceptance = integer(signals, "acceptance_count")
    groups = integer(signals, "independent_groups")
    agents = integer(signals, "agent_count")
    minutes = integer(signals, "expected_minutes")
    risks = {str(item) for item in signals.get("risk_signals", [])}
    external_wait = bool(signals.get("external_wait"))
    resume = bool(signals.get("resume_requested") or signals.get("multi_session"))
    rollback = bool(signals.get("rollback_sensitive"))
    reasons: list[str] = []

    if resume or external_wait or minutes >= 90:
        shape = "resumable"
        reasons.append("resume/external wait/long runtime")
    elif domains >= 3 or groups >= 2 or acceptance >= 9 or agents >= 3 or minutes >= 60:
        shape = "large"
        reasons.append("multiple domains, independent groups, agents or acceptance criteria")
    elif domains >= 2 or files >= 3 or acceptance >= 3 or risks or agents >= 2 or minutes >= 20:
        shape = "medium"
        reasons.append("multi-file, multi-domain, risk, review or coordination")
    else:
        shape = "small"
        reasons.append("bounded single-session change")

    if shape in {"large", "resumable"}:
        ledger = "required"
    elif shape == "medium" and (agents >= 2 or acceptance >= 5 or risks or rollback or minutes >= 30):
        ledger = "auto"
    else:
        ledger = "off"

    if groups >= 2 and agents >= 2:
        strategy = "parallel"
    elif shape != "small" or agents >= 2:
        strategy = "delegated"
    else:
        strategy = "single-agent"

    review_required = bool(risks & REVIEW_RISKS) or agents >= 3
    if review_required:
        reasons.append("risk-triggered independent review")
    return {
        "shape": shape,
        "ledger": ledger,
        "strategy": strategy,
        "review_required": review_required,
        "reasons": reasons,
    }


def normalize_path(value: str) -> str:
    text = value.replace("\\", "/").strip()
    while text.startswith("./"):
        text = text[2:]
    prefix = text.split("*", 1)[0].rstrip("/")
    return str(PurePosixPath(prefix or "."))


def paths_overlap(left: str, right: str) -> bool:
    a, b = normalize_path(left), normalize_path(right)
    return a == b or a.startswith(b + "/") or b.startswith(a + "/")


def validate_ids(ledger: dict[str, Any]) -> None:
    def unique(values: list[str], label: str) -> None:
        duplicates = sorted({item for item in values if values.count(item) > 1})
        if duplicates:
            raise WorkError(f"duplicate {label}: {duplicates}")

    sources = [str(item["id"]) for item in ledger.get("source_history", [])]
    slices = [str(item["id"]) for item in ledger.get("slices", [])]
    assignments = [str(item["id"]) for item in ledger.get("assignments", [])]
    receipts = [str(item["id"]) for item in ledger.get("receipts", [])]
    findings = [str(item["id"]) for item in ledger.get("findings", [])]
    for values, label in (
        (sources, "source ids"), (slices, "slice ids"), (assignments, "assignment ids"),
        (receipts, "receipt ids"), (findings, "finding ids"),
    ):
        unique(values, label)
    source_set, slice_set = set(sources), set(slices)
    acceptance_by_slice = {
        item["id"]: {acceptance["id"] for acceptance in item.get("acceptance", [])}
        for item in ledger.get("slices", [])
    }
    for source in ledger.get("source_history", []):
        unknown = set(source.get("slice_ids", [])) - slice_set - {"*"}
        if unknown:
            raise WorkError(f"source {source['id']}: unknown slice ids {sorted(unknown)}")
    for item in ledger.get("assignments", []):
        normalize_model_evidence(item["model_evidence"])
        if item["slice_id"] not in slice_set:
            raise WorkError(f"assignment {item['id']}: unknown slice {item['slice_id']}")
        missing = set(item["source_ids"]) - source_set
        if missing:
            raise WorkError(f"assignment {item['id']}: unknown source ids {sorted(missing)}")
        unknown_acceptance = set(item["acceptance_ids"]) - acceptance_by_slice[item["slice_id"]]
        if unknown_acceptance:
            raise WorkError(
                f"assignment {item['id']}: acceptance ids do not belong to "
                f"{item['slice_id']}: {sorted(unknown_acceptance)}"
            )
    for collection in ("receipts", "reviews"):
        for item in ledger.get(collection, []):
            normalize_model_evidence(item["model_evidence"])


def validate_portable_schema(
    value: Any,
    schema: dict[str, Any],
    root_schema: dict[str, Any],
    location: str = "<root>",
) -> None:
    """Validate the ledger schema without third-party packages."""
    if "$ref" in schema:
        target: Any = root_schema
        for part in schema["$ref"].removeprefix("#/").split("/"):
            target = target[part.replace("~1", "/").replace("~0", "~")]
        validate_portable_schema(value, target, root_schema, location)
        return

    if "oneOf" in schema:
        matches = 0
        for choice in schema["oneOf"]:
            try:
                validate_portable_schema(value, choice, root_schema, location)
                matches += 1
            except WorkError:
                pass
        if matches != 1:
            raise WorkError(f"ledger schema violation at {location}: expected exactly one allowed shape")
        return

    if "const" in schema and value != schema["const"]:
        raise WorkError(f"ledger schema violation at {location}: expected {schema['const']!r}")
    if "enum" in schema and value not in schema["enum"]:
        raise WorkError(f"ledger schema violation at {location}: value is not allowed")

    expected_types = schema.get("type")
    if expected_types:
        names = expected_types if isinstance(expected_types, list) else [expected_types]

        def matches_type(name: str) -> bool:
            return {
                "object": isinstance(value, dict),
                "array": isinstance(value, list),
                "string": isinstance(value, str),
                "integer": isinstance(value, int) and not isinstance(value, bool),
                "boolean": isinstance(value, bool),
                "null": value is None,
            }.get(name, False)

        if not any(matches_type(name) for name in names):
            raise WorkError(
                f"ledger schema violation at {location}: expected {' or '.join(names)}"
            )

    if isinstance(value, dict):
        required = set(schema.get("required", []))
        missing = sorted(required - set(value))
        if missing:
            raise WorkError(f"ledger schema violation at {location}: missing keys {missing}")
        properties = schema.get("properties", {})
        for key, item in value.items():
            child_location = f"{location}.{key}" if location != "<root>" else key
            if key in properties:
                validate_portable_schema(item, properties[key], root_schema, child_location)
                continue
            additional = schema.get("additionalProperties", True)
            if additional is False:
                raise WorkError(
                    f"ledger schema violation at {location}: unexpected key {key!r}"
                )
            if isinstance(additional, dict):
                validate_portable_schema(item, additional, root_schema, child_location)

    if isinstance(value, list):
        if len(value) < schema.get("minItems", 0):
            raise WorkError(f"ledger schema violation at {location}: too few items")
        if schema.get("uniqueItems"):
            encoded = [json.dumps(item, ensure_ascii=False, sort_keys=True) for item in value]
            if len(encoded) != len(set(encoded)):
                raise WorkError(f"ledger schema violation at {location}: duplicate items")
        item_schema = schema.get("items")
        if item_schema:
            for index, item in enumerate(value):
                validate_portable_schema(
                    item, item_schema, root_schema, f"{location}[{index}]",
                )

    if isinstance(value, str):
        if len(value) < schema.get("minLength", 0):
            raise WorkError(f"ledger schema violation at {location}: value is too short")
        if pattern := schema.get("pattern"):
            if re.search(pattern, value) is None:
                raise WorkError(
                    f"ledger schema violation at {location}: value does not match pattern"
                )
        if schema.get("format") == "date-time":
            try:
                datetime.fromisoformat(value.replace("Z", "+00:00"))
            except ValueError as error:
                raise WorkError(
                    f"ledger schema violation at {location}: invalid date-time"
                ) from error

    if isinstance(value, int) and not isinstance(value, bool):
        if "minimum" in schema and value < schema["minimum"]:
            raise WorkError(f"ledger schema violation at {location}: below minimum")
        if "maximum" in schema and value > schema["maximum"]:
            raise WorkError(f"ledger schema violation at {location}: above maximum")


def validate_ledger(ledger: dict[str, Any]) -> None:
    schema_path = next((path for path in SCHEMA_CANDIDATES if path.is_file()), None)
    if schema_path is None:
        searched = ", ".join(str(path) for path in SCHEMA_CANDIDATES)
        raise WorkError(f"work ledger schema is missing; searched: {searched}")
    schema = load_json(schema_path)
    if jsonschema is not None:
        validator = jsonschema.Draft202012Validator(
            schema, format_checker=jsonschema.FormatChecker(),
        )
        errors = sorted(validator.iter_errors(ledger), key=lambda item: list(item.path))
        if errors:
            first = errors[0]
            location = ".".join(str(item) for item in first.path) or "<root>"
            raise WorkError(f"ledger schema violation at {location}: {first.message}")
    else:
        validate_portable_schema(ledger, schema, schema)
    validate_ids(ledger)


def load_ledger(path: Path) -> dict[str, Any]:
    return migrate_v2(load_json(path))


@contextmanager
def state_lock(path: Path, timeout: float = 8.0) -> Iterator[None]:
    path.parent.mkdir(parents=True, exist_ok=True)
    lock = path.with_suffix(path.suffix + ".lock")
    token = uuid.uuid4().hex
    deadline = time.monotonic() + timeout
    while True:
        try:
            descriptor = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            os.write(descriptor, f"{os.getpid()} {token}".encode("ascii"))
            os.close(descriptor)
            break
        except FileExistsError:
            if time.monotonic() >= deadline:
                raise WorkError(f"timed out waiting for {lock}")
            time.sleep(0.05)
    try:
        yield
    finally:
        try:
            if lock.read_text(encoding="ascii").split()[-1] == token:
                lock.unlink()
        except FileNotFoundError:
            pass


def atomic_write(path: Path, ledger: dict[str, Any]) -> None:
    validate_ledger(ledger)
    path.parent.mkdir(parents=True, exist_ok=True)
    ledger["updated_at"] = now()
    descriptor, temporary = tempfile.mkstemp(prefix=path.name + ".", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8", newline="\n") as handle:
            json.dump(ledger, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def ledger_path(args: argparse.Namespace) -> Path:
    if getattr(args, "ledger", None):
        return Path(args.ledger).resolve()
    work_id = getattr(args, "work_id", "")
    if not WORK_ID_RE.fullmatch(work_id):
        raise WorkError("provide --ledger or a valid --work-id")
    return (Path(args.root).resolve() / ".agent" / "work" / work_id / "ledger.json")


def mutate(args: argparse.Namespace, callback: Any) -> dict[str, Any]:
    path = ledger_path(args)
    with state_lock(path):
        if not path.is_file():
            raise WorkError(f"missing ledger: {path}")
        ledger = load_ledger(path)
        validate_ledger(ledger)
        result = callback(ledger)
        atomic_write(path, ledger)
    return result if isinstance(result, dict) else ledger


def get_slice(ledger: dict[str, Any], slice_id: str) -> dict[str, Any]:
    for item in ledger["slices"]:
        if item["id"] == slice_id:
            return item
    raise WorkError(f"unknown slice: {slice_id}")


def get_acceptance(item: dict[str, Any], acceptance_id: str) -> dict[str, Any]:
    target = next(
        (acceptance for acceptance in item["acceptance"] if acceptance["id"] == acceptance_id),
        None,
    )
    if target is None:
        raise WorkError(f"unknown acceptance criterion: {acceptance_id}")
    return target


def current_slice_receipts(
    ledger: dict[str, Any], item: dict[str, Any],
) -> list[dict[str, Any]]:
    receipt_by_id = {receipt["id"]: receipt for receipt in ledger["receipts"]}
    current = []
    for acceptance in item["acceptance"]:
        if acceptance["status"] != "passed":
            continue
        if not acceptance["receipt_ids"]:
            raise WorkError(f"passed acceptance {acceptance['id']} has no proof receipt")
        receipt_id = acceptance["receipt_ids"][-1]
        receipt = receipt_by_id.get(receipt_id)
        if receipt is None:
            raise WorkError(f"passed acceptance {acceptance['id']} has unknown current receipt {receipt_id}")
        if (
            receipt["slice_id"] != item["id"]
            or receipt["acceptance_id"] != acceptance["id"]
            or receipt["status"] != "PASS"
        ):
            raise WorkError(f"current receipt {receipt_id} is not PASS for acceptance {acceptance['id']}")
        if receipt["contract_hash"] != acceptance_contract_hash(acceptance):
            raise WorkError(f"current receipt {receipt_id} does not match the acceptance contract")
        current.append(receipt)
    return current


def latest_applicable_review(
    ledger: dict[str, Any], item: dict[str, Any], receipts: list[dict[str, Any]],
) -> dict[str, Any] | None:
    current_ids = {receipt["id"] for receipt in receipts}
    applicable = [
        review for review in ledger["reviews"]
        if review["slice_id"] == item["id"]
        and current_ids.issubset(set(review["receipt_ids"]))
    ]
    return applicable[-1] if applicable else None


def validate_proof_contract(
    target: dict[str, Any], claim: str, proof_kind: str, dimensions: list[str],
) -> None:
    if claim != target["claim"]:
        raise WorkError("proof claim must exactly match the acceptance claim")
    if proof_kind not in PROOF_KINDS:
        raise WorkError(f"unsupported proof kind: {proof_kind}")
    allowed = set(target["required_proof_kinds"])
    if proof_kind not in allowed:
        raise WorkError(
            f"proof kind {proof_kind} does not satisfy required kinds {sorted(allowed)}"
        )
    missing_dimensions = set(target["required_dimensions"]) - set(dimensions)
    if missing_dimensions:
        raise WorkError(f"proof misses required dimensions: {sorted(missing_dimensions)}")


def validate_receipt_actor(
    ledger: dict[str, Any], item: dict[str, Any], acceptance_id: str,
    agent: str, model_evidence: dict[str, Any],
) -> None:
    accountable = [
        assignment for assignment in ledger["assignments"]
        if assignment["slice_id"] == item["id"]
        and acceptance_id in assignment["acceptance_ids"]
        and assignment["agent"] == agent
        and assignment["role"] in EXECUTOR_ROLES
        and assignment["status"] != "cancelled"
    ]
    main_exception = (
        agent == "main"
        and bool(model_evidence["main_direct_exception_reason"].strip())
    )
    if not accountable and not main_exception:
        raise WorkError(
            "proof agent is not bound to an eligible executor assignment for this "
            "slice and acceptance criterion"
        )


def attach_receipt(
    ledger: dict[str, Any],
    item: dict[str, Any],
    target: dict[str, Any],
    receipt: dict[str, Any],
) -> dict[str, Any]:
    if any(existing["id"] == receipt["id"] for existing in ledger["receipts"]):
        raise WorkError(f"duplicate receipt id: {receipt['id']}")
    cap = ledger["execution_contract"]["effort_cap"]
    if receipt["effort"] not in EFFORTS or EFFORT_RANK[receipt["effort"]] > EFFORT_RANK[cap]:
        raise WorkError(f"proof effort {receipt['effort']} exceeds work cap {cap}")
    if receipt["contract_hash"] != acceptance_contract_hash(target):
        raise WorkError("proof contract changed; rerun evidence against the current acceptance")
    validate_receipt_actor(
        ledger, item, receipt["acceptance_id"], receipt["agent"],
        receipt["model_evidence"],
    )
    ledger["receipts"].append(receipt)
    target["receipt_ids"].append(receipt["id"])
    target["status"] = {
        "PASS": "passed",
        "FAIL": "failed",
        "BLOCKED": "blocked",
    }[receipt["status"]]
    return {"status": "PROOF_RECORDED", "receipt_id": receipt["id"]}


def command_init(args: argparse.Namespace) -> dict[str, Any]:
    data = payload(args)
    work_id = args.work_id
    if not WORK_ID_RE.fullmatch(work_id):
        raise WorkError("work id must be 3-80 safe characters")
    classification = classify(dict(data.get("signals", {})))
    if classification["ledger"] == "off" and not args.force:
        return {"status": "LEDGER_SKIPPED", "classification": classification}
    path = ledger_path(args)
    if path.exists() and not args.force:
        raise WorkError(f"ledger already exists: {path}")
    timestamp = now()
    slices = data.get("slices") or [{
        "id": "P1", "name": "Implementation", "status": "ready", "depends_on": [],
        "required": True,
        "acceptance": [{
            "id": "AC1",
            "claim": "Requested outcome is verified",
            "status": "open",
            "proof_required": True,
            "proof_profile": "standard",
            "required_proof_kinds": ["integration"],
            "required_dimensions": ["behavior"],
            "receipt_ids": [],
        }],
    }]
    for item in slices:
        item.setdefault("review_required", classification["review_required"])
    raw_agents = data.get("max_active_agents_including_main", 4)
    raw_depth = data.get("max_delegation_depth", 2)
    if isinstance(raw_agents, bool) or not isinstance(raw_agents, int):
        raise WorkError("max active agents must be an integer")
    if isinstance(raw_depth, bool) or not isinstance(raw_depth, int):
        raise WorkError("max delegation depth must be an integer")
    ledger = {
        "schema_version": 3,
        "work_id": work_id,
        "status": "planned",
        "created_at": timestamp,
        "updated_at": timestamp,
        "plan": dict(data.get("__adopt_plan") or {
            "ref": str(data.get("plan_ref") or "native-plan"),
            "sha256": sha256_text(str(data.get("plan_ref") or "native-plan")),
            "identity": "legacy-init-ref",
        }),
        "active_slices": [],
        "classification": classification,
        "execution_contract": {
            "mode": "automatic",
            "max_active_agents_including_main": raw_agents,
            "max_delegation_depth": raw_depth,
            "effort_cap": str(data.get("effort_cap", "high")),
            "authorized_final_actions": list(data.get("authorized_final_actions", ["edit"])),
            "execute_authorization": {
                "authorized": bool(dict(data.get("execute_authorization") or {}).get("authorized", True)),
                "recorded_at": str(dict(data.get("execute_authorization") or {}).get("recorded_at") or timestamp),
                "source": str(dict(data.get("execute_authorization") or {}).get("source") or "legacy-init"),
                "actions": list(dict(data.get("execute_authorization") or {}).get("actions") or data.get("authorized_final_actions", ["edit"])),
            },
        },
        "repository": dict(data.get("repository") or {
            "path": str(Path(args.root).resolve()), "branch": "unknown", "baseline_commit": "unknown",
        }),
        "host_refs": dict(data.get("host_refs") or {"host": "unknown", "task_ref": "", "session_ref": ""}),
        "model_policy_reasons": [],
        "source_history": list(data.get("source_history", [])),
        "slices": slices,
        "assignments": [],
        "receipts": [],
        "reviews": [],
        "findings": [],
        "checkpoints": [],
        "usage": {
            "input_tokens": 0,
            "cached_input_tokens": 0,
            "output_tokens": 0,
            "reasoning_tokens": 0,
            "agent_runs": 0,
            "tool_calls": 0,
            "records": [],
        },
        "next_action": str(data.get("next_action") or "Start the first dependency-ready slice."),
    }
    with (nullcontext() if getattr(args, "_already_locked", False) else state_lock(path)):
        atomic_write(path, ledger)
    return {"status": "LEDGER_CREATED", "path": str(path), "classification": classification}


def repository_baseline(root: Path) -> dict[str, str]:
    try:
        commit = subprocess.run(["git", "rev-parse", "HEAD"], cwd=root, text=True,
            capture_output=True, encoding="utf-8", check=True).stdout.strip()
        branch = subprocess.run(["git", "branch", "--show-current"], cwd=root, text=True,
            capture_output=True, encoding="utf-8", check=True).stdout.strip() or "detached"
    except (OSError, subprocess.CalledProcessError) as exc:
        raise WorkError(f"adopt requires a readable git baseline: {exc}") from exc
    return {"path": str(root), "branch": branch, "baseline_commit": commit}


def command_adopt(args: argparse.Namespace) -> dict[str, Any]:
    data = payload(args)
    plan_path = Path(args.plan_file).resolve()
    if not plan_path.is_file():
        raise WorkError(f"plan file is missing: {plan_path}")
    plan_bytes = plan_path.read_bytes()
    plan_hash = hashlib.sha256(plan_bytes).hexdigest()
    root = Path(args.root).resolve()
    baseline = repository_baseline(root)
    expected = dict(data.get("repository") or {})
    for key in ("branch", "baseline_commit"):
        if expected.get(key) and expected[key] != baseline[key]:
            raise WorkError(f"repository baseline mismatch for {key}: expected {expected[key]!r}, observed {baseline[key]!r}")
    authorization = dict(data.get("execute_authorization") or {})
    if authorization.get("authorized") is not True or not authorization.get("source"):
        raise WorkError("adopt requires an explicit execute_authorization record")
    path = ledger_path(args)
    with state_lock(path):
        if path.is_file():
            ledger = load_ledger(path)
            validate_ledger(ledger)
            if ledger["plan"]["sha256"] != plan_hash:
                raise WorkError("plan identity mismatch; refusing to resume a different plan")
            return {"status": "LEDGER_RESUMED", "path": str(path), "plan": ledger["plan"]}
        data["repository"] = baseline
        data["plan_ref"] = str(plan_path)
        data["__adopt_plan"] = {"ref": str(plan_path), "sha256": plan_hash, "identity": "sha256-file"}
        data.setdefault("host_refs", {"host": "unknown", "task_ref": "", "session_ref": ""})
        args.payload_file = None
        args.payload_json = canonical_json(data)
        args._already_locked = True
        args.force = True
        created = command_init(args)
        created["plan"] = data["__adopt_plan"]
        return created


def command_add_source(args: argparse.Namespace) -> dict[str, Any]:
    item = payload(args)
    required = {"id", "kind", "summary"}
    if required - set(item):
        raise WorkError(f"source missing keys: {sorted(required - set(item))}")
    item.setdefault("captured_at", now())
    item.setdefault("redacted", False)
    if not item.get("slice_ids"):
        raise WorkError("source must map to at least one slice via slice_ids")

    def apply(ledger: dict[str, Any]) -> dict[str, Any]:
        ledger["source_history"].append(item)
        return {"status": "SOURCE_ADDED", "source_id": item["id"]}
    return mutate(args, apply)


def command_assign(args: argparse.Namespace) -> dict[str, Any]:
    item = payload(args)
    required = {
        "id", "slice_id", "agent", "role", "model_class", "model", "effort",
        "source_ids", "write_paths", "context_paths", "forbidden_paths", "acceptance_ids",
    }
    if required - set(item):
        raise WorkError(f"assignment missing keys: {sorted(required - set(item))}")
    if item["effort"] not in EFFORTS:
        raise WorkError("assignment effort exceeds supported cap")
    item["model_evidence"] = normalize_model_evidence(dict(item.get("model_evidence") or item))
    item.setdefault("status", "ready")

    def apply(ledger: dict[str, Any]) -> dict[str, Any]:
        target_slice = get_slice(ledger, item["slice_id"])
        cap = ledger["execution_contract"]["effort_cap"]
        if EFFORT_RANK[item["effort"]] > EFFORT_RANK[cap]:
            raise WorkError(f"assignment effort {item['effort']} exceeds work cap {cap}")
        target_acceptance = {acceptance["id"] for acceptance in target_slice["acceptance"]}
        unknown_acceptance = set(item["acceptance_ids"]) - target_acceptance
        if unknown_acceptance:
            raise WorkError(
                f"assignment acceptance does not belong to slice: {sorted(unknown_acceptance)}"
            )
        source_by_id = {source["id"]: source for source in ledger["source_history"]}
        missing_sources = set(item["source_ids"]) - set(source_by_id)
        if missing_sources:
            raise WorkError(f"assignment has unknown source ids: {sorted(missing_sources)}")
        wrong_scope = [
            source_id for source_id in item["source_ids"]
            if item["slice_id"] not in source_by_id[source_id]["slice_ids"]
            and "*" not in source_by_id[source_id]["slice_ids"]
        ]
        if wrong_scope:
            raise WorkError(f"assignment sources are not mapped to slice: {wrong_scope}")
        for existing in ledger["assignments"]:
            if existing["status"] in {"done", "cancelled"}:
                continue
            for left in existing["write_paths"]:
                for right in item["write_paths"]:
                    if paths_overlap(left, right):
                        raise WorkError(
                            f"write ownership collision: {existing['id']}:{left} vs {item['id']}:{right}"
                        )
        ledger["assignments"].append(item)
        ledger["usage"]["agent_runs"] += 1
        return {"status": "ASSIGNED", "assignment_id": item["id"]}
    return mutate(args, apply)


def command_complete_assignment(args: argparse.Namespace) -> dict[str, Any]:
    data = payload(args)
    target_status = str(data.get("status", "")).strip()
    if target_status not in {"done", "blocked"}:
        raise WorkError("assignment completion status must be done or blocked")
    observed_model = data.get("observed_model")
    observed_effort = data.get("observed_effort")
    fallback_reason = str(data.get("fallback_reason", "")).strip()
    attestation_ref = str(data.get("host_attestation_ref", "")).strip()
    has_observation = observed_model is not None or observed_effort is not None
    if has_observation:
        if not observed_model or observed_effort not in EFFORTS:
            raise WorkError("observed completion requires both observed_model and observed_effort")
        if fallback_reason:
            raise WorkError("completion cannot record observation and fallback simultaneously")
        if not attestation_ref:
            raise WorkError("observed completion requires host_attestation_ref")
    elif not fallback_reason:
        raise WorkError("completion requires observed model/effort or explicit fallback_reason")

    def apply(ledger: dict[str, Any]) -> dict[str, Any]:
        assignment = next(
            (item for item in ledger["assignments"] if item["id"] == args.assignment), None,
        )
        if assignment is None:
            raise WorkError(f"unknown assignment: {args.assignment}")
        if assignment["role"] not in EXECUTOR_ROLES:
            raise WorkError("only executor assignments can be completed with host attestation")
        if assignment["status"] == "cancelled":
            raise WorkError("cancelled assignment cannot be completed")
        if assignment["status"] == "done" and target_status == "blocked":
            raise WorkError("done assignment cannot transition to blocked")
        if (
            assignment["status"] == "done"
            and assignment["model_evidence"]["status"] == "observed"
        ):
            raise WorkError("observed done assignment is already complete")
        evidence = dict(assignment["model_evidence"])
        if has_observation:
            evidence.update({
                "observed_model": str(observed_model),
                "observed_effort": str(observed_effort),
                "status": "observed",
                "fallback_reason": "",
            })
        else:
            evidence.update({
                "observed_model": None,
                "observed_effort": None,
                "status": "fallback",
                "fallback_reason": fallback_reason,
            })
        assignment["model_evidence"] = normalize_model_evidence(evidence)
        assignment["status"] = target_status
        assignment["completed_at"] = now()
        if attestation_ref:
            assignment["host_attestation_ref"] = attestation_ref
        else:
            assignment.pop("host_attestation_ref", None)
        return {
            "status": "ASSIGNMENT_COMPLETED" if target_status == "done" else "ASSIGNMENT_BLOCKED",
            "assignment_id": assignment["id"],
            "assignment_status": target_status,
            "model_evidence_status": assignment["model_evidence"]["status"],
        }
    return mutate(args, apply)


def command_start(args: argparse.Namespace) -> dict[str, Any]:
    def apply(ledger: dict[str, Any]) -> dict[str, Any]:
        item = get_slice(ledger, args.slice)
        dependencies = {entry["id"]: entry["status"] for entry in ledger["slices"]}
        open_dependencies = [value for value in item["depends_on"] if dependencies.get(value) != "passed"]
        if open_dependencies:
            raise WorkError(f"slice dependencies are not passed: {open_dependencies}")
        if item["status"] not in {"planned", "ready", "blocked"}:
            raise WorkError(f"cannot start slice from {item['status']}")
        new_agents = {
            assignment["agent"] for assignment in ledger["assignments"]
            if assignment["slice_id"] == item["id"]
            and assignment["status"] not in {"done", "cancelled", "blocked"}
        }
        active_agents = {
            assignment["agent"] for assignment in ledger["assignments"]
            if assignment["slice_id"] in ledger["active_slices"]
            and assignment["status"] not in {"done", "cancelled", "blocked"}
        }
        if len(active_agents | new_agents) > ledger["execution_contract"]["max_active_agents_including_main"]:
            raise WorkError("starting slice would exceed max active agent cap")
        item["status"] = "running"
        ledger["status"] = "running"
        if item["id"] not in ledger["active_slices"]:
            ledger["active_slices"].append(item["id"])
        ledger["next_action"] = f"Execute and verify {item['id']}."
        for assignment in ledger["assignments"]:
            if assignment["slice_id"] == item["id"] and assignment["status"] == "ready":
                assignment["status"] = "running"
        return {"status": "SLICE_STARTED", "slice_id": item["id"]}
    return mutate(args, apply)


def command_record_proof(args: argparse.Namespace) -> dict[str, Any]:
    evidence = payload(args)
    required = {
        "id", "acceptance_id", "claim", "status", "proof_kind", "dimensions",
        "expected", "observed", "environment", "artifact_paths", "verifier",
        "agent", "model", "effort",
    }
    if required - set(evidence):
        raise WorkError(f"external proof missing keys: {sorted(required - set(evidence))}")
    if evidence["status"] not in {"PASS", "FAIL", "BLOCKED"}:
        raise WorkError("external proof status must be PASS, FAIL or BLOCKED")
    if evidence["verifier"] not in EXTERNAL_VERIFIERS:
        raise WorkError(
            f"external proof verifier must be one of {sorted(EXTERNAL_VERIFIERS)}"
        )
    if evidence["status"] == "PASS" and not evidence["artifact_paths"]:
        raise WorkError("external PASS requires at least one fresh artifact")
    model_evidence = normalize_model_evidence(dict(evidence.get("model_evidence") or evidence))
    def apply(ledger: dict[str, Any]) -> dict[str, Any]:
        item = get_slice(ledger, args.slice)
        target = get_acceptance(item, evidence["acceptance_id"])
        validate_proof_contract(
            target, str(evidence["claim"]), str(evidence["proof_kind"]),
            list(evidence["dimensions"]),
        )
        not_before = datetime.fromisoformat(ledger["created_at"])
        repository = Path(ledger["repository"]["path"]).resolve()
        artifacts = artifact_evidence(
            repository, list(evidence["artifact_paths"]), not_before=not_before,
        )
        receipt = {
            "id": evidence["id"],
            "slice_id": args.slice,
            "acceptance_id": evidence["acceptance_id"],
            "claim": evidence["claim"],
            "claim_hash": sha256_text(target["claim"]),
            "contract_hash": acceptance_contract_hash(target),
            "status": evidence["status"],
            "provenance": "external-verifier",
            "proof_kind": evidence["proof_kind"],
            "dimensions": evidence["dimensions"],
            "command": "",
            "command_hash": "",
            "expected": evidence["expected"],
            "observed": evidence["observed"],
            "output_hash": sha256_text(str(evidence["observed"])),
            "exit_code": None,
            "expected_exit_code": None,
            "environment": evidence["environment"],
            "artifact_evidence": artifacts,
            "verifier": evidence["verifier"],
            "agent": evidence["agent"],
            "model": evidence["model"],
            "effort": evidence["effort"],
            "model_evidence": model_evidence,
            "captured_at": now(),
        }
        return attach_receipt(ledger, item, target, receipt)
    return mutate(args, apply)


def command_verify(args: argparse.Namespace) -> dict[str, Any]:
    request = payload(args)
    required = {
        "id", "acceptance_id", "proof_kind", "dimensions", "command",
        "expected_exit_code", "environment", "artifact_paths", "agent", "model", "effort",
    }
    if required - set(request):
        raise WorkError(f"verification request missing keys: {sorted(required - set(request))}")
    command = str(request["command"]).strip()
    if not command:
        raise WorkError("verification command is required")
    expected_exit = request["expected_exit_code"]
    if isinstance(expected_exit, bool) or not isinstance(expected_exit, int):
        raise WorkError("expected_exit_code must be an integer")
    timeout_seconds = int(request.get("timeout_seconds", 300))
    if not 1 <= timeout_seconds <= 3600:
        raise WorkError("timeout_seconds must be between 1 and 3600")
    model_evidence = normalize_model_evidence(dict(request.get("model_evidence") or request))

    path = ledger_path(args)
    ledger = load_ledger(path)
    validate_ledger(ledger)
    item = get_slice(ledger, args.slice)
    target = get_acceptance(item, request["acceptance_id"])
    validate_proof_contract(
        target, target["claim"], str(request["proof_kind"]), list(request["dimensions"]),
    )
    validate_receipt_actor(
        ledger, item, request["acceptance_id"], request["agent"], model_evidence,
    )
    repository = Path(ledger["repository"]["path"]).resolve()
    try:
        completed = subprocess.run(
            command,
            cwd=repository,
            shell=True,
            text=True,
            capture_output=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout_seconds,
        )
        output = (completed.stdout + completed.stderr)[-12000:]
        exit_code: int | None = completed.returncode
        status = "PASS" if completed.returncode == expected_exit else "FAIL"
    except subprocess.TimeoutExpired as exc:
        raw_stdout = exc.stdout.decode("utf-8", "replace") if isinstance(exc.stdout, bytes) else (exc.stdout or "")
        raw_stderr = exc.stderr.decode("utf-8", "replace") if isinstance(exc.stderr, bytes) else (exc.stderr or "")
        output = (raw_stdout + raw_stderr + f"\nTIMEOUT after {timeout_seconds}s")[-12000:]
        exit_code = None
        status = "FAIL"
    artifacts = artifact_evidence(repository, list(request["artifact_paths"]))
    receipt = {
        "id": request["id"],
        "slice_id": args.slice,
        "acceptance_id": request["acceptance_id"],
        "claim": target["claim"],
        "claim_hash": sha256_text(target["claim"]),
        "contract_hash": acceptance_contract_hash(target),
        "status": status,
        "provenance": "runner",
        "proof_kind": request["proof_kind"],
        "dimensions": request["dimensions"],
        "command": command,
        "command_hash": sha256_text(command),
        "expected": f"exit={expected_exit}",
        "observed": f"exit={exit_code}; output_sha256={sha256_text(output)}",
        "output_hash": sha256_text(output),
        "exit_code": exit_code,
        "expected_exit_code": expected_exit,
        "environment": request["environment"],
        "artifact_evidence": artifacts,
        "verifier": "workctl-runner",
        "agent": request["agent"],
        "model": request["model"],
        "effort": request["effort"],
        "model_evidence": model_evidence,
        "captured_at": now(),
    }

    def apply(current: dict[str, Any]) -> dict[str, Any]:
        current_item = get_slice(current, args.slice)
        current_target = get_acceptance(current_item, request["acceptance_id"])
        if acceptance_contract_hash(current_target) != receipt["contract_hash"]:
            raise WorkError("acceptance proof contract changed while verification ran; rerun proof")
        return attach_receipt(current, current_item, current_target, receipt)

    result = mutate(args, apply)
    result.update({"proof_status": status, "exit_code": exit_code, "output_tail": output[-2000:]})
    return result


def command_record_finding(args: argparse.Namespace) -> dict[str, Any]:
    finding = payload(args)
    required = {"id", "severity", "summary", "reviewer"}
    if required - set(finding):
        raise WorkError(f"finding missing keys: {sorted(required - set(finding))}")
    finding.update({"slice_id": args.slice, "status": "open", "created_at": now()})

    def apply(ledger: dict[str, Any]) -> dict[str, Any]:
        get_slice(ledger, args.slice)["status"] = "review"
        ledger["findings"].append(finding)
        return {"status": "FINDING_RECORDED", "finding_id": finding["id"]}
    return mutate(args, apply)


def command_record_review(args: argparse.Namespace) -> dict[str, Any]:
    review = payload(args)
    required = {
        "id", "reviewer", "status", "scope", "observed", "receipt_ids",
        "model", "effort",
    }
    if required - set(review):
        raise WorkError(f"review receipt missing keys: {sorted(required - set(review))}")
    if review["status"] not in {"PASS", "FAIL"}:
        raise WorkError("review status must be PASS or FAIL")
    if not review["receipt_ids"]:
        raise WorkError("review must bind to at least one proof receipt")
    review["model_evidence"] = normalize_model_evidence(dict(review.get("model_evidence") or review))

    def apply(ledger: dict[str, Any]) -> dict[str, Any]:
        item = get_slice(ledger, args.slice)
        assignments = [
            assignment for assignment in ledger["assignments"]
            if assignment["slice_id"] == args.slice and assignment["status"] != "cancelled"
        ]
        executor_agents = {
            assignment["agent"] for assignment in assignments
            if assignment["role"] != "reviewer"
        }
        reviewer_assignments = [
            assignment for assignment in assignments
            if assignment["role"] == "reviewer"
            and assignment["agent"] == review["reviewer"]
        ]
        if not reviewer_assignments:
            raise WorkError("reviewer must have an explicit reviewer assignment for this slice")
        if review["reviewer"] in executor_agents:
            raise WorkError("reviewer must be independent from all slice executors")
        receipt_by_id = {
            receipt["id"]: receipt for receipt in ledger["receipts"]
            if receipt["slice_id"] == args.slice
        }
        missing = set(review["receipt_ids"]) - set(receipt_by_id)
        if missing:
            raise WorkError(f"review references unknown slice receipts: {sorted(missing)}")
        failed = [
            receipt_id for receipt_id in review["receipt_ids"]
            if receipt_by_id[receipt_id]["status"] != "PASS"
        ]
        if failed and review["status"] == "PASS":
            raise WorkError(f"PASS review references non-passing proof: {failed}")
        cap = ledger["execution_contract"]["effort_cap"]
        if review["effort"] not in EFFORTS or EFFORT_RANK[review["effort"]] > EFFORT_RANK[cap]:
            raise WorkError(f"review effort {review['effort']} exceeds work cap {cap}")
        record = {
            **review,
            "slice_id": args.slice,
            "receipt_hashes": {
                receipt_id: sha256_text(json.dumps(receipt_by_id[receipt_id], sort_keys=True))
                for receipt_id in review["receipt_ids"]
            },
            "created_at": now(),
        }
        ledger["reviews"].append(record)
        item["status"] = "review" if review["status"] == "FAIL" else item["status"]
        return {"status": "REVIEW_RECORDED", "review_id": review["id"]}
    return mutate(args, apply)


def command_resolve_review(args: argparse.Namespace) -> dict[str, Any]:
    data = payload(args)
    resolution = str(data.get("resolution", "")).strip()
    if not resolution:
        raise WorkError("review resolution is required")

    def apply(ledger: dict[str, Any]) -> dict[str, Any]:
        finding = next((item for item in ledger["findings"] if item["id"] == args.finding), None)
        if finding is None:
            raise WorkError(f"unknown finding: {args.finding}")
        finding.update({"status": "resolved", "resolution": resolution, "resolved_at": now()})
        return {"status": "FINDING_RESOLVED", "finding_id": args.finding}
    return mutate(args, apply)


def command_checkpoint(args: argparse.Namespace) -> dict[str, Any]:
    item = payload(args)
    required = {"id", "commit", "summary", "next_action"}
    if required - set(item):
        raise WorkError(f"checkpoint missing keys: {sorted(required - set(item))}")
    item.update({"slice_id": args.slice, "created_at": now()})

    def apply(ledger: dict[str, Any]) -> dict[str, Any]:
        get_slice(ledger, args.slice)
        ledger["checkpoints"].append(item)
        ledger["next_action"] = item["next_action"]
        return {"status": "CHECKPOINT_RECORDED", "checkpoint_id": item["id"]}
    return mutate(args, apply)


def command_close(args: argparse.Namespace) -> dict[str, Any]:
    def apply(ledger: dict[str, Any]) -> dict[str, Any]:
        item = get_slice(ledger, args.slice)
        slice_assignments = [
            assignment for assignment in ledger["assignments"]
            if assignment["slice_id"] == args.slice and assignment["status"] != "cancelled"
        ]
        if not slice_assignments:
            raise WorkError("slice has no accountable assignment")
        relevant_sources = {
            source["id"] for source in ledger["source_history"]
            if args.slice in source["slice_ids"] or "*" in source["slice_ids"]
        }
        covered_sources = {
            source_id for assignment in slice_assignments for source_id in assignment["source_ids"]
        }
        if relevant_sources - covered_sources:
            raise WorkError(
                f"slice assignments do not cover source/injection ids: "
                f"{sorted(relevant_sources - covered_sources)}"
            )
        assigned_acceptance = {
            acceptance_id
            for assignment in slice_assignments
            for acceptance_id in assignment["acceptance_ids"]
        }
        expected_acceptance = {acceptance["id"] for acceptance in item["acceptance"]}
        if expected_acceptance - assigned_acceptance:
            raise WorkError(
                f"slice assignments do not own acceptance ids: "
                f"{sorted(expected_acceptance - assigned_acceptance)}"
            )
        open_acceptance = [ac["id"] for ac in item["acceptance"] if ac["status"] != "passed"]
        if open_acceptance:
            raise WorkError(f"slice has open acceptance criteria: {open_acceptance}")
        if item["review_required"]:
            current_receipts = current_slice_receipts(ledger, item)
            latest_review = latest_applicable_review(ledger, item, current_receipts)
            if latest_review is None:
                raise WorkError("risk-triggered slice requires an independent PASS review")
            if latest_review["status"] != "PASS":
                raise WorkError("latest applicable independent review is FAIL")
            receipt_by_id = {receipt["id"]: receipt for receipt in ledger["receipts"]}
            changed = [
                receipt["id"] for receipt in current_receipts
                if latest_review["receipt_hashes"].get(receipt["id"])
                != sha256_text(json.dumps(receipt_by_id[receipt["id"]], sort_keys=True))
            ]
            if changed:
                raise WorkError(f"proof changed after independent review: {changed}")
        open_findings = [
            finding["id"] for finding in ledger["findings"]
            if finding["slice_id"] == args.slice and finding["status"] == "open"
        ]
        if open_findings:
            raise WorkError(f"slice has open review findings: {open_findings}")
        item["status"] = "passed"
        for assignment in ledger["assignments"]:
            if assignment["slice_id"] == args.slice and assignment["status"] == "running":
                assignment["status"] = "done"
        ledger["active_slices"] = [
            slice_id for slice_id in ledger["active_slices"] if slice_id != args.slice
        ]
        ledger["next_action"] = "Start the next dependency-ready slice."
        return {"status": "SLICE_PASSED", "slice_id": args.slice}
    return mutate(args, apply)


def command_block(args: argparse.Namespace) -> dict[str, Any]:
    reason = args.reason.strip()
    if not reason:
        raise WorkError("block reason is required")

    def apply(ledger: dict[str, Any]) -> dict[str, Any]:
        item = get_slice(ledger, args.slice)
        item["status"] = "blocked"
        ledger["active_slices"] = [
            slice_id for slice_id in ledger["active_slices"] if slice_id != args.slice
        ]
        states = {entry["id"]: entry["status"] for entry in ledger["slices"]}
        continuable = []
        for entry in ledger["slices"]:
            if entry["id"] == args.slice:
                continue
            dependencies_pass = all(states.get(dep) == "passed" for dep in entry["depends_on"])
            if entry["status"] in {"running", "review"} or (
                entry["status"] == "ready" and dependencies_pass
            ):
                continuable.append(entry["id"])
        ledger["status"] = "running" if continuable else "blocked"
        ledger["next_action"] = (
            f"Continue independent slices: {', '.join(continuable)}."
            if continuable else reason
        )
        return {
            "status": "SLICE_BLOCKED",
            "continue_independent": bool(continuable),
            "continuable_slices": continuable,
            "reason": reason,
        }
    return mutate(args, apply)


def command_rollback(args: argparse.Namespace) -> dict[str, Any]:
    reason = args.reason.strip()
    if not reason:
        raise WorkError("rollback reason is required")

    def apply(ledger: dict[str, Any]) -> dict[str, Any]:
        item = get_slice(ledger, args.slice)
        item["status"] = "rolled-back"
        ledger["status"] = "needs-replan"
        ledger["active_slices"] = [
            slice_id for slice_id in ledger["active_slices"] if slice_id != args.slice
        ]
        ledger["next_action"] = f"Re-plan {args.slice}: {reason}"
        return {"status": "SLICE_ROLLED_BACK", "slice_id": args.slice, "reason": reason}
    return mutate(args, apply)


def command_usage(args: argparse.Namespace) -> dict[str, Any]:
    data = payload(args)
    counters = {
        "input_tokens", "cached_input_tokens", "output_tokens", "reasoning_tokens",
        "agent_runs", "tool_calls",
    }
    required = {"actor", "assignment_id"} | counters
    if required - set(data):
        raise WorkError(f"usage record missing keys: {sorted(required - set(data))}")

    def apply(ledger: dict[str, Any]) -> dict[str, Any]:
        assignment_id = data["assignment_id"]
        known_assignments = {item["id"] for item in ledger["assignments"]}
        if assignment_id is not None and assignment_id not in known_assignments:
            raise WorkError(f"unknown usage assignment: {assignment_id}")
        if assignment_id is None and data["actor"] != "main":
            raise WorkError("usage without assignment_id is reserved for main")
        record = {"captured_at": now(), "actor": str(data["actor"]), "assignment_id": assignment_id}
        for key in counters:
            value = data[key]
            if isinstance(value, bool) or not isinstance(value, int) or value < 0:
                raise WorkError(f"invalid usage value: {key}")
            ledger["usage"][key] += value
            record[key] = value
        ledger["usage"]["records"].append(record)
        return {"status": "USAGE_RECORDED", "usage": ledger["usage"]}
    return mutate(args, apply)


def command_finalize(args: argparse.Namespace) -> dict[str, Any]:
    def apply(ledger: dict[str, Any]) -> dict[str, Any]:
        incomplete = [
            item["id"] for item in ledger["slices"]
            if item["required"] and item["status"] != "passed"
        ]
        open_findings = [item["id"] for item in ledger["findings"] if item["status"] == "open"]
        if incomplete or open_findings:
            raise WorkError(f"cannot finalize; slices={incomplete}; findings={open_findings}")
        current_receipts = []
        current_reviews = []
        reasons = []
        for slice_item in ledger["slices"]:
            if not slice_item["required"]:
                continue
            slice_receipts = current_slice_receipts(ledger, slice_item)
            current_receipts.extend(slice_receipts)
            if slice_item["review_required"]:
                latest_review = latest_applicable_review(ledger, slice_item, slice_receipts)
                if latest_review is None or latest_review["status"] != "PASS":
                    raise WorkError(
                        f"slice {slice_item['id']} lacks a current applicable PASS review"
                    )
                changed = [
                    receipt["id"] for receipt in slice_receipts
                    if latest_review["receipt_hashes"].get(receipt["id"])
                    != sha256_text(json.dumps(receipt, sort_keys=True))
                ]
                if changed:
                    raise WorkError(f"proof changed after independent review: {changed}")
                current_reviews.append(latest_review)
            executors = [
                assignment for assignment in ledger["assignments"]
                if assignment["slice_id"] == slice_item["id"]
                and assignment["role"] in EXECUTOR_ROLES
                and assignment["status"] != "cancelled"
            ]
            if not executors:
                reasons.append(f"slice {slice_item['id']} has no accountable executor assignment")
            for assignment in executors:
                evidence = assignment["model_evidence"]
                if evidence["status"] != "observed":
                    reasons.append(
                        f"assignment {assignment['id']} has {evidence['status']} model evidence"
                    )
        for kind, records in (("proof", current_receipts), ("review", current_reviews)):
            for record in records:
                evidence = record["model_evidence"]
                if evidence["status"] != "observed":
                    reasons.append(
                        f"{kind} {record['id']} has {evidence['status']} model evidence"
                    )
        ledger["model_policy_reasons"] = reasons
        if reasons:
            ledger["status"] = "partial"
            ledger["active_slices"] = []
            ledger["next_action"] = "Obtain host-observed model and effort evidence before claiming PASS."
            return {
                "status": "WORK_PARTIAL",
                "work_id": ledger["work_id"],
                "model_policy_reasons": reasons,
                "usage": ledger["usage"],
            }
        ledger["status"] = "passed"
        ledger["active_slices"] = []
        ledger["next_action"] = ""
        return {"status": "WORK_PASS", "work_id": ledger["work_id"], "usage": ledger["usage"]}
    return mutate(args, apply)


def command_status(args: argparse.Namespace) -> dict[str, Any]:
    path = ledger_path(args)
    ledger = load_ledger(path)
    validate_ledger(ledger)
    return {
        "work_id": ledger["work_id"],
        "status": ledger["status"],
        "classification": ledger["classification"],
        "active_slices": ledger["active_slices"],
        "slices": [{"id": item["id"], "status": item["status"]} for item in ledger["slices"]],
        "open_findings": [item["id"] for item in ledger["findings"] if item["status"] == "open"],
        "next_action": ledger["next_action"],
        "usage": ledger["usage"],
    }


def command_resume(args: argparse.Namespace) -> dict[str, Any]:
    path = ledger_path(args)
    ledger = load_ledger(path)
    validate_ledger(ledger)
    source_by_id = {item["id"]: item for item in ledger["source_history"]}
    active = list(ledger["active_slices"])
    if not active:
        states = {entry["id"]: entry["status"] for entry in ledger["slices"]}
        active = [
            item["id"] for item in ledger["slices"]
            if item["status"] in {"ready", "running", "review"}
            and all(states.get(dep) == "passed" for dep in item["depends_on"])
        ]
    packets = []
    for slice_id in active:
        assignments = [
            item for item in ledger["assignments"]
            if item["slice_id"] == slice_id and item["status"] not in {"done", "cancelled"}
        ]
        source_ids = sorted({source for item in assignments for source in item["source_ids"]})
        slice_checkpoints = [
            item for item in ledger["checkpoints"] if item["slice_id"] == slice_id
        ]
        packets.append({
            "slice_id": slice_id,
            "assignments": assignments,
            "source_context": [source_by_id[item] for item in source_ids if item in source_by_id],
            "open_findings": [
                item for item in ledger["findings"]
                if item["status"] == "open" and item["slice_id"] == slice_id
            ],
            "latest_checkpoint": slice_checkpoints[-1] if slice_checkpoints else None,
        })
    return {
        "work_id": ledger["work_id"],
        "status": ledger["status"],
        "next_action": ledger["next_action"],
        "active_slices": active,
        "packets": packets,
        "latest_checkpoint": ledger["checkpoints"][-1] if ledger["checkpoints"] else None,
    }


def add_payload_options(parser: argparse.ArgumentParser) -> None:
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--payload-file")
    group.add_argument("--payload-json", default="")


def add_target_options(parser: argparse.ArgumentParser, work_id: bool = True) -> None:
    parser.add_argument("--ledger")
    if work_id:
        parser.add_argument("--work-id", default="")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", default=str(ROOT))
    commands = parser.add_subparsers(dest="command", required=True)

    classify_parser = commands.add_parser("classify")
    add_payload_options(classify_parser)

    init_parser = commands.add_parser("init")
    init_parser.add_argument("--work-id", required=True)
    init_parser.add_argument("--force", action="store_true")
    add_payload_options(init_parser)

    adopt_parser = commands.add_parser("adopt", help="atomically bind a plan and git baseline to a ledger")
    adopt_parser.add_argument("--work-id", required=True)
    adopt_parser.add_argument("--plan-file", required=True)
    add_payload_options(adopt_parser)

    for name in ("add-source", "assign", "usage"):
        item = commands.add_parser(name)
        add_target_options(item)
        add_payload_options(item)

    complete_assignment = commands.add_parser(
        "complete-assignment",
        help="attest one executor assignment after execution without changing its scope",
    )
    add_target_options(complete_assignment)
    complete_assignment.add_argument("--assignment", required=True)
    add_payload_options(complete_assignment)

    for name in (
        "start", "close", "checkpoint", "record-proof", "verify",
        "record-review", "record-finding", "block", "rollback",
    ):
        item = commands.add_parser(name)
        add_target_options(item)
        item.add_argument("--slice", required=True)
        if name in {
            "checkpoint", "record-proof", "verify", "record-review", "record-finding",
        }:
            add_payload_options(item)
        if name in {"block", "rollback"}:
            item.add_argument("--reason", required=True)

    resolve = commands.add_parser("resolve-review")
    add_target_options(resolve)
    resolve.add_argument("--finding", required=True)
    add_payload_options(resolve)

    for name in ("status", "resume", "finalize"):
        item = commands.add_parser(name)
        add_target_options(item)
    return parser


def main() -> int:
    args = build_parser().parse_args()
    handlers = {
        "classify": lambda value: classify(payload(value)),
        "init": command_init,
        "adopt": command_adopt,
        "add-source": command_add_source,
        "assign": command_assign,
        "complete-assignment": command_complete_assignment,
        "start": command_start,
        "record-proof": command_record_proof,
        "verify": command_verify,
        "record-review": command_record_review,
        "record-finding": command_record_finding,
        "resolve-review": command_resolve_review,
        "checkpoint": command_checkpoint,
        "close": command_close,
        "block": command_block,
        "rollback": command_rollback,
        "usage": command_usage,
        "status": command_status,
        "resume": command_resume,
        "finalize": command_finalize,
    }
    try:
        emit(handlers[args.command](args))
        return 0
    except (WorkError, OSError, json.JSONDecodeError, ValueError) as exc:
        emit({"status": "ERROR", "error": str(exc)})
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
