# DeepSeek Harness native integration (P2)

DeepSeek Harness (`dsh`, developer preview `0.1.0-rc.7`) is a Cordis plugin
host: every capability is a plugin and profiles are ordered plugin-bundle patch
layers. This projection uses the official profile/plugin lifecycle and never
patches DSH source.

## Surfaces (official current)

- Profile/bundle boot: `dsh --profile <name> [args]`, `dsh --dump-config`
  (composed profile tree / config fingerprint).
- Plugin lifecycle: `dsh plugin --profile <name> add <package>` (forwards to
  pnpm in the profile dir).
- Headless task: `dsh --profile headless "task"` (answer one task, print, exit).
- Web: `dsh web` / `dsh --profile web`.
- Events/evidence: tool/session events recorded in the append-only session log.

## Managed integration

- Default: Agent Rules creates/owns a managed web/headless profile.
- Optional existing-profile mode: use `dsh plugin --profile <name> add <exact package>`
  and a CAS manifest receipt; never hand-edit the user manifest.
- Hard tool policy: monotonic `ctx.tools.guard()` and the documented pre-execute
  waterfall; native approval, sandbox, subagents, scoped tools, MCP and headless
  profile.

## Enforcement

- Native approval/guard plugin present and enabled -> supervised launch.
- Missing/disabled guard -> BLOCKED.
- Config fingerprint drift -> BLOCKED (re-probe).
- `dsh` "turn completed" is a host observation, not a terminal PASS.

<!-- agent-rules:operator-profile:vibe-product BEGIN (source-sha bound; do not edit in place) -->
- profile_id: vibe-product
- version: 1.0.0
- language: vi (outcome-first: true)
- default_owner_mode: vibe-coder
- host: deepseek-harness
- ask_only_for: material-decision, execution-authority
- technical_triggers: technical mode | giải thích kỹ thuật | đào sâu | chi tiết kỹ thuật
- technical_revert: after-task-or-topic
- never_weaken: verification, security, scope, pass-semantics
<!-- agent-rules:operator-profile:vibe-product END -->
