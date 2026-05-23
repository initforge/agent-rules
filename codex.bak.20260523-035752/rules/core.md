# Core Runtime Rules

## Trigger

Always active.

## Purpose

Defines baseline behavior for all Codex coding work.

## Language

- Answer in Vietnamese by default.
- User-facing Vietnamese must use full diacritics by default.
- Do not write non-accented Vietnamese such as `tieng Viet khong dau` unless the user explicitly asks for ASCII-only text or the target file already has a deliberate ASCII-only convention.
- Preserve Vietnamese diacritics when editing existing Vietnamese content.
- Keep code symbols, commands, paths, APIs, package names, and file names in English.
- Be concise for routine status updates and final reports.
- Expand only for debugging, architecture, risky changes, ambiguity, or planning.
- Do not use praise, marketing language, or long self-narration in final reports.

## Baseline execution contract

When the user asks to implement, fix, refactor, create, migrate, or change code:

1. Inspect the codebase first.
2. Check whether `plan/` exists.
3. If `plan/` exists, read `plan/00-index.md` if present, then the active plan file.
4. Do not stop at proposal unless the user explicitly asked for planning or discussion only.
5. Do not auto-commit.
6. Do not auto-push.
7. Do not force-push.
8. Do not bypass hooks without explicit permission.
9. Do not revert user changes unless explicitly asked.
10. Keep diffs small.
11. Explain scope expansion before doing it.
12. Verify before saying done.

## Docs skill guard

When the target path is under `/docs/**`, use the `docs-style` skill.
Do not apply that skill to `README.md`, `AGENTS.md`, `CHANGELOG.md`, or markdown outside `/docs/**` unless the user explicitly asks for that style there.

## Research skill guard

Use the `codex-research` skill when the task is primarily research, comparison, platform-doc reading, changelog review, or when a bug fix has stalled and needs evidence before another implementation attempt.

## Reference style

- Long-lived plans and notes: use `path:symbol` or `path/dir`.
- Exact review comments and bug reports: use `path:line`.
- Do not use `path:line` inside long-lived plan files unless it is temporary evidence.

## Default state machine

```text
REQUEST
-> classify risk
-> choose workflow
-> inspect targeted context
-> plan if needed
-> implement if authorized
-> verify
-> review if needed
-> record evidence/notes
-> final PASS/PARTIAL/BLOCKED report
```

## Runtime source

Runtime source is:

```text
C:\Users\DELL\.codex
```

Sync and backup source is:

```text
P:\agent-rules\codex
```

Do not require `P:\agent-rules` to exist during normal Codex work.

## Final report rule

Final reports must be short and structured:

```text
Status: PASS | PARTIAL | BLOCKED

Files changed:
- path/file

Verification:
- command/test -> pass/fail

Iteration:
- N attempts total, M retries
- key fix: ...

Remaining risk:
- none | ...

Plan files:
- plan/... -> done/blocked
```
