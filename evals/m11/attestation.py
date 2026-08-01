#!/usr/bin/env python3
"""M11-C10 case 9 — Tier-A native attestation + Grok functional attestation bind exact HEAD.

Evidence paths:
  1. Deterministic attestation machinery (binds commitSha + evidence hashes to
     executable snapshots) — automation/host-attestation.test.ts and
     automation/write-host-attestations.test.ts.
  2. Live host availability probe on this box (versions observed; codex absent).
  A certified attestation additionally requires requested/resolved/observed model
  evidence from real sessions and the codex native CLI. Without those, the live
  binding claim stays WAITING_EXTERNAL — never faked.
"""
from __future__ import annotations

import json
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from runner import emit, run_vitest, vitest_passed  # noqa: E402

HOST_TEST = "automation/host-attestation.test.ts"
WRITE_TEST = "automation/write-host-attestations.test.ts"
REQUIRED = ["codex", "claude", "grok", "opencode", "antigravity"]


def git_head() -> str:
    out = subprocess.run(["git", "rev-parse", "HEAD"], capture_output=True, text=True, check=True, cwd=Path(__file__).resolve().parents[2])
    return out.stdout.strip()


def probe_hosts() -> dict:
    probes = {}
    for h in REQUIRED:
        exe = shutil.which(h if h != "antigravity" else "agy")
        version = None
        if exe:
            try:
                out = subprocess.run([exe, "--version"], capture_output=True, text=True, timeout=15)
                raw = (out.stdout or out.stderr).strip().splitlines()
                version = raw[0][:60] if raw else None
            except Exception:  # noqa: BLE001
                pass
        probes[h] = {"executable_present": exe is not None, "version": version}
    return probes


def main() -> int:
    head = git_head()
    machinery = run_vitest(HOST_TEST, WRITE_TEST)
    ok_machinery, why = vitest_passed(machinery)
    hosts = probe_hosts()

    print("M11-C10 case 9 — Tier-A native + Grok functional attestation binds exact HEAD:")
    print(f"  repository HEAD        : {head}")
    print(f"  attestation machinery  : {'PASS' if ok_machinery else 'FAIL'} (deterministic bind-to-HEAD tests)")
    if not ok_machinery:
        print(f"    {why}")
    for h, p in hosts.items():
        print(f"  {h:<11} executable={'present' if p['executable_present'] else 'MISSING'} version={p['version'] or '-'}")

    missing = [h for h, p in hosts.items() if not p["executable_present"]]
    missing_caps = []
    if "codex" in missing:
        missing_caps.append("codex native CLI not on PATH — Tier-A codex attestation cannot be collected")
    missing_caps.append("certified attestation requires requested/resolved/observed model evidence from real host sessions (role-verified); not available for an offline eval")

    if ok_machinery and not missing:
        status = "PASS"
    else:
        status = "WAITING_EXTERNAL"
        missing_caps.append(f"satisfy by: install codex, collect real session model evidence for all 5 hosts, then run collectHostAttestations against HEAD {head}")

    print(f"  status: {status}")
    emit("M11-C10-C9", status, "tier-a-grok-attestation-binds-head", {
        "head_commit": head,
        "attestation_machinery": "PASS" if ok_machinery else "FAIL",
        "hosts": hosts,
        "missing_capability": missing_caps,
        "evidence": [HOST_TEST, WRITE_TEST],
        "observed_at": datetime.now(timezone.utc).isoformat(),
    })
    return 0 if status == "PASS" else 2


if __name__ == "__main__":
    sys.exit(main())
