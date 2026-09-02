---
name: context-evolution-protocol
description: "Modify/audit AGENTS.md, rules, skills, overlays, profiles, integrations after context drift."
metadata:
  signals: "ghi nhớ, bổ sung context, đừng lặp lại, đưa vào rule, dọn context, sync rule, context drift, agent rules behavior"
  excludes: "ordinary implementation"
  priority: "60"
  platform_scope: "all"
---

# Context Evolution Protocol

Change living agent behavior at its canonical owner without copying raw feedback
into every host or creating another policy layer.

## Placement

- Cross-project behavior and safety: `rules/`.
- Lazy task procedure: one existing `skills/<slug>/SKILL.md` when possible.
- Host-only differences: `platforms/<host>/`.
- Explicit domain knowledge: `profiles/<name>/`.
- Tool/provider capability and activation: `integrations/`.
- Generated and installed files: projection only; never hand-edit.

## Change contract

1. State the repeated failure in general terms and classify it as one-off,
   project-specific, profile-specific, global behavior, or raw evidence.
2. Search for the current owner and duplicate wording before editing.
3. Merge into the existing owner when it fits; add a file only when no cohesive
   owner exists.
4. Keep instructions imperative, short, and broad enough to remain correct in
   other projects. Preserve explicit-only activation boundaries.
5. Regenerate projections through the build and install pipeline.
6. Run typecheck plus the focused routing/rule test for the changed seam. Run
   the integrated release gate once when preparing a release candidate.
7. Confirm no stale duplicate, dead path, or conflicting host overlay remains.

For explicit maintenance audits, check architecture drift, duplicated canonical
logic, dead/stale documentation, stale skills, test health and generated
artifact drift. Report advisory findings unless they affect acceptance,
security, data or public correctness; never expand an implementation task into
background cleanup.

Do not create task history, raw-feedback archives, per-change receipts, or
mirror-specific copies solely to prove that the rule changed. The single owned
`.agent/current` active-task state is allowed; replacement/close removes the
previous state instead of archiving it.

Report only the behavior owner changed, the focused proof, and any real blocker.
