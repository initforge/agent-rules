#!/usr/bin/env python3
"""Update automation/source-integrity.json with the current hashes.

Hashes are computed over line-ending-normalized bytes so a file checked out with
CRLF on Windows and LF on Linux produces the same digest — the integrity check in
03-validate-context.ps1 normalizes the same way.

Run this after intentionally editing any script listed in source-integrity.json.
Use --check in CI to report drift without rewriting the manifest.
"""
import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

# Resolve from this file's location rather than a hardcoded path: the previous version
# pinned "P:/agent-rules", so it only ran on one Windows machine.
ROOT = Path(__file__).resolve().parent.parent


def digest(path: Path) -> str:
    """SHA-256 over file content with CRLF normalized to LF."""
    return hashlib.sha256(path.read_bytes().replace(b"\r\n", b"\n")).hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="report drift without writing")
    args = parser.parse_args()

    integrity_path = ROOT / "automation/source-integrity.json"
    integrity = json.loads(integrity_path.read_text(encoding="utf-8"))
    files = integrity.get("files", {})

    updated: dict[str, str] = {}
    changed: list[str] = []
    missing: list[str] = []

    for rel, old_hash in files.items():
        path = ROOT / rel
        if not path.exists():
            missing.append(rel)
            updated[rel] = old_hash
            continue
        new_hash = digest(path)
        updated[rel] = new_hash
        if new_hash != str(old_hash).lower():
            changed.append(rel)

    for rel in changed:
        print(f"{'DRIFT' if args.check else 'UPDATED'}: {rel}")
    for rel in missing:
        print(f"MISSING: {rel}")

    if args.check:
        if changed or missing:
            print(f"\nsource-integrity: {len(changed)} drifted, {len(missing)} missing")
            return 1
        print("source-integrity: OK")
        return 0

    integrity["files"] = updated
    integrity["generated_at"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S+00:00")
    integrity_path.write_text(json.dumps(integrity, indent=2) + "\n", encoding="utf-8")
    print(f"Done. Changed: {len(changed)} file(s), missing: {len(missing)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
