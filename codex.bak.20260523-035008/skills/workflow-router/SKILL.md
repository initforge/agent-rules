---
name: workflow-router
description: Use this skill when Codex needs to decide which native workflow phase to run next and which model/profile to apply. Trigger for tasks that must move between planning, research, implementation, bug fixing, and review while keeping model choice controlled and quota-aware.
---

# Workflow Router

Use this skill to turn a task into the correct working phase.

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
