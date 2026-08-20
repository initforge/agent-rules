#!/usr/bin/env python3
"""Generate volatile reference docs from canonical manifests into generated/references/."""

import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path


def main():
    root = Path(os.environ.get("AGENT_RULES_ROOT", Path(__file__).resolve().parent.parent))
    out = root / "generated" / "references"
    out.mkdir(parents=True, exist_ok=True)

    def write_ref(name, title, body):
        path = out / name
        rel = path.relative_to(root).as_posix()
        now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
        header = (
            f"# {title}\n\n"
            f"**DO NOT EDIT** - Generated file. Source: `{rel}`.\n"
            f"Last generated: {now}\n\n"
        )
        path.write_text(header + body, encoding="utf-8")
        print(f"  wrote {rel}")

    # ── 1. Integration registry ────────────────────────────────────────
    reg_path = root / "integrations" / "registry.json"
    if reg_path.exists():
        reg = json.loads(reg_path.read_text(encoding="utf-8"))
        lines = [
            "| ID | Policy | Kind | Install Type | Profiles | Trust | Capabilities | Native Hosts |",
            "|---|---|---|---|---|---|---|---|",
        ]
        for t in reg["integrations"]:
            profiles = ", ".join(t.get("profiles", [])) or "--"
            caps = ", ".join(t.get("capabilities", [])) or "--"
            hosts = ", ".join(t.get("nativeHosts", [])) or "--"
            itype = t.get("install", {}).get("type", "--")
            lines.append(
                f"| {t['id']} | {t['policy']} | {t['kind']} | {itype} "
                f"| {profiles} | {t.get('trust', '--')} | {caps} | {hosts} |"
            )
        lines += ["", "**Profiles:**", "",
                  "| Profile | Description | Required | Recommended |",
                  "|---|---|---|---|"]
        for pname, pdata in reg.get("profiles", {}).items():
            req = ", ".join(pdata.get("required", [])) or "--"
            rec = ", ".join(pdata.get("recommended", [])) or "--"
            lines.append(f"| {pname} | {pdata.get('description', '')} | {req} | {rec} |")
        write_ref("integration-registry.md", "Integration Registry", "\n".join(lines))

    # ── 2. Platform homes ──────────────────────────────────────────────
    plat_root = root / "platforms"
    lines = [
        "| Platform | Overlay | Install Home | MCP Config | MCP Format |",
        "|---|---|---|---|---|",
    ]
    for pdir in sorted(plat_root.iterdir()):
        if not pdir.is_dir():
            continue
        rpath = pdir / "runtime.yaml"
        if not rpath.exists():
            continue
        text = rpath.read_text(encoding="utf-8")
        pf = re.search(r"platform:\s*(.+)", text)
        home = re.search(r"runtime_home:\s*(.+)", text)
        mcp = re.search(r"mcp_config:\s*(.+)", text)
        fmt = re.search(r"mcp_format:\s*(.+)", text)
        pf_v = pf.group(1).strip() if pf else pdir.name
        home_v = home.group(1).strip() if home else ""
        mcp_v = mcp.group(1).strip() if mcp else ""
        fmt_v = fmt.group(1).strip() if fmt else ""
        lines.append(
            f"| {pf_v} | {pf_v}-overlay.md | {home_v} | {mcp_v} | {fmt_v} |"
        )
    write_ref("platform-homes.md", "Platform Homes", "\n".join(lines))

    # ── 3. Capability matrix summary ───────────────────────────────────
    lines = [
        "**Platform status (from canonical capability guide)**",
        "",
        "| Product | Status | Implemented | Notes |",
        "|---|---|---|---|",
        "| Codex | supported | yes | Native agents, hooks, Plan Mode, MCP |",
        "| Antigravity | supported | yes | Antigravity-native agents, skill gate hooks, browser/MCP tools |",
        "| Cursor | supported | yes | Cursor rules, hooks, native agents (Markdown) |",
        "| Grok | supported | yes | Grok agents (TOML), personas, inject rules, skill gate |",
        "| OpenCode | planned | no | Adapter not yet implemented |",
        "",
        "**Status values:** native | emulated | unsupported | unverified",
        "",
        "See full matrix with per-dimension status: docs/guides/06-platform-capability.md",
    ]
    write_ref("capability-matrix.md", "Capability Matrix", "\n".join(lines))

    # ── 4. Skill index ─────────────────────────────────────────────────
    skill_root = root / "skills"
    lines = [
        "| Slug | Priority | Max Route Tokens | Description |",
        "|---|---|---|---|",
    ]
    oversize = {"docs-style", "plan-and-handoff", "finish-to-completion", "code-review"}
    for sdir in sorted(skill_root.iterdir()):
        spath = sdir / "SKILL.md"
        if not spath.exists():
            continue
        slug = sdir.name
        content = spath.read_text(encoding="utf-8")
        priority = ""
        tokens = ""
        # Agent Skills frontmatter stays portable. agent-rules routing lives in
        # the canonical ROUTE.json sidecar; legacy frontmatter is not a source
        # of truth for generated references.
        route_path = sdir / "ROUTE.json"
        if route_path.exists():
            try:
                routing = json.loads(route_path.read_text(encoding="utf-8"))
                priority = str(routing.get("priority", ""))
                tokens = str(routing.get("max_route_tokens", ""))
            except (json.JSONDecodeError, OSError):
                pass
        # Find first heading line (after frontmatter)
        desc_line = slug
        for line in content.split("\n"):
            if line.startswith("# "):
                desc_line = line.lstrip("# ")
                break
        if slug in oversize:
            desc_line += " (intentional oversize)"
        lines.append(f"| {slug} | {priority} | {tokens} | {desc_line} |")
    write_ref("skill-index.md", "Skill Index", "\n".join(lines))

    # ── 5. Rule index ──────────────────────────────────────────────────
    manifest_path = root / "rules" / "manifest.yaml"
    if manifest_path.exists():
        text = manifest_path.read_text(encoding="utf-8")
        lines = ["| Order | Rule |", "|---|---|"]
        idx = 1
        m = re.search(r"load_order:\s*\n((?:[ \t]+-\s+\S+\n)+)", text)
        if m:
            for line in m.group(1).split("\n"):
                m2 = re.match(r"\s*-\s*(\S+)", line)
                if m2:
                    lines.append(f"| {idx} | {m2.group(1)} |")
                    idx += 1
        lines += ["", "**Global budgets:**"]
        m = re.search(r"budgets:\s*\n((?:[ \t]+\w+:\s*\S+\n)+)", text)
        if m:
            for line in m.group(1).split("\n"):
                m2 = re.match(r"\s+(\w+):\s*(\S+)", line)
                if m2:
                    lines.append(f"- {m2.group(1)}: {m2.group(2)}")
        write_ref("rule-index.md", "Rule Index", "\n".join(lines))

    # ── 6. Profile index ───────────────────────────────────────────────
    prof_manifest = root / "profiles" / "manifest.yaml"
    lines = [
        "| Profile | Display Name | Enabled By Default | Platforms |",
        "|---|---|---|---|",
    ]
    if prof_manifest.exists():
        text = prof_manifest.read_text(encoding="utf-8")
        current = None
        pname = dname = enabled = plats = ""
        for line in text.split("\n"):
            m = re.match(r"^\s+([\w-]+):", line)
            if m:
                if current:
                    lines.append(f"| {pname} | {dname} | {enabled} | {plats} |")
                current = m.group(1)
                pname, dname, enabled, plats = current, "", "", ""
            elif re.match(r"displayName:\s*(.+)", line):
                dname = re.match(r"displayName:\s*(.+)", line).group(1).strip()
            elif re.match(r"enabledByDefault:\s*(.+)", line):
                enabled = re.match(r"enabledByDefault:\s*(.+)", line).group(1).strip()
            elif re.match(r"platforms:\s*\[(.+)\]", line):
                plats = re.match(r"platforms:\s*\[(.+)\]", line).group(1).strip()
        if current:
            lines.append(f"| {pname} | {dname} | {enabled} | {plats} |")
    write_ref("profile-index.md", "Profile Index", "\n".join(lines))

    # ── 7. Deprecation list ────────────────────────────────────────────
    lines = [
        "| Old Name / Path | Replacement | Source |",
        "|---|---|---|",
    ]
    legacy_map = root / "automation" / "legacy-context-path-map.json"
    if legacy_map.exists():
        data = json.loads(legacy_map.read_text(encoding="utf-8"))
        for old, new in sorted(data.items()):
            lines.append(f"| {old} | {new} | legacy-context-path-map.json |")
    reg_path2 = root / "integrations" / "registry.json"
    if reg_path2.exists():
        reg2 = json.loads(reg_path2.read_text(encoding="utf-8"))
        for t in reg2.get("integrations", []):
            for alias in t.get("deprecatedAliases", []):
                lines.append(f"| {alias} (alias) | {t['id']} | integration registry |")
    lines += [
        "| plans/ (legacy folder) | .agent/plans/ | validate-context.ps1 |",
        "| 00-index.md (legacy always-on) | 00-bootstrap.md | validate-context.ps1 |",
        "| Gemini CLI (product reference) | Antigravity (runtime binary is gemini) | docs/guides/06-platform-capability.md |",
    ]
    write_ref("deprecation-list.md", "Deprecation List", "\n".join(lines))

    count = len(list(out.glob("*.md")))
    print(f"Generated {count} reference documents in generated/references/")


if __name__ == "__main__":
    main()
