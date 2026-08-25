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

Test-Contract "rules\00-intent-scope-safety.md" @(
  "Preserve raw user intent",
  "Challenge material conflicts",
  "traceability"
)
Test-Contract "rules\10-execution-planning-delegation.md" @(
  "advisory",
  "plan",
  "execution",
  "outcome",
  "Subagents default to zero",
  "max two",
  "no recursion",
  "S2/S3"
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
  "Coordinator",
  "Architect/integrator",
  "semantic budgets",
  "Independent review is mandatory",
  "Inspect only evidence"
)
Test-Contract "skills\finish-to-completion\SKILL.md" @(
  "execute pivot",
  "dependency-ready",
  "coordinator",
  "architect/integrator",
  "PARTIAL",
  "BLOCKED",
  "Delegate based on the five conditions",
  'orchestration `UNAVAILABLE`',
  "assignment acknowledgment"
)

foreach ($RelativePath in @(
  "rules\10-execution-planning-delegation.md",
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
