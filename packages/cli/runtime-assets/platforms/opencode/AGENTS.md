# OpenCode runtime

- Canonical source: `__AGENT_RULES_ROOT__`.
- Runtime mirror: project `.opencode/` or `~/.config/opencode/`.
- At session start, read `__AGENT_RULES_ROOT__/rules/manifest.yaml`, then read
  every rule in its `load_order` from `__AGENT_RULES_ROOT__/rules/`.
- Discover procedures lazily through OpenCode's native `skill` tool. Harness
  skills are installed under the OpenCode runtime `skills/` directory.
- Do not commit, push, or deploy unless explicitly requested.
- Report `PASS`, `PARTIAL`, or `BLOCKED` with verification evidence.
