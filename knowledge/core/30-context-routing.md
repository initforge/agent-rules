---
alwaysApply: true
description: Progressive context loading and capability activation.
---

# Context routing

Load progressively:

1. Bootstrap and repository entrypoint.
2. Files/interfaces nearest the task.
3. One matching capability from its `SKILL.md` metadata.
4. Capability references/scripts only when the procedure requires them.
5. Project context index, then only domain packs matching the task.
6. External documentation only for unstable, unfamiliar or explicitly requested facts.

The `description` frontmatter of each capability is the trigger source of truth. Do not maintain a second handwritten trigger table. If multiple capabilities match, choose a primary capability and add only the minimum supporting set.

Code intelligence order: Codebase Memory MCP when available and indexed; otherwise `rg`, targeted reads and native navigation. Never preload an entire repository to compensate for a missing index.

Raw logs, chat evidence, old decisions and generated mirrors are never default context.
