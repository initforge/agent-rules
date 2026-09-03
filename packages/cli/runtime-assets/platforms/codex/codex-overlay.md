---
alwaysApply: true
description: Codex-only runtime delta.
---

# Codex overlay

- Use native Plan Mode, file links, patch edits and multi-agent delegation.
- Preserve user changes in dirty worktrees.
- Prefer source tracing, typecheck, tests, API/DB queries and artifact inspection. Use browser automation for live/manual UI proof or when other evidence cannot prove the claim.
- Owner-requested deep UI QA uses `exploratory-testing` plus `playwright-cli`.
- Treat mojibake as a harness defect: repair UTF-8 at canonical source and verify it.
- Global runtime lives under `$CODEX_HOME` or `~/.codex`; project `.codex/` contains project config/pointers only.
- Native global instructions and skills provide context without agent-rules hooks or a runtime callback.
- Installer smoke is `ADAPTER_PASS`. A matching event becomes `NATIVE_OBSERVED`; local state alone never claims independently verified host delivery.
