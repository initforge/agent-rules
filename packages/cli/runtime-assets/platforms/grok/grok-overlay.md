---
alwaysApply: true
description: Grok-only runtime delta.
---

# Grok overlay

- Global runtime: `$GROK_HOME` or `~/.grok`.
- Always-on inject path: `$GROK_HOME/.grok/rules`; the installer mirrors lean rules to `$GROK_HOME/rules` for doctor/manifest checks.
- Legacy dual trees and cross-platform overlays in the inject path are invalid and archived during install.
- Skills live at `$GROK_HOME/skills`; project `.grok/` contains config/pointers only.
- Use Grok-native rules, skills, MCP and inspection inside Grok.
- Live/manual UI proof loads `qa-skills` plus `browser-qa`.
- Restart or reload Grok after static rule installation.
- Linux and Windows are separate host surfaces; never copy host-specific config paths across operating systems.
- No agent-rules callback is installed.
