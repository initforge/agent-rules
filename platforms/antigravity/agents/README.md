# Antigravity custom agents

Install each dedicated role directory unchanged under
`~/.gemini/config/agents/<role>/agent.md`. Antigravity discovers custom agents by
subdirectory; each `agent.md` uses native YAML frontmatter plus a system-instruction
body.

Role mapping:

- `agent-rules-researcher` → researcher
- `agent-rules-implementer` → implementer
- `agent-rules-reviewer` → reviewer
- `agent-rules-verifier` → verifier

The `agent-rules-` directory/name namespace prevents collisions with generic
user-owned agents.

All roles use `model: inherit` because an exact per-agent model selector and effort
override are not confirmed. Before invoking a role, the host session must visibly
resolve the supported medium-or-higher route and exclude any policy-denied model.
The exceptional expert route is only for unresolved high-risk reasoning,
security-sensitive decisions, or repeated failure requiring a different approach.
If the inherited model/effort is banned or cannot be observed, status is PARTIAL;
these source files do not claim enforcement.

Source schema and discovery note:
<https://antigravity.google/docs/cli/commands/agents>
