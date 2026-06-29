---
alwaysApply: true
description: Canonical ownership, promotion and mirror governance.
---

# Harness governance

Canonical ownership:

- `knowledge/core/`: platform-neutral always-loaded behavior.
- `knowledge/capabilities/`: lazy procedures grouped by subsystem.
- `knowledge/project-context/`: templates/schema for repo-specific context.
- `integrations/`: external tools, pinned manifests and adapters.
- `platforms/<name>/`: only platform delta.
- `automation/`: build/install/validation of generated mirrors.

Edit canonical source first. Build outputs and global runtimes are generated targets and must never be reverse-merged by timestamp. Runtime import requires an explicit reviewed diff.

Before promoting feedback, classify it as one-off, project-specific, domain-common, global rule, raw evidence or question. Do not promote raw project details into global context. Run duplicate, token-budget, reference and mirror-parity checks before installation.
