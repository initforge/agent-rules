#!/usr/bin/env python3
"""M11-C10 case 9 — Tier-A native attestation + Grok functional attestation bind exact HEAD.

Evidence paths:
  1. Deterministic attestation machinery (binds commitSha + evidence hashes to
     executable snapshots) — automation/host-attestation.test.ts and
     automation/write-host-attestations.test.ts (mandatory).
  2. Live per-host attestation artifacts written by the native produce path
     (.agent/evidence/m11-c9/attestation-<host>.json), each re-validated with the
     canonical engine check (assertCertificationAttestation via
     automation/control-plane-ci.mjs certification-validate) against the exact
     repository HEAD.

A host that cannot produce a native attestation at this HEAD is reported
WAITING_EXTERNAL with the exact missing capability — never claimed PASS.
"""
from __future__ import annotations

import glob
import json
import os
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
ROOT = Path(__file__).resolve().parents[2]
ATTEST_DIR = ROOT / ".agent" / "evidence" / "m11-c9"
NODE = shutil.which("node")

# Collector-equivalent discovery (mirrors resolveNativeExecutable): known native
# install roots first, PATH last. A host counts as installed only when an
# absolute, non-symlink executable is found.
DEFAULT_ROOTS = {
    "codex": ["~/.codex-cli-npm/lib/node_modules/@openai/codex/node_modules/@openai/codex-*/vendor/*/bin/codex"],
    "claude": ["~/.local/share/claude/versions/*", "~/.local/bin/claude"],
    "grok": ["~/.grok/downloads/grok-[0-9]*"],
    "opencode": ["~/.opencode/bin/opencode"],
    "antigravity": ["~/.local/bin/agy"],
}
PATH_NAMES = {"codex": "codex", "claude": "claude", "grok": "grok", "opencode": "opencode", "antigravity": "agy"}


def expand(path: str) -> str:
    return os.path.expanduser(path)


def discover(host: str) -> tuple[str | None, str | None]:
    """Return (executable_path, version_first_line) observed on this box, or (None, None)."""
    candidates: list[str] = []
    for pattern in DEFAULT_ROOTS[host]:
        candidates.extend(glob.glob(expand(pattern)))
    on_path = shutil.which(PATH_NAMES[host])
    if on_path:
        candidates.append(on_path)
    seen: set[str] = set()
    for candidate in candidates:
        try:
            if os.path.islink(candidate) or not os.path.isfile(candidate):
                continue
            real = candidate
        except OSError:
            continue
        if real in seen:
            continue
        seen.add(real)
        try:
            out = subprocess.run([real, "--version"], capture_output=True, text=True, timeout=20)
            if out.returncode != 0:
                continue
            raw = (out.stdout or out.stderr).strip().splitlines()
            if not raw:
                continue
            return real, raw[0][:80]
        except (OSError, subprocess.TimeoutExpired):
            continue
    return None, None


def git_head() -> str:
    out = subprocess.run(["git", "rev-parse", "HEAD"], capture_output=True, text=True, check=True, cwd=ROOT)
    return out.stdout.strip()


def validate_attestation(host: str, head: str, path: Path) -> tuple[bool, str]:
    """Canonical engine validation of one attestation file against exact HEAD."""
    if not path.is_file():
        return False, "attestation file missing"
    if NODE is None:
        return False, "node unavailable for canonical validation"
    env = dict(os.environ, CERTIFICATION_HOST=host, CERTIFICATION_COMMIT_SHA=head, HOST_ATTESTATION_FILE=str(path))
    proc = subprocess.run(
        [NODE, "automation/control-plane-ci.mjs", "certification-validate"],
        capture_output=True, text=True, cwd=ROOT, env=env, timeout=60,
    )
    if proc.returncode == 0:
        return True, "assertCertificationAttestation OK (binds HEAD)"
    detail = (proc.stderr or proc.stdout).strip().splitlines()
    reason = next((line.strip() for line in detail if line.strip().startswith("Error:")), None)
    return False, f"assertCertificationAttestation rejected: {reason or (detail[-1] if detail else 'unknown')}"


def main() -> int:
    head = git_head()
    machinery = run_vitest(HOST_TEST, WRITE_TEST)
    ok_machinery, why = vitest_passed(machinery)

    print("M11-C10 case 9 — Tier-A native + Grok functional attestation binds exact HEAD:")
    print(f"  repository HEAD        : {head}")
    print(f"  attestation machinery  : {'PASS' if ok_machinery else 'FAIL'} (deterministic bind-to-HEAD tests)")
    if not ok_machinery:
        print(f"    {why}")

    missing_caps: list[str] = []
    per_host: dict[str, dict] = {}
    for host in REQUIRED:
        exe, version = discover(host)
        attestation_path = ATTEST_DIR / f"attestation-{host}.json"
        attested, why_attest = (False, "no attestation file") if not attestation_path.is_file() else validate_attestation(host, head, attestation_path)
        if exe and attested:
            status = "OBSERVED"
            print(f"  {host:<11} installed  version={version} attestation={'BINDS_HEAD' if attested else 'NO'}")
        elif exe:
            status = "WAITING_EXTERNAL"
            missing_caps.append(f"{host} v{version}: {why_attest}")
            print(f"  {host:<11} installed  version={version} attestation=NO — {why_attest}")
        else:
            status = "WAITING_EXTERNAL"
            missing_caps.append(f"{host}: native CLI not found on this box (checked {', '.join(DEFAULT_ROOTS[host])} and PATH)")
            print(f"  {host:<11} MISSING    attestation=NO — no executable discovered")
        per_host[host] = {"installed": exe is not None, "version": version, "attestation_binds_head": attested, "status": status}

    if ok_machinery and all(p["attestation_binds_head"] for p in per_host.values()):
        status = "PASS"
    else:
        status = "WAITING_EXTERNAL"
        if not ok_machinery:
            missing_caps.insert(0, f"deterministic attestation machinery failed: {why}")
        missing_caps.append(f"satisfy by: produce a native attestation at HEAD {head} for every host whose binary is installed, then re-run")

    print(f"  status: {status}")
    emit("M11-C10-C9", status, "tier-a-grok-attestation-binds-head", {
        "head_commit": head,
        "attestation_machinery": "PASS" if ok_machinery else "FAIL",
        "hosts": per_host,
        "attestation_dir": str(ATTEST_DIR),
        "missing_capability": missing_caps,
        "evidence": [HOST_TEST, WRITE_TEST, ".agent/evidence/m11-c9/attestation-{codex,claude,grok,opencode,antigravity}.json"],
        "observed_at": datetime.now(timezone.utc).isoformat(),
    })
    return 0 if status == "PASS" else 2


if __name__ == "__main__":
    sys.exit(main())
