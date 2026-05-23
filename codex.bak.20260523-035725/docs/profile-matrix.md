# Profile Matrix

## Purpose

Define which native Codex agent/profile should be used for each workflow stage.

## Default mapping

| Workflow | Agent profile | Model | Effort | Use when |
|---|---|---|---|---|
| Plan | `planner` | `gpt-5.5` | medium | default planning |
| Research | `researcher` | `gpt-5.4` | medium | docs, changelog, compare options, bug stalls |
| Implement | `implementer` | `gpt-5.3-codex` | medium | main code execution |
| Bug fix | `bugfixer` | `gpt-5.4` | medium | hard bug, unclear local root cause |
| Bug fix escalated | `bugfixer-escalated` | `gpt-5.5` | medium | bug still stuck after normal bugfix |
| Review | `reviewer` | `gpt-5.4` | medium | normal final review |
| High-risk review | `reviewer-highrisk` | `gpt-5.5` | high | auth, DB, queue, deploy, migration, large task |

## General rules

- Start planning with `planner`
- Use `researcher` before implementation when uncertainty is real
- Use `implementer` for the main coding pass
- Escalate to `bugfixer` when fixes stop converging
- Escalate to `bugfixer-escalated` only when the normal bugfix path still stalls
- Use `reviewer` by default
- Use `reviewer-highrisk` for large or sensitive changes

## Plan file integration

Plan files should specify:
- primary profile
- fallback/escalation profile
- review profile

This keeps profile selection visible inside the markdown artifact, not only in the agent list.

## Orchestration helpers

Use:
- `C:\Users\DELL\.codex\scripts\resolve-workflow-profile.ps1`
- `C:\Users\DELL\.codex\scripts\start-codex-phase.ps1`

These scripts make the profile map executable instead of purely documentary.
