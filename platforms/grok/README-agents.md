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

The default session invocation is `grok --model grok-4.5 --effort medium`.
Each role also requests Grok 4.5 at medium reasoning effort. The native role and
spawn schema supports per-role/per-spawn effort; use high only for the explicit
expert trigger described in the persona. No retired or unsupported speed-variant
model slug is used.
