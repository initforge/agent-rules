# Cursor custom agents

Install these Markdown files directly into `.cursor/agents/` (project) or
`~/.cursor/agents/` (user). Cursor's supported custom-agent frontmatter is
`name`, `description`, and `model`.

Role mapping:

- `agent-rules-researcher` → researcher
- `agent-rules-implementer` → implementer
- `agent-rules-reviewer` → reviewer
- `agent-rules-verifier` → verifier

The `agent-rules-` namespace prevents collisions with generic user-owned agents.

The build renders the implementation selector from model policy, the current staff-documented
custom-agent selector for Composer 2.5 Standard. Researcher, reviewer, and verifier
use the policy research/review selector and `readonly: true`; implementer explicitly uses
`readonly: false`.

The central model-policy validator should parse these exact frontmatter values and
reject a drift to a display-only Composer value or any Fast selector. The installer
must copy the files unchanged. Because Cursor has a known bug where a requested
custom-agent model can be ignored, activation is only verified after Cursor's UI
shows the selected and effective model. A mismatch or unobservable model is PARTIAL,
and a mutation role must not proceed. Do not substitute built-in subagents where a
plan can force the prohibited Fast variant.

Evidence:

- <https://cursor.com/composer>
- <https://forum.cursor.com/t/subagent-model-choice-not-respected/163645/10>
- <https://docs.x.ai/developers/grok-4-5>
