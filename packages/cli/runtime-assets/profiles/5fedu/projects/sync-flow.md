# 5fedu source/context flow

## Canonical North-Star flow

There is no template sync into ordinary target repositories.

```text
owner-supplied ERP archive
        ↓ verify/archive receipt
agent-rules/profiles/5fedu/reference-source/template
        ↓ manifest-bound read/search
explicit 5fedu TaskPacket
        ↓ adapt against active project truth
active project implementation
```

Shared behavior must be grounded in `module-mapping/source-evidence.json`. Target-specific schema, routes, decisions and data stay in the target repository.

## Promotion flow

When implementation work reveals a reusable cross-project pattern:

1. keep the immediate project fix in the active repository;
2. review whether the lesson is truly generic;
3. promote only the generic rule/pattern into `profiles/5fedu/domains/` or another canonical pack file;
4. update source evidence when a template-owned behavior changes;
5. run 5fedu/domain-pack and source-integrity gates.

Never promote credentials, project-local facts, raw evidence, or app-specific decisions automatically.

## Legacy compatibility

`08-install-5fedu-context.ps1`, `10-export-5fedu-writeback.ps1`, and the historical `context/5fedu/` two-tier layout are retained for old projects. They are not required by North-Star and must not materialize/copy the bundled ERP reference source into a project.
