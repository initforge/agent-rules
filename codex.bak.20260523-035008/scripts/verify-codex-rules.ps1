$ErrorActionPreference = "Stop"

$codexHome = "$env:USERPROFILE\.codex"

$required = @(
  "AGENTS.md",
  "rules\core.md",
  "rules\planning.md",
  "rules\execution.md",
  "rules\quality-gates.md",
  "rules\context-tools.md",
  "rules\tool-inventory.md",
  "rules\clean-code.md",
  "rules\codex-overlay.md",
  "docs\tool-registry.md",
  "docs\mcp-registry.md",
  "docs\skills-registry.md",
  "docs\skills-taxonomy.md",
  "docs\codex-research-workflow.md",
  "docs\profile-matrix.md",
  "docs\phase-orchestration.md",
  "scripts\bootstrap-install-tools.ps1",
  "scripts\verify-toolchain.ps1",
  "scripts\inventory-current-machine.ps1",
  "scripts\run-codex-research.ps1",
  "scripts\resolve-workflow-profile.ps1",
  "scripts\start-codex-phase.ps1",
  "scripts\resolve-plan-profile.ps1",
  "scripts\start-codex-from-plan.ps1"
)

Write-Host "== Codex home =="
Write-Host $codexHome
Write-Host ""

foreach ($r in $required) {
  $p = Join-Path $codexHome $r

  if (Test-Path $p) {
    Write-Host "[OK] $r"
  } else {
    Write-Host "[MISSING] $r"
  }
}

Write-Host ""
Write-Host "Suggested:"
Write-Host 'codex --ask-for-approval never "Explain loaded workflow, tool inventory, MCP registry, skills registry, and new-machine bootstrap policy."'
