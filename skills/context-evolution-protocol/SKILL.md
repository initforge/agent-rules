---
name: context-evolution-protocol
description: Trigger-only protocol for learning from user feedback and evolving agent context safely. Use when modifying, promoting, deduplicating, or auditing AGENTS.md, rules, skills, workflows, .agents, .codex, 5fedu context, or when user feedback reveals repeated agent misunderstanding, context drift, over-specific rules, duplicated lessons, or requests like "ghi nhớ", "bổ sung context", "đưa vào rule", "đừng lặp lại", "context bị loạn", "dọn context", "sync rule". Do not use for ordinary coding tasks.
---

# Context Evolution Protocol

Skill scan: context-evolution-protocol
Skill activated: context-evolution-protocol

This is a trigger-only learning and context hygiene protocol. It prevents agents from "learning" by dumping raw feedback into always-loaded context or promoting one project's specific lesson into a global rule.

## Trigger

Use this skill when any of these signals appears:

- the user corrects agent behavior: "hiểu sai", "không phải vậy", "đừng làm kiểu đó", "sao lại tự chế", "t đã nói rồi";
- the same mistake repeats at least twice;
- the task modifies or audits `AGENTS.md`, `rules/**`, `skills/**`, `projects/**`, `platforms/**`, `automation/**`, `.agents/**`, `.codex/**`, project context, or runtime harness files;
- feedback, bug, owner correction, or project lesson may be promoted into a reusable rule;
- a context paragraph is too specific and could be written as a broader pattern;
- multiple files contain the same lesson with different wording;
- a proposed rule is long, example-heavy, or looks like raw chat/log evidence;
- a lesson moves between layers: project-local -> 5fedu-common -> global rule;
- the user says "học lại", "ghi nhớ", "bổ sung context", "lần sau", "đưa vào rule", "đừng lặp lại", "context bị loạn", "dọn context", "sync rule", or "agent làm bậy";
- before reporting `PASS` for any context/rule/skill/workflow/harness task.

Do not use this skill for ordinary coding, UI styling, bug fixes, or feature work unless one of the signals above is present.

## Non-Negotiables

- Do not auto-load this protocol for normal implementation.
- Do not write raw feedback directly into living rules.
- Do not promote a project-specific case into global/default context without abstraction.
- Do not add a new rule until duplicate/context-layer audit is done.
- Do not sync or push context changes before validation passes.

## Classification

Classify every learning item before editing:

| Class | Meaning | Destination |
|---|---|---|
| `one-off` | Only affects the current task | final note or active plan |
| `project-specific` | Applies to one repo/client | project-local context |
| `5fedu-common` | Applies broadly to 5fedu ERP/admin apps | 5fedu living rule/template |
| `global-agent-rule` | Applies across projects/platforms | `rules/**` or a shared capability |
| `raw-evidence` | Chat/log/example kept for traceability | archive/backlog, not default load |
| `question` | Missing owner/spec decision | `open-questions.md` or decision backlog |

If classification is unclear, keep it as `question` or `raw-evidence`; do not promote.

## Promotion Gate

Before promoting any lesson into living context, answer these checks:

1. What exact failure did the agent make?
2. Is the root cause missing context, wrong layer, duplicated context, weak trigger, or bad verification?
3. Which layer owns the fix: project-local, 5fedu-common, global rule, skill, workflow, or script?
4. Can the rule be written as a broader pattern without losing enforcement?
5. Could this wording mislead another domain or platform?
6. Does an existing rule already cover it?
7. What file should change, and what files must not change?
8. What verification proves the new context is installed and reachable?

## Abstraction Rule

Write reusable rules as business or engineering patterns, not as case dumps.

Good:
- "If spec/database has a real parent-child relationship, parent detail must expose child rows and verify rollups with real child records."

Bad:
- "Trip pages must show `vt_chuyen_xe_ct` inside `vt_chuyen_xe` detail."

Concrete examples are allowed only after the general rule and must be labeled as examples.

## Context Hygiene Checklist

Before editing:

- `rg` for existing wording, synonyms, file names, and rule concepts.
- Identify canonical source and mirrors.
- Check whether `.agents`, `.codex`, global runtime, and project-local copies will drift.
- Keep raw examples out of default-loaded files unless they are short examples under a broader rule.
- Prefer editing the smallest canonical file, then sync through scripts.

After editing:

- Sync source -> mirrors -> global runtime -> relevant projects.
- Verify with repository validators and runtime/preflight checks.
- Confirm no duplicate stale rule remains with conflicting wording.
- Report touched layers and final `PASS`, `PARTIAL`, or `BLOCKED`.

## Output Contract

For context/harness tasks, final report must include:

- `Classification`: one-off/project-specific/5fedu-common/global-agent-rule/raw-evidence/question
- `Layer changed`: source files and mirrors/runtime/project copies
- `Duplicate audit`: what was searched and what was consolidated
- `Verification`: commands/checks run
- `Status`: PASS/PARTIAL/BLOCKED


