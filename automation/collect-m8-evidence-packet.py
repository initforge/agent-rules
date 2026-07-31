#!/usr/bin/env python3
"""Collect a HEAD-bound M8 packet; never upgrades missing evidence to PASS."""
from __future__ import annotations

import argparse, hashlib, json, subprocess, sys, time
from pathlib import Path

MODEL = "qwencoder/glm-5.2"
DIMENSIONS = [f"d{i:02d}" for i in range(1, 19)]

def run(root: Path, command: list[str]) -> dict:
    try:
        p = subprocess.run(command, cwd=root, capture_output=True, text=True, timeout=120)
        return {"command": command, "status": "PASS" if p.returncode == 0 else "UNVERIFIED", "exit_code": p.returncode, "output": (p.stdout + p.stderr)[-4000:]}
    except (OSError, subprocess.TimeoutExpired) as e:
        return {"command": command, "status": "UNVERIFIED", "exit_code": None, "output": str(e)}

def collect(root: Path) -> dict:
    head = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=root, text=True).strip()
    ledgers = sorted((root / ".agent" / "ledger").glob("*.json"))
    identity, revision, identity_verified = "", None, False
    if len(ledgers) == 1:
        ledger = json.loads(ledgers[0].read_text())
        identity = str((ledger.get("effective_plan_identity") or {}).get("sha256") or "")
        canonical = str((ledger.get("effective_plan_identity") or {}).get("canonical_json_utf8") or "")
        identity_verified = bool(identity and canonical and hashlib.sha256(canonical.encode()).hexdigest() == identity)
        revision = ledger.get("shadow_revision")
    receipts = {
        "test": run(root, ["npm", "run", "test", "--workspace", "packages/engine", "--", "--run", "test/evidence-packet.test.ts"]),
        "browser": run(root, ["npm", "run", "test", "--workspace", "packages/control-plane", "--", "--run", "tests/c4.test.ts"]),
        "security": run(root, ["npm", "run", "typecheck", "--workspace", "packages/engine"]),
        "install": run(root, ["npm", "run", "build", "--workspace", "packages/cli"]),
    }
    return {
        "schema": "worker-secondary/m8-evidence-packet/v1", "status": "UNVERIFIED",
        "headCommit": head, "effectivePlanIdentity": identity, "r53": revision,
        "requestedModel": MODEL, "resolvedModel": None,
        "identityVerified": identity_verified, "nativeAttestation": "UNVERIFIED: no native attestation supplied",
        "dimensions": [{"id": d, "score": None, "status": "UNVERIFIED"} for d in DIMENSIONS],
        "receipts": receipts,
        "findings": ["UNVERIFIED: resolved model, native attestation, authenticated packet receipt, and 18 scores >=8 are missing"],
        "collectedAt": int(time.time() * 1000),
    }

def main() -> int:
    p = argparse.ArgumentParser(); p.add_argument("--root", type=Path, default=Path(__file__).resolve().parent.parent); p.add_argument("--output", type=Path, required=True)
    a = p.parse_args(); packet = collect(a.root.resolve()); a.output.parent.mkdir(parents=True, exist_ok=True); a.output.write_text(json.dumps(packet, indent=2) + "\n")
    print(f"WROTE: {a.output}; status UNVERIFIED"); return 0

if __name__ == "__main__": sys.exit(main())
