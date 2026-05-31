param(
  [Parameter(Mandatory = $true)]
  [string]$ProjectRoot,

  [string]$RulesRoot = "P:\agent-rules",

  [switch]$LegacyAgentSingular = $false,

  [switch]$IncludeDisabledHook = $false
)

$ErrorActionPreference = "Stop"

$adapterRoot = Join-Path $RulesRoot "antigravity"
if (-not (Test-Path $adapterRoot)) {
  throw "Missing Antigravity adapter: $adapterRoot"
}

$project = Resolve-Path $ProjectRoot
$agentsSource = Join-Path $adapterRoot ".agents"
$agentsTarget = Join-Path $project ".agents"

New-Item -ItemType Directory -Force -Path $agentsTarget | Out-Null
Copy-Item "$agentsSource\*" $agentsTarget -Recurse -Force

$scriptTarget = Join-Path $project "scripts"
New-Item -ItemType Directory -Force -Path $scriptTarget | Out-Null
Copy-Item (Join-Path $adapterRoot "scripts\antigravity-preflight.ps1") $scriptTarget -Force

if ($IncludeDisabledHook) {
  Copy-Item (Join-Path $adapterRoot "hooks.json") (Join-Path $agentsTarget "hooks.json") -Force
}

if ($LegacyAgentSingular) {
  $legacyTarget = Join-Path $project ".agent"
  New-Item -ItemType Directory -Force -Path $legacyTarget | Out-Null
  Copy-Item "$agentsSource\*" $legacyTarget -Recurse -Force
}

Write-Host "[Antigravity] Installed adapter into $project"
Write-Host "[Antigravity] Primary rules/workflows: $agentsTarget"
Write-Host "[Antigravity] No profile/model config installed; Antigravity runtime manages model/effort."

if ($LegacyAgentSingular) {
  Write-Host "[Antigravity] Legacy mirror: $(Join-Path $project '.agent')"
}

if ($IncludeDisabledHook) {
  Write-Host "[Antigravity] Disabled hook template installed at $(Join-Path $agentsTarget 'hooks.json')"
}
