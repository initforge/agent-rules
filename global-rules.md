# Global Runtime Loader

This file is a compatibility entrypoint for projects that still import:

```text
@P:\agent-rules\global-rules.md
```

The maintained Codex runtime now lives under:

```text
P:\agent-rules\codex
```

Load and obey these files:

```text
@P:\agent-rules\codex\rules\core.md
@P:\agent-rules\codex\rules\planning.md
@P:\agent-rules\codex\rules\execution.md
@P:\agent-rules\codex\rules\quality-gates.md
@P:\agent-rules\codex\rules\context-tools.md
@P:\agent-rules\codex\rules\tool-inventory.md
```

## Language Compatibility Rule

- Answer in Vietnamese with full diacritics by default.
- Do not write non-accented Vietnamese unless the user explicitly requests ASCII-only text or the target file already has a deliberate ASCII-only convention.
- Keep commands, paths, APIs, package names, model names, and code symbols in English.

