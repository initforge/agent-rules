# Bootstrap New Machine

## Goal

Restore Codex operating system from:

```text
P:\agent-rules\codex
```

into:

```text
C:\Users\ADMIN\.codex
```

## Steps

1. Prepare folders

```powershell
New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.codex"
New-Item -ItemType Directory -Force -Path "P:\agent-rules"
```

2. Copy Codex setup

```powershell
Copy-Item "P:\agent-rules\codex\*" "$env:USERPROFILE\.codex\" -Recurse -Force
```

3. Verify files

```powershell
& "$env:USERPROFILE\.codex\scripts\verify-codex-rules.ps1"
```

4. Install missing tools baseline

```powershell
& "$env:USERPROFILE\.codex\scripts\bootstrap-install-tools.ps1"
```

5. Verify toolchain

```powershell
& "$env:USERPROFILE\.codex\scripts\verify-toolchain.ps1"
```

6. Inventory current machine

```powershell
& "$env:USERPROFILE\.codex\scripts\inventory-current-machine.ps1"
```

7. Install or finish any remaining manual tools

Read:
- `docs\tool-registry.md`
- `docs\mcp-registry.md`
- `docs\skills-registry.md`
- `docs\codex-research-workflow.md`
- `docs\profile-matrix.md`
- `docs\clean-code-reference.md`
- `docs\phase-orchestration.md`

Install missing tools manually or via package manager.

Do not install secrets.

8. Verify Codex understanding

```powershell
codex --ask-for-approval never "Explain the loaded Codex runtime workflow and list missing tools/MCP/skills from the registries."
```

9. Verify orchestration helpers

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "$env:USERPROFILE\.codex\scripts\resolve-workflow-profile.ps1" -Phase research
powershell -NoProfile -ExecutionPolicy Bypass -File "$env:USERPROFILE\.codex\scripts\start-codex-phase.ps1" -Phase implement -Prompt "Execute the active plan file." -DryRun
powershell -NoProfile -ExecutionPolicy Bypass -File "$env:USERPROFILE\.codex\scripts\resolve-plan-profile.ps1" -PlanFile .\plan\sample.md
powershell -NoProfile -ExecutionPolicy Bypass -File "$env:USERPROFILE\.codex\scripts\start-codex-from-plan.ps1" -PlanFile .\plan\sample.md -DryRun
```

10. Sync back after changes

```powershell
& "$env:USERPROFILE\.codex\scripts\sync-codex-to-p.ps1"
```

## Secret handling

Never store secret values in docs.

Store only:
- env var names
- where to set them
- verify command that does not print value
