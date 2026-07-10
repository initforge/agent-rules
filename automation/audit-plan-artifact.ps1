param(
  [string]$Root = (Split-Path -Parent $PSScriptRoot),
  [string]$PlanPath = "",
  [string]$RunId = "audit-plan-artifact"
)
$ErrorActionPreference = "Stop"

$Problems = [System.Collections.Generic.List[string]]::new()

function Test-FileContains {
  param([string]$Path, [string[]]$Needles, [switch]$MustNotContain)
  if (-not (Test-Path $Path)) {
    $Problems.Add("Missing file: $Path")
    return $false
  }
  $Body = (Get-Content -Raw -Encoding UTF8 $Path)
  $Lower = $Body.ToLowerInvariant()
  foreach ($N in $Needles) {
    $Hit = $Lower -like "*$($N.ToLowerInvariant())*"
    if ($MustNotContain -and $Hit) {
      $Problems.Add("Forbidden pattern '$N' in $Path")
      return $false
    }
    if (-not $MustNotContain -and -not $Hit) {
      $Problems.Add("Missing keyword '$N' in $Path")
      return $false
    }
  }
  return $true
}

function Test-PlanFile {
  param([string]$Path)
  if (-not (Test-Path $Path)) {
    $Problems.Add("Plan file not found: $Path")
    return
  }
  $Body = Get-Content -Raw -Encoding UTF8 $Path
  $Sections = @(
    "Scope lock", "Context routing", "Phases", "Known-unknowns",
    "Plan QA", "HANDOFF", "preferred_tier", "min_tier"
  )
  foreach ($S in $Sections) {
    if ($Body -notlike "*$S*") {
      $Problems.Add("PAF plan missing section/field '$S' in $Path")
    }
  }
}

# --- Harness self-check ---
$TierRef = Join-Path $Root "skills\plan-and-handoff\references\capability-tier-routing.md"
$PafTemplate = Join-Path $Root "skills\plan-and-handoff\references\plan-artifact-template.md"
$PafExample = Join-Path $Root "skills\plan-and-handoff\references\example-5fedu-module-plan.md"
$SkillPath = Join-Path $Root "skills\plan-and-handoff\SKILL.md"
$ResearcherPath = Join-Path $Root "skills\researcher\SKILL.md"
$LifePath = Join-Path $Root "rules\25-task-lifecycle.md"
$AntigravityOverlay = Join-Path $Root "platforms\antigravity\antigravity-overlay.md"
$UiDetail = Join-Path $Root "projects\5fedu\domains\references\ui-delivery-detail.md"

foreach ($F in @($TierRef, $PafTemplate, $PafExample)) {
  if (-not (Test-Path $F)) { $Problems.Add("Missing required: $F") }
}

Test-FileContains $SkillPath @("Plan Architect", "Plan Scribe", "Plan Reviewer", "PAF", "HANDOFF", "decision tree") | Out-Null
Test-FileContains $SkillPath @("Path D") | Out-Null
Test-FileContains $ResearcherPath @("plan-and-handoff", "Do NOT") | Out-Null
Test-FileContains $LifePath @("capability-tier-routing", "Weak-first", "plan_id") | Out-Null
Test-FileContains $AntigravityOverlay @("L0", "researcher", "capability-tier-routing") | Out-Null
Test-FileContains $PafTemplate @("Scope lock", "Context routing", "Phases", "Known-unknowns", "Plan QA", "HANDOFF", "Revision protocol", "preferred_tier", "min_tier", "allowed_tiers") | Out-Null
Test-FileContains $UiDetail @("plan-artifact-template") | Out-Null

# Path C delegate - no long execute loop in plan-and-handoff
if (Test-Path $SkillPath) {
  $SkillBody = Get-Content -Raw -Encoding UTF8 $SkillPath
  if ($SkillBody -match "FOR each deliverable") {
    $Problems.Add("plan-and-handoff duplicates finish-to-completion loop - Path C should delegate only")
  }
  if (($SkillBody | Select-String -Pattern "finish-to-completion" -AllMatches).Matches.Count -lt 1) {
    $Problems.Add("plan-and-handoff Path C must delegate to finish-to-completion")
  }
}

# Conflict: rigid Flash-only / Opus-only in rules and skills (not in examples)
$RigidPatterns = @("flash only", "opus only", "flash → scribe | executor only", "cấm flash")
foreach ($CheckPath in @($LifePath, $SkillPath, $AntigravityOverlay)) {
  if (Test-Path $CheckPath) {
    $Lower = (Get-Content -Raw -Encoding UTF8 $CheckPath).ToLowerInvariant()
    foreach ($P in $RigidPatterns) {
      if ($Lower -like "*$P*") {
        $Problems.Add("Rigid model binding '$P' in $CheckPath - use tier routing instead")
      }
    }
  }
}

# researcher vs plan boundary
if ((Test-Path $ResearcherPath) -and (Test-Path $SkillPath)) {
  $PlanDesc = (Get-Content -Raw -Encoding UTF8 $SkillPath)
  if ($PlanDesc -notmatch "Do NOT use.*researcher") {
    $Problems.Add("plan-and-handoff description should Do NOT use for researcher-only")
  }
}

# Optional plan file validation
if ($PlanPath) {
  Test-PlanFile $PlanPath
}

if ($Problems.Count -gt 0) {
  $Problems | ForEach-Object { Write-Host "FAIL: $_" }
  exit 1
}

Write-Host "PASS: plan artifact audit (harness$(if ($PlanPath) { " + plan file" }))"
exit 0
