# Phase Orchestration

## Purpose

Turn static model presets into a living workflow.

Codex does not natively auto-chain phase-specific profiles across a whole task.
This setup adds a practical orchestration layer that chooses the correct phase profile and can launch Codex with the matching model and effort.

## What is automatic

- phase-to-profile mapping is defined
- plan templates record the intended profile per slice
- scripts can resolve the correct phase profile automatically
- scripts can launch Codex with the mapped model and effort

## What is not native

The desktop app does not auto-detect phase changes and switch custom agents by itself.

This workflow solves that by:
- storing the intended phase/profile in plan markdown
- resolving the correct profile with `resolve-workflow-profile.ps1`
- launching the right phase with `start-codex-phase.ps1`
- resolving directly from a plan file with `resolve-plan-profile.ps1`
- launching directly from a plan file with `start-codex-from-plan.ps1`

## Phase mapping

| Phase | Profile | Model | Effort |
|---|---|---|---|
| plan | `planner` | `gpt-5.5` | `medium` by default, `high` for large/high-risk planning |
| research | `researcher` | `gpt-5.4` | `medium` |
| implement | `implementer` | `gpt-5.3-codex` | `medium` |
| bugfix | `bugfixer` | `gpt-5.4` | `medium` |
| bugfix escalated | `bugfixer-escalated` | `gpt-5.5` | `medium` |
| review | `reviewer` | `gpt-5.4` | `medium` |
| review high-risk | `reviewer-highrisk` | `gpt-5.5` | `high` |

## Scripts

Resolve a phase:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File C:\Users\DELL\.codex\scripts\resolve-workflow-profile.ps1 `
  -Phase research `
  -Risk medium
```

Preview launch command:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File C:\Users\DELL\.codex\scripts\start-codex-phase.ps1 `
  -Phase implement `
  -Workdir P:\open-claw-setup `
  -Prompt "Execute the active plan file." `
  -DryRun
```

Launch a phase:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File C:\Users\DELL\.codex\scripts\start-codex-phase.ps1 `
  -Phase review `
  -Workdir P:\open-claw-setup `
  -Prompt "Review the uncommitted changes." `
  -Risk high `
  -LargeArchitecture
```

Resolve directly from a plan file:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File C:\Users\DELL\.codex\scripts\resolve-plan-profile.ps1 `
  -PlanFile plan\feature\01-slice.md
```

Launch directly from a plan file:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File C:\Users\DELL\.codex\scripts\start-codex-from-plan.ps1 `
  -PlanFile plan\feature\01-slice.md `
  -DryRun
```

Auto lane selection rules:
- if `Current phase: review` -> use review lane
- if `Status: blocked` and escalation profile exists -> use escalation lane
- otherwise -> use primary lane

## Research trigger

Use `research` phase when:
- docs/platform behavior may have changed
- local repo context is not enough
- changelog/release notes matter
- a bug is looping after one or two fix attempts
- platform integration needs upstream docs before patching again

## Bugfix escalation

If a bug stays unresolved:
1. start with `bugfixer`
2. if still stuck, switch to `researcher`
3. if still blocked, escalate to `bugfixer-escalated`
