# Codex Overlay Loader

This file is a compatibility entrypoint for projects that still import:

```text
@P:\agent-rules\codex-overlay.md
```

The maintained Codex overlay now lives in:

```text
@P:\agent-rules\codex\rules\codex-overlay.md
```

Runtime source:

```text
C:\Users\DELL\.codex
```

Sync/bootstrap mirror:

```text
P:\agent-rules\codex
```

## Compatibility Summary

- Use Vietnamese with full diacritics for user-facing text by default.
- Use `codex-research` for structured research.
- Use `workflow-router` and plan metadata for phase/profile routing.
- Use GitNexus for broad impact and shared-code refactor checks when indexed.
- Keep project-level `AGENTS.md` thin and project-specific.

