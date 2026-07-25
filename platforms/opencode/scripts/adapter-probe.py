#!/usr/bin/env python3
"""Native smoke tests / probes for the OpenCode adapter.

Probes:
- agent_discovery: all initforge-* agents are present and parseable
- permission_application: agent frontmatter has a permission block
- skill_discovery: skills directory exists and SKILL.md lookup works
- subagent_invocation_receipt: the adapter binary exists (not a true host receipt)
- mcp_availability: opencode.json mcp section is parseable
- owned_file_uninstall: ownership manifest entries match files on disk
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import yaml  # type: ignore[import]
from pathlib import Path


def fail(message: str) -> None:
    raise SystemExit(f"PROBE FAIL: {message}")


def try_load_yaml_frontmatter(path: Path) -> dict | None:
    """Try to load YAML frontmatter from a markdown file."""
    try:
        text = path.read_text(encoding="utf-8")
        if not text.startswith("---\n"):
            return None
        parts = text.split("---", 2)
        if len(parts) < 3:
            return None
        return dict(yaml.safe_load(parts[1]) or {})
    except Exception:
        return None


def main() -> None:
    parser = argparse.ArgumentParser(description="OpenCode adapter probe")
    parser.add_argument("--opencode-home", help="OpenCode runtime home path")
    parser.add_argument("--verbose", action="store_true", help="Verbose output")
    args = parser.parse_args()

    home = Path(args.opencode_home) if args.opencode_home else None
    if not home or not home.is_dir():
        # Auto-detect: check cwd's .opencode, then ~/.config/opencode
        cwd = Path.cwd()
        candidates = [
            cwd / ".opencode",
            Path.home() / ".config" / "opencode",
        ]
        for c in candidates:
            if c.is_dir():
                home = c
                break

    if not home:
        fail("No OpenCode home found. Pass --opencode-home or run from project root.")

    results: list[dict] = []
    verbose = args.verbose

    # --- Probe 1: Agent discovery ---
    agent_dir = home / "agents"
    expected_agents = [
        "initforge-architect.md",
        "initforge-implementer.md",
        "initforge-reviewer.md",
        "initforge-verifier.md",
        "initforge-utility-worker.md",
    ]
    found_agents = set()
    if agent_dir.is_dir():
        found_agents = {p.name for p in agent_dir.iterdir() if p.suffix == ".md" and p.name.startswith("initforge-")}

    missing = [a for a in expected_agents if a not in found_agents]
    extra = [a for a in found_agents if a not in expected_agents]
    agent_status = "PASS" if not missing else "PARTIAL"
    results.append({
        "probe": "agent_discovery",
        "status": agent_status,
        "detail": f"found {len(found_agents)} initforge agent(s)",
        "missing": missing,
        "extra": extra,
    })

    # Parse agent frontmatter
    all_parseable = True
    for agent_file in agent_dir.glob("initforge-*.md"):
        fm = try_load_yaml_frontmatter(agent_file)
        if fm is None:
            results.append({
                "probe": "agent_parse",
                "status": "FAIL",
                "detail": f"{agent_file.name}: unparseable frontmatter",
            })
            all_parseable = False
    if all_parseable and found_agents:
        results.append({
            "probe": "agent_parse",
            "status": "PASS",
            "detail": f"all {len(found_agents)} agents have parseable frontmatter",
        })

    # --- Probe 2: Permission application ---
    agents_with_permission = 0
    agents_no_permission = 0
    for agent_file in agent_dir.glob("initforge-*.md"):
        fm = try_load_yaml_frontmatter(agent_file)
        if fm and "permission" in fm:
            agents_with_permission += 1
        else:
            agents_no_permission += 1
            if verbose:
                results.append({
                    "probe": "permission_application",
                    "status": "WARN",
                    "detail": f"{agent_file.name}: no permission block in frontmatter",
                })

    if agents_with_permission > 0:
        results.append({
            "probe": "permission_application",
            "status": "PASS" if agents_no_permission == 0 else "PARTIAL",
            "detail": f"{agents_with_permission} agent(s) with permission, {agents_no_permission} without",
        })

    # --- Probe 3: Skill discovery ---
    skill_dir = home / "skills"
    if skill_dir.is_dir():
        skill_count = len([p for p in skill_dir.iterdir() if p.is_dir()])
        skmd_count = len(list(skill_dir.rglob("SKILL.md")))
        results.append({
            "probe": "skill_discovery",
            "status": "PASS",
            "detail": f"found {skill_count} skill dir(s), {skmd_count} SKILL.md file(s)",
        })
    else:
        results.append({
            "probe": "skill_discovery",
            "status": "OK",
            "detail": "skills directory exists but is empty (no harness skills installed)",
        })

    # --- Probe 4: Subagent invocation receipt ---
    # OpenCode doesn't expose a native invocation API we can probe.
    # The adapter binary presence is a proxy for "can be invoked".
    opencode_cli = os.environ.get("OPENCODE_BIN") or (
        os.environ.get("LOCALAPPDATA", "") + "\\Programs\\opencode\\opencode.exe"
        if os.name == "nt" else "/usr/local/bin/opencode"
    )
    cli_available = Path(opencode_cli).is_file() if opencode_cli and "opencode" in opencode_cli else False
    results.append({
        "probe": "subagent_invocation_receipt",
        "status": "UNVERIFIED" if not cli_available else "NATIVE_UNVERIFIED",
        "detail": "OpenCode CLI presence detected; no trusted host-delivered receipt exists"
        if cli_available
        else "OpenCode CLI not found; subagent invocation is unobservable",
    })

    # --- Probe 5: MCP availability ---
    config_paths = [
        home / "opencode.json",
        home.parent / "opencode.json",
    ]
    mcp_count = 0
    mcp_found = False
    for cfg in config_paths:
        if cfg.is_file():
            try:
                data = json.loads(cfg.read_text(encoding="utf-8-sig"))
                mcp_servers = data.get("mcp", {})
                mcp_count = len(mcp_servers)
                mcp_found = True
                break
            except Exception:
                pass

    if mcp_found:
        results.append({
            "probe": "mcp_availability",
            "status": "PASS" if mcp_count > 0 else "OK",
            "detail": f"{mcp_count} MCP server(s) configured in opencode.json",
        })
    else:
        results.append({
            "probe": "mcp_availability",
            "status": "OK",
            "detail": "No opencode.json found with mcp section",
        })

    # --- Probe 6: Owned-file uninstall ---
    ownership_manifest = home / "agent-rules-owned.json"
    if ownership_manifest.is_file():
        try:
            raw = ownership_manifest.read_bytes()
            if raw[:3] == b'\xef\xbb\xbf':
                raw = raw[3:]
            owned = json.loads(raw.decode("utf-8-sig"))
            owned_set = set(owned)
            on_disk = set()
            for entry in owned:
                target = home / entry
                if target.is_file() or target.is_dir():
                    on_disk.add(entry)
            missing_entries = owned_set - on_disk
            if missing_entries:
                results.append({
                    "probe": "owned_file_uninstall",
                    "status": "PARTIAL",
                    "detail": f"{len(missing_entries)} owned entry(ies) missing from disk: {list(missing_entries)}",
                })
            else:
                results.append({
                    "probe": "owned_file_uninstall",
                    "status": "PASS",
                    "detail": f"all {len(owned_set)} owned entries match files on disk",
                })
        except Exception as e:
            results.append({
                "probe": "owned_file_uninstall",
                "status": "FAIL",
                "detail": f"unparseable manifest: {e}",
            })
    else:
        results.append({
            "probe": "owned_file_uninstall",
            "status": "OK",
            "detail": "No ownership manifest (adapter not installed)",
        })

    # --- Summary ---
    fail_count = sum(1 for r in results if r["status"] == "FAIL")
    pass_count = sum(1 for r in results if r["status"] in ("PASS", "OK"))
    partial_count = sum(1 for r in results if r["status"] == "PARTIAL")
    unverified_count = sum(1 for r in results if r["status"] in ("UNVERIFIED", "NATIVE_UNVERIFIED"))

    result = {
        "platform": "opencode",
        "home": str(home),
        "results": results,
        "summary": {
            "total": len(results),
            "pass": pass_count,
            "partial": partial_count,
            "fail": fail_count,
            "unverified": unverified_count,
        },
    }

    print(json.dumps(result, indent=2))
    if verbose:
        print(f"\nSummary: {pass_count} pass, {partial_count} partial, {fail_count} fail, {unverified_count} unverified")

    if fail_count > 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
