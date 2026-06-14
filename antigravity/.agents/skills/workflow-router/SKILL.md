---
name: workflow-router
description: Workflow phase router (Codex). ULTRA-SENSITIVE Turn-0 — activate when task spans plan/research/implement/bugfix/review phases, model/profile choice, quota, or unclear which phase next. Read SKILL.md first. Visible Echo required. Grok prefers /implement.
---

# Workflow Router

## Skill activation (cực nhạy — Turn-0)

Multi-phase/model routing → `Skill scan: … → workflow-router` + `Skill activated: workflow-router` visible → đọc file này.

Use this skill to turn a task into the correct working phase.

## Multi-skill coordination

When ≥2 skills match, build ordered stack (see `00-hard-activation-contract.md` Multi-Skill Stack). Router picks **phase**; stack picks **which skills stay active**. Update `Primary (this step)` on each phase change without dropping `Skills active`.

## Goal

Choose the correct phase:
- `plan`
- `research`
- `implement`
- `bugfix`
- `review`

Then apply the matching profile/model strategy defined by the local workflow.

## Inputs

Look at:
- user intent
- current plan file
- risk level
- whether a bug is stalled
- whether platform docs or latest behavior matter

## Decision rules

- ambiguous or broad task -> `plan`
- evidence gathering or docs lookup -> `research`
- clear approved execution slice -> `implement`
- unclear or stubborn defect -> `bugfix`
- final correctness pass -> `review`

Escalations:
- high-risk planning -> stronger planning effort
- stuck bug -> `bugfixer-escalated`
- large/high-risk review -> `reviewer-highrisk`

## Tools

Use:
- `scripts/resolve-workflow-profile.ps1`
- `scripts/start-codex-phase.ps1`
- plan templates that record the active profile

## Related references

Read:
- `references/phase-map.md`
