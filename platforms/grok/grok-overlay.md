---
alwaysApply: true
description: Grok-only runtime delta.
---

# Grok overlay

- Global runtime lives under `$GROK_HOME` or `~/.grok`.
- Use Grok-native hooks and inspection only inside Grok.
- Project `.grok/` contains only project config/pointers, never a copy of global core.
