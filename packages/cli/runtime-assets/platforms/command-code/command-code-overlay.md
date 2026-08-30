# Command Code native integration (P3)

Command Code (`command-code` / `cmdc` on Windows, v1.28.4+) is a taste-learning
coding agent with native permission rules/modes, session-scoped mods,
progressive Skills, built-in isolated agents and structured headless
events.

## Surfaces (official current)

- Session-scoped mods: `--mod <path>` (repeatable); `--mod-option`.
- Native permissions: `--permission-mode default|plan|auto-accept|dont-ask`.
- Progressive Skills: `--no-skills` + selected `--skill <path>`.
- Headless: `-p/--print` with `--output-format json` (NDJSON AgentEvent frames).
- Plan mode: `--plan` remains fully host-owned.
- Worktrees: `-w/--worktree`.
- Taste: `cmd taste` / `npx taste`; never deleted/disabled/overwritten.

## Enforcement

- Native permission rules/modes are the primary hard boundary.
- The self-contained agent-rules mod embeds static canonical instructions and
  never spawns agent-rules, Node, Python or a router.
- Structured host events may feed evidence, but agent-rules does not install an
  interception callback.
- `--yolo` is never used for certification.
