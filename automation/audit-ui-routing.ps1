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
Test-FileContains $SkillPath @("làm module mới", "sửa module", "refactor module", "frontend-architect", "pattern-inventory", "shell parity", "variable map") | Out-Null

$FaPath = Join-Path $Root "skills\frontend-architect\SKILL.md"
Test-FileContains $FaPath @("hard stop", "5fedu", "ui-delivery", "tạo", "sửa") | Out-Null

$CtxMap = Join-Path $Root "projects\5fedu\00-context-map.md"
Test-FileContains $CtxMap @("làm module mới", "sửa module", "5fedu-module-parity", "cấm", "frontend-architect", "pattern-inventory") | Out-Null

$ModuleMapping = Join-Path $Root "projects\5fedu\domains\module-mapping.md"
Test-FileContains $ModuleMapping @("clone checklist", "audit checklist", "pattern-inventory", "shell", "variable") | Out-Null

$Rules30 = Join-Path $Root "rules\30-context-routing.md"
Test-FileContains $Rules30 @("5fedu-module-parity", "tạo", "sửa", "refactor") | Out-Null

$UiDelivery = Join-Path $Root "projects\5fedu\domains\ui-delivery.md"
Test-FileContains $UiDelivery @("tạo mới", "sửa module", "generic", "pattern-inventory", "shell parity") | Out-Null

$Agents = Join-Path $Root "projects\5fedu\AGENTS.md"
Test-FileContains $Agents @("project-local", "tạo", "sửa") | Out-Null

# Pattern inventory must exist and define shell_must + variable_slots
$Inventory = Join-Path $Root "projects\5fedu\domains\references\pattern-inventory.yaml"
if (-not (Test-Path $Inventory)) {
  $Problems.Add("Missing pattern inventory: $Inventory")
} else {
  $InvBody = Get-Content -Raw -Encoding UTF8 $Inventory
  if ($InvBody -notlike "*shell_must*" -or $InvBody -notlike "*variable_slots*") {
    $Problems.Add("pattern-inventory.yaml must define shell_must and variable_slots")
  }
  if ($InvBody -notlike "*crud-list*" -and $InvBody -notlike "*surfaces:*") {
    $Problems.Add("pattern-inventory.yaml must list surfaces")
  }
}

if ($LogPath) {
  $LogDir = Split-Path -Parent $LogPath
  if ($LogDir -and -not (Test-Path $LogDir)) { New-Item -ItemType Directory -Force -Path $LogDir | Out-Null }
  $Entry = [ordered]@{
    runId = $RunId
    timestamp = (Get-Date -Format 'o')
    problemCount = $Problems.Count
    problems = @($Problems)
  }
  # UTF8 works on Windows PowerShell 5.1; UTF8 is PS7+ only.
($Entry | ConvertTo-Json -Depth 4) + "`n" | Add-Content -Encoding UTF8 $LogPath
}

if ($Problems.Count -gt 0) {
  $Problems | ForEach-Object { Write-Error $_ }
  exit 1
}

Write-Host "UI routing audit PASS ($RunId)"
exit 0
