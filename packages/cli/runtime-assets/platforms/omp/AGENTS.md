# OMP native runtime

- Canonical source: `__AGENT_RULES_ROOT__`.
- Native global entrypoint: active OMP `AGENTS.md` under
  `PI_CODING_AGENT_DIR` (default `~/.omp/agent`).
- OMP discovers skills natively at `skills/<name>/SKILL.md`; only one level is
  scanned, so every installed skill must keep that exact layout.
- OMP may import other agents' configuration, but imported files are never
  evidence that this OMP-native projection is installed.
- Do not commit, push, deploy, or change MCP configuration unless the owner
  explicitly authorized it.
