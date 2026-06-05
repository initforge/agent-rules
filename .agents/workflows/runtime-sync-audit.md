---
description: Compare current Codex runtime against the P: backup without overwriting local config.
---

# Runtime Sync Audit

1. Compare the local Codex runtime (at `~/.codex` or equivalent) against the master backup repository at `P:\agent-rules\codex`.
2. Do not overwrite the local config at `~/.codex/config.toml` unless the user explicitly asks.
3. Hash-check these files directly:
   - `AGENTS.md`
   - `AGENTS.core.md`
   - `RTK.md`
   - `config.toml`
4. Recursively compare these folders:
   - `agents`
   - `docs`
   - `inventory`
   - `prompts`
   - `rules`
   - `scripts`
   - `skills`
   - `templates`
5. Ignore runtime state/log/cache/database files unless the user asks.
6. Report only meaningful differences:
   - Only in runtime
   - Only in backup
   - Different content
   - Local config that should not be synced
7. End with `PASS` if no action is needed, `PARTIAL` if differences remain by design, or `BLOCKED` if comparison cannot complete.
