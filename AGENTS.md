# Agent Rules repository

Canonical architecture:

- `knowledge/core/`: global always-loaded behavior.
- `knowledge/capabilities/`: lazy capabilities grouped by subsystem.
- `knowledge/project-context/`: project-context schema/templates.
- `integrations/`: external dependencies and platform adapters.
- `platforms/`: Codex/Grok/Antigravity deltas only.
- `automation/`: build, install and validation.

Read `knowledge/core/manifest.yaml` before harness changes. Never edit `build/` or global runtime mirrors as canonical source. Do not commit, push or deploy unless explicitly requested.
