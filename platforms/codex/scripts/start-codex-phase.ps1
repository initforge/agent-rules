param(
  [Parameter(Mandatory=$true)][ValidateSet("plan","research","implement","bugfix","review")][string]$Phase,
  [string]$Prompt,
  [string]$Workdir = ".",
  [ValidateSet("low","medium","high")][string]$Risk = "medium",
  [switch]$LargeArchitecture,
  [switch]$BugStillStuck,
  [switch]$DryRun
)

$profileInfoJson = & "$env:USERPROFILE\.codex\scripts\resolve-workflow-profile.ps1" `
  -Phase $Phase `
  -Risk $Risk `
  -LargeArchitecture:$LargeArchitecture `
  -BugStillStuck:$BugStillStuck `
  -UseJson

$profileInfo = $profileInfoJson | ConvertFrom-Json

$planRoot = Join-Path (Resolve-Path -LiteralPath $Workdir).Path "plan"
$mustValidatePlan = $Phase -in @("implement", "bugfix", "review")

if ($mustValidatePlan -and (Test-Path -LiteralPath $planRoot)) {
  powershell -NoProfile -ExecutionPolicy Bypass -File "$env:USERPROFILE\.codex\scripts\validate-plan-structure.ps1" -PlanRoot $planRoot
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
}

$cmd = @(
  "codex",
  "-m", $profileInfo.model,
  "-c", "model_reasoning_effort=`"$($profileInfo.effort)`"",
  "-C", $Workdir
)

if (-not [string]::IsNullOrWhiteSpace($Prompt)) {
  $cmd += $Prompt
}

if ($DryRun) {
  Write-Host "Phase:   $($profileInfo.phase)"
  Write-Host "Profile: $($profileInfo.profile)"
  Write-Host "Model:   $($profileInfo.model)"
  Write-Host "Effort:  $($profileInfo.effort)"
  Write-Host "Command: $($cmd -join ' ')"
  exit 0
}

& $cmd[0] $cmd[1..($cmd.Length-1)]
