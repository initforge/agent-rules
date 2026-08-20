---
name: 5fedu-project
description: Use only after explicit 5fedu project/domain-pack activation. Route reusable 5fedu knowledge from the harness,
  keep project-specific truth in the active repository, and use the central manifest-bound ERP reference through the reference
  broker. Never activate from prompt wording and never require copying the template into the project.
---

# 5fedu project routing

## Activation

This skill is eligible only when the host/runtime has already activated the 5fedu project scope, for example `domain_pack: 5fedu`, `--domain-pack 5fedu`, or the explicit compatibility marker. Words such as `drawer`, `ERP`, `listview`, or `5fedu` in a prompt are not sufficient activation by themselves.

## Canonical source access

Do not install or copy the ERP template into the active repository.

```text
agent-rules reference 5fedu <manifest-bound-path>
agent-rules reference-search 5fedu <literal-query>
```

The central source receipt, source manifest, and behavior evidence are authoritative for template behavior. The active project remains authoritative for its own schema, routes, business facts and decisions.

## Implementation boundary

- Use `5fedu-module-parity` for module/UI parity work.
- Inspect exact source pointers before copying/adapting behavior.
- Never infer a target requirement merely because the reference template implements it.
- Never weaken verification or claim parity without runtime/browser evidence when visual behavior matters.
- Pencil is manual/explicit-only; do not activate it from task wording.

## Legacy compatibility

The installer script under this skill remains only for repositories that intentionally retain the historical `context/5fedu/` layout. North-Star projects do not need that installation step.
