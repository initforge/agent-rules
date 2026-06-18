param(
  [Parameter(Mandatory=$true)][string]$PlanFile,
  [ValidateSet("auto","primary","escalation","review")][string]$Lane = "auto",
  [switch]$UseJson
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $PlanFile)) {
  throw "Missing plan file: $PlanFile"
}

$raw = Get-Content -Raw $PlanFile

function Get-MatchValue($pattern) {
  $m = [regex]::Match($raw, $pattern, [System.Text.RegularExpressions.RegexOptions]::Multiline)
  if ($m.Success) { return $m.Groups[1].Value.Trim() }
  return $null
}

$status = Get-MatchValue '^Status:\s*(.+)$'
$risk = Get-MatchValue '^Risk tier:\s*(.+)$'
$phase = Get-MatchValue '^Current phase:\s*(.+)$'
$primary = Get-MatchValue '^- Primary profile:\s*(.+)$'
$escalation = Get-MatchValue '^- Escalation profile:\s*(.+)$'
$review = Get-MatchValue '^- Review profile:\s*(.+)$'

if (-not $phase) {
  if ($primary -in @("planner","researcher","implementer","bugfixer","reviewer")) {
    switch ($primary) {
      "planner" { $phase = "plan" }
      "researcher" { $phase = "research" }
      "implementer" { $phase = "implement" }
      "bugfixer" { $phase = "bugfix" }
      "reviewer" { $phase = "review" }
    }
  } else {
    $phase = "implement"
  }
}

if (-not $risk) { $risk = "medium" }

$selectedLane = $Lane
if ($Lane -eq "auto") {
  if ($phase -eq "review") {
    $selectedLane = "review"
  } elseif ($status -eq "blocked" -and $escalation -and $escalation -ne "n/a") {
    $selectedLane = "escalation"
  } else {
    $selectedLane = "primary"
  }
}

$selectedProfile = switch ($selectedLane) {
  "primary" { $primary }
  "escalation" { $escalation }
  "review" { $review }
}

if ([string]::IsNullOrWhiteSpace($selectedProfile) -or $selectedProfile -eq "n/a") {
  throw "No usable profile found for lane '$selectedLane' in $PlanFile"
}

$largeArchitecture = $false
if ($phase -eq "plan" -and $risk -eq "high") {
  $largeArchitecture = $true
}

$bugStillStuck = $false
if ($selectedProfile -eq "bugfixer-escalated") {
  $bugStillStuck = $true
}

$profileInfoJson = & "$env:USERPROFILE\.codex\scripts\resolve-workflow-profile.ps1" `
  -Phase $phase `
  -Risk $risk `
  -LargeArchitecture:$largeArchitecture `
  -BugStillStuck:$bugStillStuck `
  -UseJson

$profileInfo = $profileInfoJson | ConvertFrom-Json
$result = [ordered]@{
  plan_file = (Resolve-Path $PlanFile).Path
  status = $status
  risk = $risk
  phase = $phase
  lane = $selectedLane
  profile = $selectedProfile
  model = $profileInfo.model
  effort = $profileInfo.effort
  reason = $profileInfo.reason
}

if ($UseJson) {
  $result | ConvertTo-Json -Depth 5
} else {
  Write-Host "Plan:    $($result.plan_file)"
  Write-Host "Status:  $($result.status)"
  Write-Host "Risk:    $($result.risk)"
  Write-Host "Phase:   $($result.phase)"
  Write-Host "Lane:    $($result.lane)"
  Write-Host "Profile: $($result.profile)"
  Write-Host "Model:   $($result.model)"
  Write-Host "Effort:  $($result.effort)"
  Write-Host "Reason:  $($result.reason)"
}
