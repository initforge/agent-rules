# Phase 6e - Workflow hybrid audit (§E)
param(
  [string]$LogPath = (Join-Path (Split-Path -Parent $PSScriptRoot) ".cursor\debug-75fce4.log")
)
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

function Write-AuditLog {
  param([string]$HypothesisId, [string]$Location, [string]$Message, [hashtable]$Data)
  $entry = @{
    sessionId    = "75fce4"
    runId        = "workflow-clarity"
    hypothesisId = $HypothesisId
    location     = $Location
    message      = $Message
    data         = $Data
    timestamp    = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  } | ConvertTo-Json -Compress -Depth 6
  $dir = Split-Path -Parent $LogPath
  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
  Add-Content -LiteralPath $LogPath -Value $entry -Encoding UTF8
}

function Read-Text {
  param([string]$RelPath)
  $full = Join-Path $Root $RelPath
  if (-not (Test-Path $full)) { return $null }
  Get-Content -Raw -Encoding UTF8 $full
}

function Test-AllPatterns {
  param([string]$Text, [string[]]$Patterns)
  if (-not $Text) { return $false }
  foreach ($p in $Patterns) {
    if ($Text -notmatch $p) { return $false }
  }
  return $true
}

$checks = @(
  @{
    name     = "workflow_mode"
    files    = @("rules/25-task-lifecycle.md")
    patterns = @("Workflow mode", "plan-authoring")
  },
  @{
    name     = "plan_wall_hb1"
    files    = @("rules/25-task-lifecycle.md", "rules/10-execution.md")
    patterns = @("HB-1")
    anyFile  = $true
  },
  @{
    name     = "pivot_phrases"
    files    = @("rules/10-execution.md")
    patterns = @("Pivot phrases", "làm đi")
  },
  @{
    name     = "finish_execution"
    files    = @("rules/10-execution.md", "skills/finish-to-completion/SKILL.md")
    patterns = @("mode=", "execution")
    perFile  = $true
  },
  @{
    name     = "plan_first_end"
    files    = @("skills/plan-and-handoff/SKILL.md")
    patterns = @("Plan-first", "HB-1")
  },
  @{
    name     = "zones_doc"
    files    = @("guides/02-knowledge-system.md")
    patterns = @("Zone")
  },
  @{
    name     = "file_count_gate"
    files    = @("rules/25-task-lifecycle.md")
    patterns = @("File-count gate", "≥2")
  },
  @{
    name     = "normal_no_mandatory_plan"
    files    = @("rules/25-task-lifecycle.md")
    patterns = @("not every normal task")
  },
  @{
    name     = "plan_tier_routing"
    files    = @("rules/25-task-lifecycle.md", "skills/plan-and-handoff/references/capability-tier-routing.md")
    patterns = @("Weak-first", "L0")
    anyFile  = $true
  },
  @{
    name     = "paf_template"
    files    = @("skills/plan-and-handoff/references/plan-artifact-template.md")
    patterns = @("HANDOFF", "preferred_tier", "min_tier")
  },
  @{
    name     = "plan_paths_ad"
    files    = @("skills/plan-and-handoff/SKILL.md")
    patterns = @("Path A", "Path D", "decision tree")
  }
)

$failures = @()
Write-AuditLog -HypothesisId "W0" -Location "audit-workflow-clarity:start" -Message "Workflow clarity audit started" -Data @{ checks = $checks.Count }

foreach ($check in $checks) {
  $pass = $false
  if ($check.perFile) {
    $pass = $true
    foreach ($f in $check.files) {
      $text = Read-Text $f
      if (-not (Test-AllPatterns -Text $text -Patterns $check.patterns)) {
        $pass = $false
        break
      }
    }
  } elseif ($check.anyFile) {
    foreach ($f in $check.files) {
      $text = Read-Text $f
      if (Test-AllPatterns -Text $text -Patterns $check.patterns) {
        $pass = $true
        break
      }
    }
  } else {
    $text = Read-Text $check.files[0]
    $pass = Test-AllPatterns -Text $text -Patterns $check.patterns
  }

  Write-AuditLog -HypothesisId "W1" -Location "audit-workflow-clarity:check" -Message $check.name -Data @{ check = $check.name; pass = $pass }
  if (-not $pass) { $failures += $check.name }
}

if ($failures.Count -gt 0) {
  Write-Host "FAIL: $($failures -join ', ')"
  exit 1
}

Write-Host "PASS: workflow hybrid audit ($($checks.Count) checks)"
exit 0
