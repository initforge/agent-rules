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

  $markers = @(
    [string][char]0x00C3,
    [string][char]0x00C2,
    [string][char]0x00C4,
    [string][char]0x00C6,
    [string][char]0xFFFD
  )
  foreach ($marker in $markers) {
    if ($content.Contains($marker)) {
      Add-Problem "Possible mojibake/encoding corruption: $Path"
      break
    }
  }
}

function Test-CodexRoot([string]$Base) {
  $required = @(
    "AGENTS.md",
    "RTK.md",
    "rules\core.md",
    "rules\root-cause-verification.md",
    "rules\prompt-intent-router.md",
    "rules\planning.md",
    "rules\execution.md",
    "rules\quality-gates.md",
    "rules\context-tools.md",
    "rules\tool-inventory.md",
    "rules\clean-code.md",
    "rules\technical-debt-control.md",
    "rules\codex-overlay.md",
    "scripts\verify-codex-rules.ps1",
    "scripts\validate-task-evidence.ps1",
    "scripts\audit-technical-debt.ps1",
    "templates\task-evidence-template.md",
    "templates\technical-debt-register.md"
  )

  foreach ($item in $required) {
    Test-TextFile (Join-Path $Base $item)
  }

  $agents = Join-Path $Base "AGENTS.md"
  if (Test-Path -LiteralPath $agents) {
    $raw = Get-Content -LiteralPath $agents -Raw -Encoding UTF8
    foreach ($item in $required | Where-Object { $_ -like "rules\*" -or $_ -eq "RTK.md" }) {
      $import = "@C:\Users\DELL\.codex\$item"
      if ($raw -notlike "*$import*") {
        Add-Problem "AGENTS.md does not import $item"
      }
    }
  }
}

Write-Host "== Validate Codex runtime context =="
Write-Host "Root: $Root"
Test-CodexRoot $Root

if ($CheckBackup) {
  Write-Host "BackupRoot: $BackupRoot"
  Test-CodexRoot $BackupRoot
}

if ($problems.Count -gt 0) {
  Write-Host "Runtime context validation: FAIL"
  foreach ($problem in $problems) {
    Write-Host "- $problem"
  }
  exit 1
}

Write-Host "Runtime context validation: PASS"
