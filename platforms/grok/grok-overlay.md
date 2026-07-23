---
alwaysApply: true
description: Grok-only runtime delta.
---

# Grok overlay

- Global runtime: `$GROK_HOME` or `~/.grok`.
- Always-on inject path: `$GROK_HOME/.grok/rules`; the installer mirrors lean rules to `$GROK_HOME/rules` for doctor/manifest checks.
- Legacy dual trees and cross-platform overlays in the inject path are invalid and archived during install.
- Skills live at `$GROK_HOME/skills`; project `.grok/` contains config/pointers only.
- Use Grok-native hooks and inspection inside Grok.
- Live/manual UI proof loads `qa-skills` plus `browser-qa`.
- Restart or reload Grok after hook/rule installation.
- Linux and Windows are separate runtimes; never copy hook JSON with host-specific paths across operating systems.
- Native hooks inject routed context and record receipts. Stop is observational and fail-open; continuity comes from the adaptive work ledger, not forced continuation.
