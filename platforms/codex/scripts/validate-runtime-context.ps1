param(
  [string]$Root = "$env:USERPROFILE\.codex",
  [switch]$CheckBackup,
  [string]$BackupRoot = "P:\agent-rules\codex"
)

$ErrorActionPreference = "Stop"

$problems = New-Object System.Collections.Generic.List[string]

function Add-Problem([string]$Message) {
  $problems.Add($Message) | Out-Null
}

function Test-TextFile([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) {
    Add-Problem "Missing file: $Path"
    return
  }

  $content = Get-Content -LiteralPath $Path -Raw -Encoding UTF8
  if ([string]::IsNullOrWhiteSpace($content)) {
    Add-Problem "Empty file: $Path"
  }
}

function Test-CodexRoot([string]$Base) {
  $required = @(
    "AGENTS.md",
    "RTK.md",
    "rules\00-runtime-and-intent.md",
    "rules\01-agent-workflow-sop.md",
    "rules\02-code-quality-and-debt.md",
    "rules\03-context-and-tools.md",
    "rules\04-skills-and-5fedu.md",
    "rules\05-harness-mutation-gate.md",
    "rules\06-opus-emulation-contract.md",
    "rules\codex-overlay.md",
    "rules\platform-boundary.md",
    "scripts\verify-codex-rules.ps1",
    "scripts\validate-task-evidence.ps1",
    "scripts\audit-technical-debt.ps1",
    "templates\task-evidence-template.md",
    "templates\technical-debt-register.md"
  )

  $legacy = @(
    "rules\core.md",
    "rules\prompt-intent-router.md",
    "rules\quality-gates.md",
    "rules\planning.md",
    "rules\execution.md"
  )

  foreach ($item in $required) {
    Test-TextFile (Join-Path $Base $item)
  }

  foreach ($item in $legacy) {
    $legacyPath = Join-Path $Base $item
    if (Test-Path -LiteralPath $legacyPath) {
      Add-Problem "Legacy rule still present (run sync-all-harness): $legacyPath"
    }
  }

  $agents = Join-Path $Base "AGENTS.md"
  if (Test-Path -LiteralPath $agents) {
    $raw = Get-Content -LiteralPath $agents -Raw -Encoding UTF8
    foreach ($item in $required | Where-Object { $_ -like "rules\*" }) {
      $leaf = Split-Path $item -Leaf
      if ($raw -notlike "*$leaf*") {
        Add-Problem "AGENTS.md does not reference $item"
      }
    }
  }
}

Write-Host "== Validate Codex runtime context (Opus-emulation harness) =="
Write-Host "Root: $Root"

Test-CodexRoot $Root

if ($CheckBackup -and (Test-Path -LiteralPath $BackupRoot)) {
  Write-Host "Backup: $BackupRoot"
  Test-CodexRoot $BackupRoot
}

if ($problems.Count -gt 0) {
  Write-Host ""
  Write-Host "Codex runtime validation: FAIL"
  foreach ($p in $problems) {
    Write-Host "  - $p"
  }
  exit 1
}

Write-Host ""
Write-Host "Codex runtime validation: PASS"
exit 0