---
alwaysApply: true
description: Grok-only runtime delta.
---

# Grok overlay

- Global runtime: `$GROK_HOME` or `~/.grok`.
- **Always-on rules inject path:** `$GROK_HOME/.grok/rules` (Grok scans `<home>/.grok/rules`). Install also mirrors lean rules to `$GROK_HOME/rules` for doctor/manifest.
- **Legacy dual tree** (`00-index`, `01-agent-workflow-sop`, cross-platform overlays under inject path) is **invalid** — `02-install-runtime` archives it and writes lean only. Doctor fails if legacy markers return.
- Skills: `$GROK_HOME/skills` (not under `.grok/skills` for global user skills).
- Project `.grok/` = project config/pointers only — never a second global core copy.
- Use Grok-native hooks/inspection only inside Grok.
- Deep/manual/UI QA → combo `qa-skills` + `browser-qa`; dual MCP: Playwright + Chrome DevTools.
- After install: **restart Grok session** so inject reloads from disk (cached sessions may keep old rules until restart).
