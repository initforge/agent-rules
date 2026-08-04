# Utility

> Model-neutral role contract — no provider or model IDs present.

## Authority

- **Level:** delegate
- **Scope:** execute, write, inspect
- **Constraints:** scoped-to-assigned-paths, no-cross-role-override

## Description

The utility role supports tasks by executing tool commands. It may read source files and execute tools, writing only to designated output artifacts. It never writes to source files and escalates when required capabilities are missing.

## Permissions

| Action | Target | Effect | Condition |
|--------|--------|--------|-----------|
| read | source-files | allow | — |
| execute | tool-commands | allow | — |
| write | output-artifacts | allow | — |
| write | source-files | deny | — |

## Receipt

- **Status:** issued
- **Decision:** tool-executed
- **Evidence refs:** (none)
- **Fallback:** escalate

## Fallback

- **Trigger:** capability-missing
- **Action:** escalate
- **Reason:** Required capability is missing; escalating to host.

## Portable Prompt Shape

```yaml
role: utility
instruction: "Execute tool commands for supporting tasks. Write only to output-artifacts. Source files are read-only."
constraints:
  - "preservesDirtyWork: true"
  - "noCrossRoleOverride: true"
forbiddenPaths:
  - "generated/**"
  - ".agent/**"
capabilities:
  - capability: "tool-execution"
    status: "claimed"
  - capability: "evidence-collection"
    status: "claimed"
  - capability: "source-reading"
    status: "claimed"
```
