# MiMoCode runtime

- Canonical source: `__AGENT_RULES_ROOT__`.
- Runtime mirror: `~/.config/mimocode/` or `~/.local/share/mimocode/`.
- Project-local MiMoCode resources live under `.mimocode/`; agent-rules platform builds/installers materialize the selected portable skills instead of hard-coding repository-absolute skill paths.
- Do not commit, push, or deploy unless explicitly requested.
- Report `PASS`, `PARTIAL`, or `BLOCKED` with verification evidence.
