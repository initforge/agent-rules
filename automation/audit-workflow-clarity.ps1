param([string]$Root = (Split-Path -Parent $PSScriptRoot))
$ErrorActionPreference = "Stop"
$Problems = [System.Collections.Generic.List[string]]::new()

function Test-Contract {
  param([string]$RelativePath, [string[]]$Patterns)
  $Path = Join-Path $Root $RelativePath
  if (-not (Test-Path -LiteralPath $Path)) {
    $Problems.Add("Missing file: $RelativePath")
    return
  }
  $Body = Get-Content -Raw -Encoding UTF8 -LiteralPath $Path
  foreach ($Pattern in $Patterns) {
    if ($Body -notmatch $Pattern) {
      $Problems.Add("$RelativePath missing workflow contract: $Pattern")
    }
  }
}

Test-Contract "rules\00-bootstrap.md" @(
  "native Plan Mode",
  "explicit execute pivot",
  "Ask only a question",
  "main agent accountable"
)
Test-Contract "rules\10-execution.md" @(
  "observable outcome",
  "Classify risk before work shape",
  "own orchestration",
  "local blocker does not stop independent work",
  "Match evidence to the claim",
  "build/lint proves static compatibility"
)
Test-Contract "rules\25-task-lifecycle.md" @(
  "advisory",
  "plan",
  "execution",
  "small",
  "medium",
  "large",
  "resumable",
  "not a file-count",
  "zero main-agent domain work",
  "separately from orchestration"
)
Test-Contract "skills\plan-and-handoff\references\adaptive-work-protocol.md" @(
  "Automatic execution",
  "Meaningful questions",
  "economy",
  "standard",
  "expert",
  "risk-triggered",
  "ledger",
  "pending",
  "acknowledged",
  "recovery",
  "control-plane exception",
  "semantic budgets",
  "Independent review is mandatory",
  "Inspect only evidence"
)
Test-Contract "skills\finish-to-completion\SKILL.md" @(
  "execute pivot",
  "dependency-ready",
  "main agent",
  "PARTIAL",
  "BLOCKED",
  "zero main-agent domain work",
  'orchestration `UNAVAILABLE`',
  "assignment acknowledgment"
)

foreach ($RelativePath in @(
  "rules\00-bootstrap.md",
  "rules\10-execution.md",
  "rules\25-task-lifecycle.md",
  "skills\plan-and-handoff\SKILL.md",
  "skills\finish-to-completion\SKILL.md"
)) {
  $Body = Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path $Root $RelativePath)
  foreach ($Forbidden in @("HB-1", "PLAN_PASS", "SLICE_PASS", "file-count gate", "Stop-hook admission")) {
    if ($Body -match [regex]::Escape($Forbidden)) {
      $Problems.Add("$RelativePath retains obsolete ceremony: $Forbidden")
    }
  }
}

if ($Problems.Count -gt 0) {
  $Problems | ForEach-Object { Write-Host "FAIL: $_" }
  exit 1
}

Write-Host "PASS: adaptive workflow clarity audit"
