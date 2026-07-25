# Codex custom subagents

Install these TOML definitions to `$CODEX_HOME/agents/`. They are native custom
subagent definitions, not CLI configuration profiles. All roles resolve model and effort from `model-policy.json` logical classes (utility, economy, standard, expert)
through the platform adapter; only the implementer can write inside the workspace.

Role mapping:

- coordinator — filled by the main agent; no separate agent file
- architect/integrator — filled by the main agent or a designated senior subagent
- `agent_rules_researcher` → researcher/utility worker
- `agent_rules_implementer` → implementer
- `agent_rules_reviewer` → reviewer
- `agent_rules_verifier` → verifier

The `agent_rules_` namespace prevents collisions with generic user-owned agents.

Use the expert class only after an explicit expert trigger: unresolved high-risk
reasoning, security-sensitive decisions, or a repeated failure that needs a
different approach. See `capability-tier-routing.md` for escalation triggers.
