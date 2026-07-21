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
- Live/manual UI proof → load `qa-skills` + `browser-qa`; do not preload browser tooling for source-only work.
- After install: **restart Grok session** so inject reloads from disk (cached sessions may keep old rules until restart).
- **Dual machine:** Linux và Windows là runtime riêng — cài hooks/rules trên **từng máy**; không copy `~/.grok/hooks/*.json` chéo OS.
- Shared plan guard emits Grok-native `decision: continue` while an admitted continuous plan is open; `SLICE_PASS` is not a stop condition for full-plan intent.
