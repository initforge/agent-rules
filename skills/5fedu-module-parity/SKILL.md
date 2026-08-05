---
name: 5fedu-module-parity
description: Route a 5fedu ERP module to its verified reference role. Loaded only when the owner activates the 5fedu profile and asks for module-mapping or parity advice. Never activates from prose alone.
priority: 30
default: false
---

# 5fedu module parity

This skill exists so the harness can route a 5fedu ERP module to a
verified reference role without carrying vendored source into the
live profile. The canonical mapping lives in
`profiles/5fedu/module-mapping/modules.yaml`. This skill only
re-exports that mapping at a path the activation rules expect.

## What this skill does NOT do

- It does not load vendored source files. Vendored source stays in
  `profiles/5fedu/` and is excluded from the live profile by the
  profile-isolation rule.
- It does not change parity conclusions on its own. Parity is decided
  by the parity runner, which consults `profiles/5fedu/module-mapping/`
  and the active project's parity packet.

## Activation

The activation rule lives in `profiles/5fedu/profile.yaml` and only
fires for prompts that explicitly reference 5fedu module mapping or
5fedu parity. A bare mention of "the ERP" never activates this skill.

## Routing metadata

```json
{"max_route_tokens":1500,"priority":30,"default":false}
```