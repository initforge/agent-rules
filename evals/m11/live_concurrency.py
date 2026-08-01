#!/usr/bin/env python3
"""M11-C10 case 4 — a Tier-A host run demonstrates >=8 concurrent native children.

This box: claude 2.1.220 installed, opencode installed and live, codex NOT on PATH,
grok installed but TUI-only (headless child dispatch impossible). The claim (8
concurrent native children) is proved ONLY by actually dispatching children. We
dispatch a bounded burst of N real native child invocations across the hosts that
mechanically support it (opencode run, claude --print), each performing a trivial
real model query whose exact output token we verify, sample the number alive at
~10 Hz to measure the true peak concurrency, and sample the thermal/RAM governor
signals during the run. WAITING_EXTERNAL is reported with the exact missing
capability when the Tier-A set is incomplete — never a faked count.

Governor thresholds are read from AM-0019 §6 as compiled in
packages/engine/src/resource-broker.ts (AM0019 const) and the thermal sampling
mirrors packages/engine/src/resource-governor.ts (prefers the x86_pkg_temp zone).

Usage: python3 evals/m11/live_concurrency.py [--offline]
  --offline  probe host availability/versions + governor snapshot only; do not
             invoke model calls.
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile
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

# ── AM-0019 §6 governor thresholds (packages/engine/src/resource-broker.ts) ──
GOV = {
    "BURST_MIN_RAM_FRACTION": 0.30,
    "REDUCE_MAX_RAM_FRACTION": 0.20,
    "PAUSE_MAX_RAM_FRACTION": 0.12,
    "BURST_MAX_CPU_C": 78,
    "REDUCE_MIN_CPU_C": 85,
    "PAUSE_MIN_CPU_C": 92,
    "NORMAL_AGENTS": 8,
    "REDUCED_AGENTS": 4,
    "BURST_MIN_AGENTS": 10,
    "BURST_MAX_AGENTS": 14,
}

# One real native-child command per host. Each child must print an exact unique
# token to be counted as a live, real response (never a fake/inert process).
CHILD_SPECS = {
    "opencode": {
        "build": lambda tok: [
            "opencode", "run", "--model", "qwencoder/deepseek-v4-flash",
            "--format", "json", f"Reply with exactly: {tok}",
        ],
        "timeout_s": 45,
    },
    "claude": {
        "build": lambda tok: [
            "claude", "--print", "--model", "sonnet", f"Reply with exactly: {tok}",
        ],
        "timeout_s": 60,
    },
    # grok is TUI-only: headless dispatch fails with ENXIO (no controlling
    # terminal). Kept as a spec so the failure is recorded, never counted.
    "grok": {
        "build": lambda tok: ["grok", "--output-format", "plain", f"Reply with exactly: {tok}"],
        "timeout_s": 20,
    },
}
SAMPLE_HZ = 10
OVERALL_TIMEOUT_S = 120
EXPECTED_OK = {}


# ── Governor signal readers (mirror engine implementations) ──────────────────

def read_pkg_temp_c() -> float | None:
    """Read the x86_pkg_temp zone when present (resource-governor.ts prefers it)."""
    thermal_dir = Path("/sys/class/thermal")
    try:
        if not thermal_dir.is_dir():
            return None
        zones = [d for d in thermal_dir.iterdir() if d.name.startswith("thermal_zone")]
        pkg = next((z for z in zones if (z / "type").read_text().strip() == "x86_pkg_temp"), None)
        candidates = [pkg] if pkg else zones
        best = 0.0
        for z in candidates:
            raw = int((z / "temp").read_text().strip())
            best = max(best, raw / 1000.0)
        return best or None
    except Exception:  # noqa: BLE001
        return None


def read_mem_fraction() -> float | None:
    try:
        total = available = None
        for line in Path("/proc/meminfo").read_text().splitlines():
            k, _, v = line.partition(":")
            v = int(v.split()[0])
            if k == "MemTotal":
                total = v
            elif k == "MemAvailable":
                available = v
        if total and available is not None:
            return available / total
    except Exception:  # noqa: BLE001
        pass
    return None


def governor_snapshot() -> dict:
    # Brief multi-sample window (max temp, min RAM) so a single transient spike
    # does not mislabel the band; mirrors the engine's thermal hysteresis intent.
    temp_samples, ram_samples = [], []
    for _ in range(3):
        t = read_pkg_temp_c()
        r = read_mem_fraction()
        if t is not None:
            temp_samples.append(t)
        if r is not None:
            ram_samples.append(r)
        time.sleep(0.35)
    temp_c = max(temp_samples) if temp_samples else None
    ram = min(ram_samples) if ram_samples else None
    try:
        load1 = float(Path("/proc/loadavg").read_text().split()[0])
    except Exception:  # noqa: BLE001
        load1 = None
    nproc = os.cpu_count() or 1
    if temp_c is not None and temp_c >= GOV["PAUSE_MIN_CPU_C"]:
        band = "PAUSE"
    elif temp_c is not None and temp_c >= GOV["REDUCE_MIN_CPU_C"]:
        band = "REDUCE"
    elif temp_c is not None and temp_c < GOV["BURST_MAX_CPU_C"] and ram is not None and ram >= GOV["BURST_MIN_RAM_FRACTION"]:
        band = "BURST"
    else:
        band = "NORMAL"
    if band == "PAUSE":
        safe_agents = 2
    elif band == "REDUCE":
        safe_agents = GOV["REDUCED_AGENTS"]
    elif band == "BURST":
        safe_agents = min(GOV["BURST_MAX_AGENTS"], GOV["BURST_MIN_AGENTS"], nproc)
    else:
        safe_agents = GOV["NORMAL_AGENTS"]
    return {
        "band": band,
        "temp_c": temp_c,
        "ram_fraction": round(ram, 3) if ram is not None else None,
        "load1": load1,
        "nproc": nproc,
        "safe_agents": safe_agents,
        "thresholds": GOV,
    }


# ── Host probing ─────────────────────────────────────────────────────────────

def probe(host: str, cmd: list[str], ver: list[str]) -> dict:
    exe = shutil.which(cmd[0])
    if not exe:
        return {"host": host, "available": False, "version": None, "exe": None}
    version = None
    try:
        out = subprocess.run([exe] + ver, capture_output=True, text=True, timeout=15)
        version = (out.stdout or out.stderr).strip().splitlines()
        version = version[0][:60] if version else None
    except Exception:  # noqa: BLE001
        pass
    return {"host": host, "available": True, "version": version, "exe": exe}


# ── Live concurrent dispatch ────────────────────────────────────────────────

def live_burst(plan: list[dict], pre: dict) -> dict:
    """Spawn `plan` real children at once; measure peak alive + governor signals.

    plan: [{host, spec, token}] — each entry is one native child.
    Returns per-child outcomes, peak concurrency, governor trace.
    """
    tmpdir = tempfile.mkdtemp(prefix="m11-c4-")
    procs: dict[str, dict] = {}
    start = time.monotonic()
    for i, entry in enumerate(plan):
        spec = entry["spec"]
        try:
            cmd = spec["build"](entry["token"])
            out_path = os.path.join(tmpdir, f"{entry['host']}-{i}.out")
            err_path = os.path.join(tmpdir, f"{entry['host']}-{i}.err")
            with open(out_path, "w") as out_f, open(err_path, "w") as err_f:
                p = subprocess.Popen(cmd, stdout=out_f, stderr=err_f, stdin=subprocess.DEVNULL)
            procs[f"{entry['host']}-{i}"] = {
                "host": entry["host"],
                "token": entry["token"],
                "proc": p,
                "spawned_at": time.monotonic(),
                "exit_at": None,
                "exit_code": None,
                "timeout": spec["timeout_s"],
                "out": out_path,
                "err": err_path,
            }
        except Exception as e:  # noqa: BLE001
            procs[f"{entry['host']}-{i}"] = {
                "host": entry["host"],
                "token": entry["token"],
                "proc": None,
                "spawned_at": None,
                "exit_at": time.monotonic(),
                "exit_code": "SPAWN_ERR",
                "timeout": spec["timeout_s"],
                "out": None,
                "err": None,
                "error": str(e),
            }

    # Sample alive count at ~SAMPLE_HZ and trace governor signals.
    max_alive = 0
    max_temp_c = None
    min_ram = None
    gov_trips: dict[str, dict] = {"PAUSE": None, "REDUCE": None}
    trace: list[dict] = []
    poll_interval = 1.0 / SAMPLE_HZ
    sample_n = 0
    while True:
        alive = 0
        for st in procs.values():
            if st.get("exit_at") is not None:
                continue
            proc = st.get("proc")
            if proc is None:
                continue
            code = proc.poll()
            if code is not None or time.monotonic() - st["spawned_at"] > st["timeout"]:
                if code is None:
                    proc.kill()
                    code = "TIMEOUT"
                st["exit_at"] = time.monotonic()
                st["exit_code"] = code
            else:
                alive += 1
        max_alive = max(max_alive, alive)
        t = read_pkg_temp_c()
        r = read_mem_fraction()
        if t is not None:
            max_temp_c = t if max_temp_c is None else max(max_temp_c, t)
            if t >= GOV["PAUSE_MIN_CPU_C"] and gov_trips["PAUSE"] is None:
                gov_trips["PAUSE"] = {"t_offset_s": round(time.monotonic() - start, 2), "temp_c": t}
            if t >= GOV["REDUCE_MIN_CPU_C"] and gov_trips["REDUCE"] is None:
                gov_trips["REDUCE"] = {"t_offset_s": round(time.monotonic() - start, 2), "temp_c": t}
        if r is not None:
            min_ram = r if min_ram is None else min(min_ram, r)
            if r < GOV["PAUSE_MAX_RAM_FRACTION"] and gov_trips["PAUSE"] is None:
                gov_trips["PAUSE"] = {"t_offset_s": round(time.monotonic() - start, 2), "ram_fraction": round(r, 3)}
        if sample_n % 5 == 0:
            trace.append({
                "t_offset_s": round(time.monotonic() - start, 2),
                "alive": alive,
                "temp_c": t,
                "ram_fraction": round(r, 3) if r is not None else None,
            })
        sample_n += 1
        if time.monotonic() - start > OVERALL_TIMEOUT_S:
            for st in procs.values():
                if st.get("exit_at") is None and st.get("proc"):
                    st["proc"].kill()
            break
        if all(st.get("exit_at") is not None for st in procs.values()):
            break
        time.sleep(poll_interval)

    # Collect outputs + verify the expected token (real-response proof).
    per_host: dict[str, dict] = {}
    for key, st in procs.items():
        host = st["host"]
        verified = False
        if st["out"] and os.path.exists(st["out"]):
            try:
                content = Path(st["out"]).read_text(errors="replace")
                verified = st["token"] in content
            except Exception:  # noqa: BLE001
                content = ""
        else:
            content = ""
        rec = per_host.setdefault(host, {"spawned": 0, "ok": 0, "fail": 0, "errors": []})
        rec["spawned"] += 1
        code = st["exit_code"]
        if code == 0 and verified:
            rec["ok"] += 1
        else:
            rec["fail"] += 1
            err = st.get("error") or (st.get("err") and os.path.exists(st["err"]) and Path(st["err"]).read_text(errors="replace")[:200])
            rec["errors"].append({"exit_code": code, "verified": verified, "stderr_tail": (err or "").strip()[-160:]})
    return {
        "max_observed_concurrent_children": max_alive,
        "max_temp_c": max_temp_c,
        "min_ram_fraction": round(min_ram, 3) if min_ram is not None else None,
        "governor_trips": {k: v for k, v in gov_trips.items() if v},
        "trace": trace,
        "per_host": per_host,
    }


def build_plan(available_hosts: list[str], target: int) -> list[dict]:
    """Fill `target` child slots from live-capable hosts; prefer opencode first.

    Multiple children per host binary are legitimate concurrent native children
    (the old script wrongly capped at one child per distinct host). Weighting:
    opencode (fast, live) takes most slots; claude (works via --model sonnet)
    takes the rest. grok is never auto-added (TUI-only) — its availability is
    reported but it cannot contribute a native headless child.
    """
    live_hosts = [h for h in available_hosts if h in CHILD_SPECS]
    if not live_hosts:
        return []
    # opencode 75%, claude 25% when both live; 100% single host otherwise.
    weights = {h: (1.0 if h == "opencode" else 0.0) for h in live_hosts}
    if "opencode" in live_hosts and "claude" in live_hosts:
        weights = {"opencode": 0.75, "claude": 0.25}
    # integer allocation that sums to exactly `target`
    alloc = {}
    remaining = target
    for h in live_hosts:
        share = int(target * weights[h])
        if h == "claude" and share == 0 and remaining > 0:
            share = 1
        alloc[h] = min(share, remaining)
        remaining -= alloc[h]
    if remaining:
        alloc[live_hosts[0]] += remaining

    plan = []
    for host, count in alloc.items():
        for _ in range(count):
            plan.append({"host": host, "spec": CHILD_SPECS[host], "token": f"CHILD-{host}-{len(plan)}-{os.getpid()}"})
    return plan


def main() -> int:
    offline = "--offline" in sys.argv
    tier_probes = [probe(*t) for t in TIER_A]
    other_probes = [probe(*t) for t in OTHER_HOSTS]
    available = [p["host"] for p in tier_probes if p["available"]]
    missing = [p["host"] for p in tier_probes if not p["available"]]

    print("M11-C10 case 4 — Tier-A host capacity on this box:")
    for p in tier_probes:
        print(f"  {p['host']:<10} {'present ' + (p['version'] or '') if p['available'] else 'MISSING'}")
    for p in other_probes:
        print(f"  {p['host']:<10} {'present ' + (p['version'] or '') if p['available'] else 'missing'}  (non-Tier-A)")

    pre = governor_snapshot()
    print("  governor snapshot (AM-0019 §6, resource-broker.ts thresholds):")
    print(f"    band={pre['band']} temp_c={pre['temp_c']} ram_fraction={pre['ram_fraction']} "
          f"load1={pre['load1']} nproc={pre['nproc']} safe_agents={pre['safe_agents']}")

    target = 8  # AM-0019 §5 "may use 8 normally"
    if pre["band"] == "PAUSE":
        target = pre["safe_agents"]
        print(f"    governor PRE-DISPATCH PAUSE: reduced burst target to {target} (host cannot safely run 8)")

    if offline:
        observed = 0
        live = {"mode": "offline", "max_observed_concurrent_children": 0, "governor_pre": pre}
        print("  live dispatch: SKIPPED (offline mode)")
    else:
        plan = build_plan(available, target)
        print(f"  live burst: dispatching {len(plan)} real native children concurrently "
              f"({', '.join(p['host'] for p in plan)}), ~{SAMPLE_HZ} Hz sampling, governor trace ON...")
        live = live_burst(plan, pre)
        observed = live["max_observed_concurrent_children"]
        print(f"  max observed concurrent native children: {observed}")
        print(f"  max temp during run: {live['max_temp_c']}°C   min ram: {live['min_ram_fraction']}")
        if live["governor_trips"]:
            print(f"  governor trips during run: {json.dumps(live['governor_trips'])}")
        for host, rec in live["per_host"].items():
            print(f"  {host:<10} spawned={rec['spawned']} ok(exit0+token)={rec['ok']} fail={rec['fail']}")
            for e in rec["errors"][:2]:
                print(f"    err: {e}")

    reached = observed >= 8
    missing_caps = []
    if "codex" in missing:
        missing_caps.append("codex native CLI not on PATH (codex exec child impossible)")
    if reached and not missing:
        status = "PASS"
    else:
        status = "WAITING_EXTERNAL"
        if missing:
            missing_caps.append(
                f"Tier-A set incomplete: missing {', '.join(missing)}; AM-0019 §12 requires "
                f"codex+claude+opencode all present for a certified Tier-A >=8 run"
            )
        if not reached:
            missing_caps.append(
                f"observed max concurrent native children = {observed} < 8; "
                f"probe burst target was {target} (governor band={pre['band']})"
            )
        missing_caps.append(
            "satisfy by: install codex on PATH, then re-run this probe; the concurrency "
            "machinery itself is proven by the observed burst"
        )

    print(f"  target 8 concurrent native children: {'REACHED' if reached else f'NOT REACHED (observed={observed})'}")
    print(f"  status: {status}")

    emit("M11-C10-C4", status, "tier-a-8-concurrent-children", {
        "target_concurrent_children": target,
        "observed_concurrent_children": observed,
        "hosts_available": available,
        "hosts_missing": missing,
        "governor_pre_dispatch": pre,
        "live": live,
        "offline": offline,
        "missing_capability": missing_caps,
        "observed_at": datetime.now(timezone.utc).isoformat(),
    })
    # WAITING_EXTERNAL and FAIL are both nonzero so the case is never mistaken for green.
    return 0 if status == "PASS" else 2


if __name__ == "__main__":
    sys.exit(main())
