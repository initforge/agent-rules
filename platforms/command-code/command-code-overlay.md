# Command Code native integration (P3)

Command Code (`command-code` / `cmdc` on Windows, v1.28.4+) is a taste-learning
coding agent with native permission rules/modes, session-scoped mods,
progressive Skills, built-in isolated agents, hooks and structured headless
events.

## Surfaces (official current)

- Session-scoped mods: `--mod <path>` (repeatable); `--mod-option`.
- Native permissions: `--permission-mode default|plan|auto-accept|dont-ask`.
- Progressive Skills: `--no-skills` + selected `--skill <path>`.
- Headless: `-p/--print` with `--output-format json` (NDJSON AgentEvent frames).
- Plan mode: `--plan` (certified separately — write-time hooks do not run there).
- Worktrees: `-w/--worktree`.
- Taste: `cmd taste` / `npx taste`; never deleted/disabled/overwritten.

## Enforcement

- Native permission rules/modes are the PRIMARY hard boundary.
- `beforeToolCall` mod + `PreToolUse` hooks are supplementary interception.
- Structured events/PostToolUse feed evidence.
- Because mod/hook errors can be skipped/fail-open:
  - the capability fingerprint must prove the native permission layer;
  - a mod/hook error yields terminal BLOCKED;
  - broker/worktree validation remains for invariants not expressible natively;
  - mutable unattended headless is NOT_LIVE_VERIFIED/UNSUPPORTED unless a hard
    denial is proven.
- `--yolo` is never used for certification.
