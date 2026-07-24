# Codex custom subagents

Install these TOML definitions to `$CODEX_HOME/agents/`. They are native custom
subagent definitions, not CLI configuration profiles. All roles use
the model-policy standard selector and effort; only the implementer can write inside
the workspace.

Role mapping:

- `agent_rules_researcher` → researcher
- `agent_rules_implementer` → implementer
- `agent_rules_reviewer` → reviewer
- `agent_rules_verifier` → verifier

The `agent_rules_` namespace prevents collisions with generic user-owned agents.

Use the model-policy expert selector only after an explicit expert trigger: unresolved high-risk
reasoning, security-sensitive decisions, or a repeated failure that needs a
different approach.
