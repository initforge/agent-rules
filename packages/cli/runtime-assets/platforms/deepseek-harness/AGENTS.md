# DeepSeek Harness runtime

- Canonical source: `__AGENT_RULES_ROOT__`.
- Install: `npm i -g @deepseek-ai/dsh` (developer preview).
- Projection: managed Cordis bundle/profile via `dsh plugin --profile <name> add <package>`.
- Never patch DSH source. Never hand-edit a user manifest.
- Before every supervised launch: verify bundle hash + `dsh --dump-config` fingerprint.
- Missing/disabled guard -> BLOCKED, never silently allowed.
- Consumer repo cannot modify managed bundle/profile authority.
- DSH "turn completed" is a host observation, never a terminal PASS.
- Report `PASS`, `PARTIAL`, or `BLOCKED` with verification evidence.
