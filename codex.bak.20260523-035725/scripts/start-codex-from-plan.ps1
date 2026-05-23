param(
  [Parameter(Mandatory=$true)][string]$PlanFile,
  [ValidateSet("auto","primary","escalation","review")][string]$Lane = "auto",
  [string]$Prompt,
  [string]$Workdir = ".",
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

$resolvedJson = & "$env:USERPROFILE\.codex\scripts\resolve-plan-profile.ps1" `
  -PlanFile $PlanFile `
  -Lane $Lane `
  -UseJson

$resolved = $resolvedJson | ConvertFrom-Json

$finalPrompt = if ([string]::IsNullOrWhiteSpace($Prompt)) {
  switch ($resolved.phase) {
    "plan" { "Continue planning using the active plan file and keep scope locked." }
    "research" { "Write or update the research note for the active task before implementation." }
    "implement" { "Execute the active plan file and stay within scope." }
    "bugfix" { "Debug and fix the active issue using the active plan file and recorded evidence." }
    "review" { "Review the active changes against the plan, risk, and verification contract." }
    default { "Continue the active plan file." }
  }
} else {
  $Prompt
}

$cmd = @(
  "codex",
  "-m", $resolved.model,
  "-c", "model_reasoning_effort=`"$($resolved.effort)`"",
  "-C", $Workdir,
  $finalPrompt
)

if ($DryRun) {
  Write-Host "Plan:    $($resolved.plan_file)"
  Write-Host "Phase:   $($resolved.phase)"
  Write-Host "Lane:    $($resolved.lane)"
  Write-Host "Profile: $($resolved.profile)"
  Write-Host "Model:   $($resolved.model)"
  Write-Host "Effort:  $($resolved.effort)"
  Write-Host "Prompt:  $finalPrompt"
  Write-Host "Command: $($cmd -join ' ')"
  exit 0
}

& $cmd[0] $cmd[1..($cmd.Length-1)]
