#!/usr/bin/env python3
"""M11-C10 case 4 — a Tier-A host run demonstrates >=8 concurrent native children.

This box: claude IS installed (2.1.220), opencode IS installed and live, codex is
NOT on PATH. The claim (8 concurrent codex/claude/opencode native children) is
proved ONLY by actually dispatching children. We attempt a bounded live dispatch
across the hosts available, measure max observed concurrency (children in-flight
simultaneously), and record WAITING_EXTERNAL with the exact missing capability
when the target cannot be reached. We never fake a count we did not observe.

Usage: python3 evals/m11/live_concurrency.py [--offline]
  --offline  probe host availability/versions only; do not invoke model calls.
"""
from __future__ import annotations

import json
import shutil
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from runner import emit  # noqa: E402

# Tier-A native hosts per AM-0019 §10: codex, claude, opencode.
TIER_A = [
    ("codex", ["codex"], ["--version"]),
    ("claude", ["claude"], ["--version"]),
    ("opencode", ["opencode"], ["--version"]),
]
# Additional hosts present on this box (context; not part of the Tier-A count).
OTHER_HOSTS = [
    ("grok", ["grok"], ["--version"]),
    ("antigravity", ["agy"], ["--version"]),
]

# One bounded native-child invocation per host (minimal prompt, read-only).
# claude requires an authenticated endpoint; opencode is live on this box.
CHILD_COMMANDS = {
    "claude": ["claude", "--print", "Reply with exactly: OK"],
    "opencode": ["opencode", "run", "Reply with exactly: OK"],
    "codex": ["codex", "exec", "--print", "Reply with exactly: OK"],
}
CHILD_TIMEOUT_S = 45
OVERALL_TIMEOUT_S = 75


def probe(host: str, cmd: list[str], ver: list[str]) -> dict:
    exe = shutil.which(cmd[0])
    if not exe:
        return {"host": host, "available": False, "version": None}
    version = None
    try:
        out = subprocess.run([exe] + ver, capture_output=True, text=True, timeout=15)
        version = (out.stdout or out.stderr).strip().splitlines()
        version = version[0][:60] if version else None
    except Exception:
        pass
    return {"host": host, "available": True, "version": version}


def live_dispatch(available_hosts: list[str]) -> dict:
    """Spawn one native child per available Tier-A host, measure overlap."""
    procs: dict[str, dict] = {}
    start = time.monotonic()
    for host in available_hosts:
        exe = shutil.which(CHILD_COMMANDS[host][0])
        if not exe:
            continue
        try:
            p = subprocess.Popen(
                [exe] + CHILD_COMMANDS[host][1:],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            )
            procs[host] = {"proc": p, "spawned_at": time.monotonic(), "exit_at": None, "exit_code": None}
        except Exception as e:  # noqa: BLE001
            procs[host] = {"proc": None, "spawned_at": None, "exit_at": None, "exit_code": None, "error": str(e)}

    # Sample alive counts while any child is still in-flight.
    max_alive = 0
    while True:
        alive = 0
        finished = 0
        for host, st in procs.items():
            if st.get("exit_at") is not None:
                finished += 1
                continue
            proc = st.get("proc")
            if proc is None:
                continue
            code = proc.poll()
            if code is not None or time.monotonic() - st["spawned_at"] > CHILD_TIMEOUT_S:
                if code is None:
                    proc.kill()
                    code = "TIMEOUT"
                st["exit_at"] = time.monotonic()
                st["exit_code"] = code
            else:
                alive += 1
        max_alive = max(max_alive, alive)
        if time.monotonic() - start > OVERALL_TIMEOUT_S:
            for st in procs.values():
                if st.get("exit_at") is None and st.get("proc"):
                    st["proc"].kill()
            break
        if all(st.get("exit_at") is not None for st in procs.values()):
            break
        time.sleep(0.1)

    return {
        "max_observed_concurrent_children": max_alive,
        "per_host": {
            h: {"exit_code": st.get("exit_code"), "alive": st.get("exit_at") is None}
            for h, st in procs.items()
        },
    }


def main() -> int:
    offline = "--offline" in sys.argv
    tier_probes = [probe(*t) for t in TIER_A]
    other_probes = [probe(*t) for t in OTHER_HOSTS]

    available = [p["host"] for p in tier_probes if p["available"]]
    missing = [p["host"] for p in tier_probes if not p["available"]]
    max_possible = len(available)  # one child per distinct Tier-A host binary

    print("M11-C10 case 4 — Tier-A host capacity on this box:")
    for p in tier_probes:
        print(f"  {p['host']:<10} {'present ' + (p['version'] or '') if p['available'] else 'MISSING'}")
    for p in other_probes:
        print(f"  {p['host']:<10} {'present ' + (p['version'] or '') if p['available'] else 'missing'}  (non-Tier-A)")

    if offline or max_possible == 0:
        observed = 0
        live = {"mode": "offline" if offline else "no-hosts", "max_observed_concurrent_children": 0}
        print("  live dispatch: SKIPPED (offline mode / no hosts available)")
    else:
        print(f"  live dispatch attempt over {len(available)} Tier-A hosts (bounded, {CHILD_TIMEOUT_S}s/child)...")
        live = live_dispatch(available)
        observed = live["max_observed_concurrent_children"]
        print(f"  max observed concurrent native children: {observed}")
        print(f"  per-host outcomes: {json.dumps(live['per_host'])}")

    target = 8
    reached = observed >= target
    missing_caps = []
    if "codex" in missing:
        missing_caps.append("codex native CLI not on PATH (codex exec child impossible)")
    if max_possible < target:
        missing_caps.append(
            f"only {max_possible} distinct Tier-A host(s) present; >=8 concurrent native children "
            f"requires >=8 Tier-A host instances (install codex + additional Tier-A runners)"
        )
    auth_fail = [h for h, st in live.get("per_host", {}).items() if st.get("exit_code") not in (None, 0) or st.get("exit_code") == "TIMEOUT"]
    for h in auth_fail:
        missing_caps.append(f"{h}: live child failed (exit={live['per_host'][h]['exit_code']}); requires authenticated endpoint")

    if reached:
        status = "PASS"
    else:
        status = "WAITING_EXTERNAL"
        missing_caps.append("satisfy by: install codex on PATH, authenticate claude endpoint, and provide >=8 distinct Tier-A host runners; then re-run this probe")

    print(f"  target 8 concurrent native children: {'REACHED' if reached else f'NOT REACHED (observed={observed})'}")
    print(f"  status: {status}")

    emit("M11-C10-C4", status, "tier-a-8-concurrent-children", {
        "target_concurrent_children": target,
        "observed_concurrent_children": observed,
        "max_possible_hosts": max_possible,
        "hosts_available": available,
        "hosts_missing": missing,
        "live": live,
        "offline": offline,
        "missing_capability": missing_caps,
        "observed_at": datetime.now(timezone.utc).isoformat(),
    })
    # WAITING_EXTERNAL and FAIL are both nonzero so the case is never mistaken for green.
    return 0 if reached else 2


if __name__ == "__main__":
    sys.exit(main())
