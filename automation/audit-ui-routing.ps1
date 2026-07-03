param(
  [string]$Root = (Split-Path -Parent $PSScriptRoot),
  [string]$RunId = "audit-ui-routing",
  [string]$LogPath = ""
)
$ErrorActionPreference = "Stop"

$Problems = [System.Collections.Generic.List[string]]::new()

function Test-FileContains {
  param([string]$Path, [string[]]$Needles)
  if (-not (Test-Path $Path)) {
    $Problems.Add("Missing file: $Path")
    return $false
  }
  $Body = (Get-Content -Raw -Encoding UTF8 $Path).ToLowerInvariant()
  foreach ($N in $Needles) {
    if ($Body -notlike "*$($N.ToLowerInvariant())*") {
      $Problems.Add("Missing keyword '$N' in $Path")
      return $false
    }
  }
  return $true
}

$SkillPath = Join-Path $Root "skills\5fedu-module-parity\SKILL.md"
Test-FileContains $SkillPath @("làm module mới", "sửa module", "refactor module", "frontend-architect") | Out-Null

$FaPath = Join-Path $Root "skills\frontend-architect\SKILL.md"
Test-FileContains $FaPath @("hard stop", "5fedu", "ui-delivery", "tạo", "sửa") | Out-Null

$CtxMap = Join-Path $Root "projects\5fedu\00-context-map.md"
Test-FileContains $CtxMap @("làm module mới", "sửa module", "5fedu-module-parity", "cấm", "frontend-architect") | Out-Null

$ModuleMapping = Join-Path $Root "projects\5fedu\domains\module-mapping.md"
Test-FileContains $ModuleMapping @("clone checklist", "audit checklist") | Out-Null

$Rules30 = Join-Path $Root "rules\30-context-routing.md"
Test-FileContains $Rules30 @("5fedu-module-parity", "tạo", "sửa", "refactor") | Out-Null

$UiDelivery = Join-Path $Root "projects\5fedu\domains\ui-delivery.md"
Test-FileContains $UiDelivery @("tạo mới", "sửa module", "generic") | Out-Null

$Agents = Join-Path $Root "projects\5fedu\AGENTS.md"
Test-FileContains $Agents @("project-local", "tạo", "sửa") | Out-Null

if ($LogPath) {
  $LogDir = Split-Path -Parent $LogPath
  if ($LogDir -and -not (Test-Path $LogDir)) { New-Item -ItemType Directory -Force -Path $LogDir | Out-Null }
  $Entry = [ordered]@{
    runId = $RunId
    timestamp = (Get-Date -Format 'o')
    problemCount = $Problems.Count
    problems = @($Problems)
  }
  ($Entry | ConvertTo-Json -Depth 4) + "`n" | Add-Content -Encoding utf8NoBOM $LogPath
}

if ($Problems.Count -gt 0) {
  $Problems | ForEach-Object { Write-Error $_ }
  exit 1
}

Write-Host "UI routing audit PASS ($RunId)"
exit 0
