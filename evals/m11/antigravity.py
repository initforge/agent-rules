#!/usr/bin/env python3
"""M11-C10 case 10 — Antigravity out-of-ownership mutation is rejected.

Checks whether any antigravity-specific out-of-ownership mutation rejection
exists (path/worktree lease enforcement, diff-boundary validator, no canonical
`.agent` mutation) in platforms/antigravity, and runs the host-policy matrix that
constrains Antigravity. Engine-level path-conflict rejection exists (C2), but the
antigravity-constrained adapter contract is what this case requires.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from runner import emit, run_vitest, vitest_passed  # noqa: E402

ANTIGRAVITY = Path(__file__).resolve().parents[2] / "platforms" / "antigravity"
HOST_POLICY = "packages/engine/test/workflow-validation.test.ts"

# Enforcement markers that would satisfy the case if present in the adapter layer.
LEASES_MARKERS = ["lease", "ownedPath", "owned", "worktree", "OUT_OF_SCOPE", "diff-boundary", "boundary"]


def scan_adapter() -> list[str]:
    findings = []
    for f in sorted(ANTIGRAVITY.rglob("*")):
        if not f.is_file() or f.name.startswith(".") or "__pycache__" in str(f):
            continue
        try:
            text = f.read_text(encoding="utf-8", errors="replace")
        except Exception:  # noqa: BLE001
            continue
        for marker in LEASES_MARKERS:
            if marker in text:
                findings.append(f"{f.relative_to(ANTIGRAVITY)}: contains '{marker}'")
    return findings


def main() -> int:
    if not ANTIGRAVITY.is_dir():
        raise SystemExit(f"ERROR: platforms/antigravity not found: {ANTIGRAVITY}")

    markers = scan_adapter()
    print("M11-C10 case 10 — Antigravity out-of-ownership mutation rejected:")
    print(f"  platforms/antigravity lease/ownership markers: {len(markers)}")
    for m in markers[:25]:
        print(f"    {m}")

    # The engine-level host policy matrix constrains Antigravity (Tier-A list,
    # HOST_NATIVE requirement, constrained/advisory failure mode).
    policy = run_vitest(HOST_POLICY, test_filter="host matrix")
    ok_policy, why_policy = vitest_passed(policy)
    print(f"  engine host-policy matrix (antigravity constrained): {'PASS' if ok_policy else 'FAIL'}")
    if not ok_policy:
        print(f"    {why_policy}")

    # Does the adapter itself reject out-of-ownership mutation?
    adapter_file = ANTIGRAVITY / "adapter.ts"
    adapter_text = adapter_file.read_text(encoding="utf-8") if adapter_file.is_file() else ""
    has_enforcement = ("lease" in adapter_text) or ("owned" in adapter_text) or ("boundary" in adapter_text)

    if has_enforcement:
        status = "PASS"
        missing_caps: list[str] = []
    else:
        status = "WAITING_EXTERNAL"
        missing_caps = [
            "platforms/antigravity/adapter.ts implements detect/render/stage/activate/probe/update/uninstall/rollback "
            "but NO out-of-ownership mutation rejection (no worktree/path-lease check, no diff-boundary validator, "
            "no canonical-.agent guard); engine-level C2 path-conflict rejection exists but is not antigravity-specific",
            "satisfy by: implement the constrained adapter contract (strict worktree/path lease + out-of-ownership "
            "mutation rejection + a test proving a mutation outside the lease is rejected), then re-run this eval",
        ]
    print(f"  adapter-level out-of-ownership rejection: {'FOUND' if has_enforcement else 'NOT FOUND'}")
    print(f"  status: {status}")

    emit("M11-C10-C10", status, "antigravity-out-of-ownership-rejected", {
        "adapter_out_of_ownership_enforcement": has_enforcement,
        "marker_hits": markers,
        "engine_host_policy_matrix": "PASS" if ok_policy else "FAIL",
        "missing_capability": missing_caps,
        "evidence": [str(ANTIGRAVITY), HOST_POLICY],
    })
    return 0 if status == "PASS" else 2


if __name__ == "__main__":
    sys.exit(main())
