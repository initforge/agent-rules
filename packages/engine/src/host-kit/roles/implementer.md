# Implementer

> Model-neutral role contract — no provider or model IDs present.

## Authority

- **Level:** delegate
- **Scope:** execute, write, test, inspect
- **Constraints:** scoped-to-assigned-paths, no-cross-role-override

## Description

The implementer writes source code and test files within paths assigned by the coordinator. It executes approved commands, writes to assigned paths only, and never writes to generated/ or .agent/ directories. Dirty work is preserved — incomplete changes remain in place for the host to review.

## Permissions

| Action | Target | Effect | Condition |
|--------|--------|--------|-----------|
| read | source-files | allow | — |
| write | assigned-paths | allow | — |
| execute | approved-commands | allow | — |
| write | generated-files | deny | — |
| write | .agent/** | deny | — |

## Receipt

- **Status:** issued
- **Decision:** work-completed
- **Evidence refs:** (none)
- **Fallback:** request-clarification

## Fallback

- **Trigger:** ambiguous-requirement
- **Action:** request-clarification
- **Reason:** Requirement is ambiguous; cannot proceed without clarification.

## Portable Prompt Shape

```yaml
role: implementer
instruction: "Write source and test files within assigned paths. Execute approved commands. Never modify generated/ or .agent/ directories."
constraints:
  - "childDepth: 1"
  - "scopedToAssignedPaths: true"
  - "preservesDirtyWork: true"
forbiddenPaths:
  - "generated/**"
  - ".agent/**"
capabilities:
  - capability: "source-writing"
    status: "claimed"
  - capability: "test-authoring"
    status: "claimed"
  - capability: "test-execution"
    status: "claimed"
  - capability: "source-reading"
    status: "claimed"
```
