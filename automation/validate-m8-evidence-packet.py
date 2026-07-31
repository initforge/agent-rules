#!/usr/bin/env python3
"""Independent terminal validator. PASS requires every M8 gate; otherwise UNVERIFIED."""
from __future__ import annotations
import argparse, json, subprocess, sys
from pathlib import Path

def validate(packet: dict, root: Path) -> list[str]:
    errors = []
    head = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=root, text=True).strip()
    if packet.get("headCommit") != head: errors.append("HEAD mismatch")
    if packet.get("status") != "UNVERIFIED": errors.append("status must be UNVERIFIED")
    if packet.get("requestedModel") != "qwencoder/glm-5.2": errors.append("requested model mismatch")
    if packet.get("resolvedModel") != "qwencoder/glm-5.2": errors.append("resolved model unavailable")
    if packet.get("r53") != 53: errors.append("R53 mismatch or unavailable")
    if not packet.get("identityVerified"): errors.append("effective identity unverified")
    dims = packet.get("dimensions", [])
    if len(dims) != 18: errors.append("expected 18 dimensions")
    if any(d.get("status") != "PASS" or not isinstance(d.get("score"), (int, float)) or d["score"] < 8 for d in dims): errors.append("18 dimensions >=8 unavailable")
    for name in ("test", "browser", "security", "install"):
        if packet.get("receipts", {}).get(name, {}).get("status") != "PASS": errors.append(f"{name} receipt unavailable")
    if packet.get("nativeAttestation") != "VERIFIED": errors.append("native attestation unavailable")
    if not packet.get("findings"): errors.append("missing explicit findings")
    return errors

def main() -> int:
    p = argparse.ArgumentParser(); p.add_argument("packet", type=Path); p.add_argument("--root", type=Path, default=Path(__file__).resolve().parent.parent); a = p.parse_args()
    try: packet = json.loads(a.packet.read_text())
    except (OSError, json.JSONDecodeError) as e: print(f"UNVERIFIED: unreadable packet: {e}"); return 1
    errors = validate(packet, a.root.resolve())
    if errors: print("UNVERIFIED: " + "; ".join(errors)); return 1
    print("PASS: current HEAD-bound M8 packet"); return 0

if __name__ == "__main__": sys.exit(main())
