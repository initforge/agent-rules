#!/usr/bin/env python3
"""Audit canonical consumer cutover without deleting compatibility surfaces.

The audit is intentionally conservative.  It reports production imports that
still resolve to known legacy implementations, while allowing explicit
compatibility facades and retaining their parity evidence for review.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


SCHEMA = "harness/consumer-cutover-audit/v1"
IMPORT_RE = re.compile(r"(?:from|import\s*\(|export\s+\*\s+from)\s*[\"']([^\"']+)[\"']")

# These are implementations with a separate historical contract.  The state
# modules and north-star evidence ledger are the current provider-neutral
# owners; compatibility entrypoints are not silently promoted to canonical.
LEGACY_IMPLEMENTATIONS = {
    "packages/kernel/src/ledger.ts": {
        "id": "LEGACY-WORK-LEDGER",
        "reason": "filesystem WorkLedger compatibility implementation",
        "parity": ["packages/engine/test/ledger.test.ts", "packages/engine/test/contracts.test.ts"],
    },
}

COMPATIBILITY_FACADES = {
    "packages/engine/src/ledger.ts",
    "packages/engine/src/checkpoint-resume.ts",
    "packages/engine/src/live-amendment.ts",
    "packages/engine/src/northstar/evidence-ledger.ts",
    "packages/engine/src/plan-lifecycle.ts",
    "packages/engine/src/terminal-gate.ts",
    "packages/kernel/src/live-amendment.ts",
    "packages/kernel/src/checkpoint-resume.ts",
}

# A package root export is an intentional public compatibility boundary, not a
# production consumer.  It remains visible in the report through the owner
# inventory and cannot be mistaken for a cutover proof.
ALLOWED_LEGACY_BOUNDARIES = {
    "packages/kernel/src/index.ts",
}

CANONICAL_OWNERS = {
    "contracts": "packages/kernel/src/contracts.ts",
    "portable-checkpoint": "packages/kernel/src/state/checkpoint-resume.ts",
    "live-amendment": "packages/kernel/src/state/live-amendment.ts",
    "north-star-evidence": "packages/kernel/src/northstar/evidence-ledger.ts",
    "evidence-dag": "packages/kernel/src/evidence-dag.ts",
    "terminal-gate": "packages/kernel/src/terminal-gate.ts",
    "plan-identity": "packages/kernel/src/plan-identity.ts",
    "plan-lifecycle": "packages/kernel/src/plan-lifecycle.ts",
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def rel(root: Path, path: Path) -> str:
    return path.relative_to(root).as_posix()


def source_files(root: Path) -> list[Path]:
    files: list[Path] = []
    for base in (root / "packages", root / "automation"):
        if not base.is_dir():
            continue
        for path in base.rglob("*"):
            if not path.is_file() or path.suffix not in {".ts", ".mjs", ".js"}:
                continue
            if any(part in {"dist", "node_modules", "generated"} for part in path.parts):
                continue
            if "/test/" in path.as_posix() or path.name.endswith(".test.ts") or path.name.endswith(".test.mjs"):
                continue
            files.append(path)
    return sorted(files)


def resolve_relative(root: Path, importer: Path, module: str) -> str | None:
    if not module.startswith("."):
        return None
    candidate = (importer.parent / module).resolve()
    candidates = [candidate]
    if candidate.suffix in {".js", ".mjs"}:
        candidates.append(candidate.with_suffix(".ts"))
    elif not candidate.suffix:
        candidates.extend((candidate.with_suffix(ext) for ext in (".ts", ".mjs", ".js")))
    for item in candidates:
        try:
            if item.is_file() and item.is_relative_to(root):
                return rel(root, item)
        except AttributeError:
            try:
                item.relative_to(root)
            except ValueError:
                continue
            if item.is_file():
                return rel(root, item)
    return None


def package_module_target(module: str) -> str | None:
    prefix = "@initforge/agent-rules-kernel/"
    if module.startswith(prefix):
        tail = module[len(prefix):]
        if tail.endswith(".js"):
            tail = tail[:-3]
        return f"packages/kernel/src/{tail}.ts"
    return None


def facade_receipt(root: Path, path: str) -> dict[str, Any]:
    file = root / path
    text = file.read_text(encoding="utf-8") if file.is_file() else ""
    explicit = "Compatibility facade delegating to canonical kernel" in text or "Compatibility facade delegating to the canonical kernel" in text
    export_lines = [line.strip() for line in text.splitlines() if line.strip().startswith("export ")]
    return {
        "path": path,
        "exists": file.is_file(),
        "sha256": sha256(file) if file.is_file() else None,
        "explicitCompatibilityMarker": explicit,
        "exportLineCount": len(export_lines),
        "status": "COMPATIBILITY_FACADE" if explicit else "REVIEW_REQUIRED",
    }


def audit(root: Path) -> dict[str, Any]:
    root = root.resolve()
    consumers: list[dict[str, str]] = []
    for file in source_files(root):
        path = rel(root, file)
        for match in IMPORT_RE.finditer(file.read_text(encoding="utf-8")):
            module = match.group(1)
            target = resolve_relative(root, file, module) or package_module_target(module)
            if target not in LEGACY_IMPLEMENTATIONS:
                continue
            if path in COMPATIBILITY_FACADES or path in ALLOWED_LEGACY_BOUNDARIES:
                continue
            consumers.append({
                "consumer": path,
                "owner": target,
                "ownerId": LEGACY_IMPLEMENTATIONS[target]["id"],
                "import": module,
            })

    owners = []
    for path, metadata in LEGACY_IMPLEMENTATIONS.items():
        file = root / path
        owners.append({
            "id": metadata["id"],
            "path": path,
            "reason": metadata["reason"],
            "exists": file.is_file(),
            "sha256": sha256(file) if file.is_file() else None,
            "parityEvidence": [
                {"path": item, "exists": (root / item).is_file(), "sha256": sha256(root / item) if (root / item).is_file() else None}
                for item in metadata["parity"]
            ],
            "disposition": "RETAIN_UNTIL_CUTOVER_AND_DELETE_REVIEW",
        })

    facades = [facade_receipt(root, path) for path in sorted(COMPATIBILITY_FACADES)]
    findings = []
    for item in consumers:
        findings.append({
            "kind": "legacy-production-consumer",
            "severity": "major",
            "ownerId": item["ownerId"],
            "path": item["consumer"],
            "reason": f"production code still imports {item['owner']} directly",
        })
    for item in facades:
        if item["status"] != "COMPATIBILITY_FACADE":
            findings.append({
                "kind": "unmarked-compatibility-facade",
                "severity": "major",
                "path": item["path"],
                "reason": "compatibility surface is not explicitly labeled",
            })

    return {
        "schema": SCHEMA,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "root": str(root),
        "canonicalOwners": CANONICAL_OWNERS,
        "legacyOwners": owners,
        "compatibilityFacades": facades,
        "legacyConsumers": consumers,
        "findings": findings,
        "status": "REVIEW_REQUIRED" if findings else "CUTOVER_CLEAN_WITH_COMPATIBILITY_SURFACES",
        "terminal": False if findings else "REQUIRES_DELETE_REVIEW",
        "policy": {
            "noDelete": True,
            "workerPassForbidden": True,
            "compatibilityMustBeExplicit": True,
            "parityMustBeFreshBeforeDelete": True,
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    report = audit(args.root)
    encoded = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
    if args.output:
        output = args.output.resolve()
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(encoded, encoding="utf-8")
    print(encoded, end="")
    return 0 if report["status"] == "CUTOVER_CLEAN_WITH_COMPATIBILITY_SURFACES" else 3


if __name__ == "__main__":
    raise SystemExit(main())
