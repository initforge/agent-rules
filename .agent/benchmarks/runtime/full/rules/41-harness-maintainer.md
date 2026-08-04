---
alwaysApply: false
description: Complete ruleset for agent-rules harness maintenance, sync, build, install, and governance. Trigger when modifying or auditing rules, skills, integrations, platforms, or automation scripts (sửa agent-rules harness, thay đổi rules, cập nhật skill, sửa automation).
---

# Harness maintainer & governance

## 1. Canonical Ownership
- `rules/`: Platform-neutral always-loaded behavior.
- `skills/`: Lazy procedures grouped by subsystem.
- `projects/`: Project context and templates.
- `integrations/`: External tools, manifests, adapters, and policy.
- `platforms/<name>/`: Platform delta only.
- `automation/`: Build, install, validation, and sync guards.

Always edit canonical source first. Build outputs and global runtimes are generated targets and must never be reverse-merged by timestamp. Runtime import requires an explicit reviewed diff.

## 2. Sync Governance (Outbound & Inbound)
- **Outbound (Canonical -> Runtime/Project):**
  - Build: Run `automation/01-build-runtime.ps1` to populate `05-generated/runtime-build/`.
  - Install: Run `automation/02-install-runtime.ps1` (wipes target before copy; does not retain untracked files outside the manifest).
  - Doctor: Run `automation/09-doctor.ps1` post-install to verify integrity.
- **Inbound (Target Repo -> Canonical):**
  - Run `automation/07-import-reviewed-changes.ps1` only after diff review.
  - Classify as `global` | `skill` | `project` | `evidence` | `legacy`.
  - **Tombstones:** Never import back deleted skills/rules. Check `.agent/tombstones/` to audit deletion history.
  - Evidence/legacy cannot be promoted to active global rules directly.
- **Abide by evolution:** When changing context in runtime or repository subfolders, always find and update the source files in `agent-rules` first.

## 3. Context Evolution & Promotion Gate
Before promoting feedback or learning items into living context, answer these checks:
1. What exact failure did the agent make?
2. Is the root cause missing context, wrong layer, duplicated context, weak trigger, or bad verification?
3. Which layer owns the fix: project-local, 5fedu-common, global rule, skill, workflow, or script?
4. Can the rule be written as a broader pattern without losing enforcement?
5. Could this wording mislead another domain or platform?
6. Does an existing rule already cover it?
7. What file should change, and what files must not change?
8. What verification proves the new context is installed and reachable?

Classify feedback before editing:
- `one-off`: Only affects the current task.
- `project-specific`: Appends to project-local context.
- `5fedu-common`: Appends to 5fedu living rule/template.
- `global-agent-rule`: Appends to `rules/**` or a shared capability.
- `raw-evidence`: Chat/log/example kept for traceability (put under archive/backlog).
- `question`: Missing owner/spec decision (put under `open-questions.md`).

Keep always-loaded changes short enough to stay within the manifest budgets. Put durable, reusable instructions before variable project facts; put volatile examples, raw evidence, and long domain details behind indexes, skills, or references.
