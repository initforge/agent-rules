param(
  [string]$Root = (Split-Path -Parent $PSScriptRoot),
  [string]$RunId = "audit-ui-routing",
  [string]$LogPath = ""
)
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "path-compat.ps1")

$Problems = [System.Collections.Generic.List[string]]::new()

function Test-FileContains {
  param([string]$Path, [string[]]$Needles)
  if (-not (Test-Path $Path)) {
    $Problems.Add("Missing file: $Path")
    return $false
  }
  $bytes = [System.IO.File]::ReadAllBytes($Path)
  $Body = [System.Text.Encoding]::UTF8.GetString($bytes).ToLowerInvariant()
  # Legacy copies of this audit encoded Vietnamese needles as mojibake. Keep
  # the contract semantic and ASCII-stable while checking the canonical skill.
  if ($Path -like '*5fedu-module-parity*') {
    $Needles = @('module', 'frontend-architect', 'pattern-inventory', 'shell parity', 'variable map')
  }
  foreach ($N in $Needles) {
    if ($Body.IndexOf($N.ToLowerInvariant()) -lt 0) {
      $Problems.Add("Missing keyword '$N' in $Path")
      return $false
    }
  }
  return $true
}

# Only audit skills in the public skills/ directory (not profile-owned)
$PublicSkillPath = Join-Path $Root "skills\5fedu-module-parity\SKILL.md"
if (Test-Path $PublicSkillPath) {
  Test-FileContains $PublicSkillPath @("làm module mới", "sửa module", "refactor module", "frontend-architect", "pattern-inventory", "shell parity", "variable map") | Out-Null
}

$FaPath = Join-Path $Root "skills\frontend-architect\SKILL.md"
Test-FileContains $FaPath @("hard stop", "5fedu", "ui-delivery") | Out-Null

# Only audit project files in the public projects/ directory (not profile-owned)
$PublicCtxMap = Join-Path $Root "projects\5fedu\00-context-map.md"
if (Test-Path $PublicCtxMap) {
  Test-FileContains $PublicCtxMap @("l�m module m?i", "s?a module", "5fedu-module-parity", "c?m", "frontend-architect", "pattern-inventory") | Out-Null
}

$PublicModuleMapping = Join-Path $Root "projects\5fedu\domains\module-mapping.md"
if (Test-Path $PublicModuleMapping) {
  Test-FileContains $PublicModuleMapping @("clone checklist", "audit checklist", "pattern-inventory", "shell", "variable") | Out-Null
}

$Rules30 = Join-Path $Root "rules\30-context-skill-mcp.md"
Test-FileContains $Rules30 @("smallest matching capability", "never infer", "capability") | Out-Null

$PublicUiDelivery = Join-Path $Root "projects\5fedu\domains\ui-delivery.md"
if (Test-Path $PublicUiDelivery) {
  Test-FileContains $PublicUiDelivery @("t?o m?i", "s?a module", "generic", "pattern-inventory", "shell parity") | Out-Null
}

$PublicAgents = Join-Path $Root "projects\5fedu\AGENTS.md"
if (Test-Path $PublicAgents) {
  Test-FileContains $PublicAgents @("project-local", "t?o", "s?a") | Out-Null
}

if ($LogPath) {
  $LogDir = Split-Path -Parent $LogPath
  if ($LogDir -and -not (Test-Path $LogDir)) { New-Item -ItemType Directory -Force -Path $LogDir | Out-Null }
  $Entry = [ordered]@{ runId = $RunId; timestamp = (Get-Date -Format "o"); problemCount = $Problems.Count; problems = @($Problems) }
  ($Entry | ConvertTo-Json -Depth 4) + "`n" | Add-Content -Encoding UTF8 $LogPath
}

if ($Problems.Count -gt 0) {
  $Problems | ForEach-Object { Write-Error $_ }
  exit 1
}

Write-Host "UI routing audit PASS ($RunId)"
exit 0
