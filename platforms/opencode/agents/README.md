# OpenCode custom agents

Install these Markdown files into `.opencode/agents/` (project) or
`~/.config/opencode/agents/` (global). OpenCode discovers agents by `.md`
files in these directories with YAML frontmatter.

Role mapping:

- `initforge-architect` → architect
- `initforge-implementer` → implementer
- `initforge-reviewer` → reviewer
- `initforge-verifier` → verifier
- `initforge-utility-worker` → utility worker

The `initforge-` namespace prevents collisions with generic user-owned agents.

Model mapping is user-configured in `opencode.json`. Each agent's `model`
field is set to `__OPENCODE_MODEL_CLASS__` at build time and resolved by the
installer to the user's configured OpenCode model ID. If the mapping is
"unset", the agent will fall back to the session default model.

Each agent carries a `permission` block that gates write/bash access.
The verifier and reviewer agents use restricted permissions by default.
