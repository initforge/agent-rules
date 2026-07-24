# Grok Build role sources

Install `agents/` (including `agents/prompts/`) to `$GROK_HOME/agents/` and
`personas/*.toml` to `$GROK_HOME/personas/` (or their project `.grok/`
equivalents). Grok Build documents these two native locations and manages them
through `/agents` and `/personas`.

Role mapping:

- `agent-rules-researcher` → researcher
- `agent-rules-implementer` → implementer
- `agent-rules-reviewer` → reviewer
- `agent-rules-verifier` → verifier

The `agent-rules-` filename namespace prevents collisions with generic user-owned
agent types.

Use the current model-policy selector and minimum effort for the default session.
Each role is rendered from that policy at build time. The native role and spawn
schema supports per-role/per-spawn effort; use high only for the explicit expert
trigger described in the persona. Do not duplicate a selector in this source.
