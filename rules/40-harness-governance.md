---
alwaysApply: true
description: Canonical ownership, promotion and mirror governance.
---

# Harness governance

Canonical ownership:

- `rules/`: platform-neutral always-loaded behavior.
- `skills/`: lazy procedures grouped by subsystem.
- `projects/`: project context and templates.
- `integrations/`: external tools, manifests, adapters and policy.
- `platforms/<name>/`: only platform delta.
- `automation/`: build/install/validation/sync guards.

Edit canonical source first. Build outputs and global runtimes are generated targets and must never be reverse-merged by timestamp. Runtime import requires an explicit reviewed diff.

Reverse-sync guard: never copy installed runtime/admin/system skills back into `skills`. External/runtime-only skills stay outside canonical source unless the owner explicitly promotes their behavior into a small canonical rule or renamed project-owned capability.

Before promoting feedback, classify it as one-off, project-specific, domain-common, global rule, raw evidence or question. Do not promote raw project details into global context. Run duplicate, token-budget, reference and mirror-parity checks before installation.

Context addition gate:

1. Choose the narrowest owner: project context, 5fedu template, capability, platform overlay or core.
2. Search for existing wording and adjacent rules before adding new text.
3. Add stable rules to the earliest shared layer only when they apply across projects; otherwise add a pointer/index entry and keep detail lazy.
4. Keep always-loaded changes short enough to stay within the manifest budgets and avoid moving volatile facts into the prompt-cache prefix.
5. Validate encoding, token budgets, stale references and runtime mirrors after the edit.

