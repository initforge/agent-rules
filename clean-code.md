# Clean Code Loader

This file is a compatibility entrypoint for projects that still import:

```text
@P:\agent-rules\clean-code.md
```

The maintained clean-code rules now live in:

```text
@P:\agent-rules\codex\rules\clean-code.md
```

Reference guide:

```text
P:\agent-rules\codex\docs\clean-code-reference.md
```

## Compatibility Summary

- Treat clean code as risk control, not cosmetic perfection.
- Allow tiny opportunistic cleanup only inside the touched local context.
- Require a plan, blast-radius check, and verification for guarded refactors.
- Require evidence before deleting dead code.
- Use GitNexus before deleting, renaming, moving, or refactoring shared symbols.
- Avoid style-only churn that does not reduce bug risk or future reading cost.

