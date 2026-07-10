param(
  [Parameter(Mandatory = $true)][string]$ProjectRoot,
  [ValidateSet("default", "tah-app", "nostime")][string]$Profile = "default",
  [switch]$WhatIf
)
$ErrorActionPreference = "Stop"

$Project = (Resolve-Path $ProjectRoot).Path
$RepoRoot = Split-Path -Parent $PSScriptRoot
$ContextDir = Join-Path $Project "context\5fedu"
$RootAgents = Join-Path $Project "AGENTS.md"
$ProjectLocalDir = Join-Path $ContextDir "project-local"
$HardRules = Join-Path $ProjectLocalDir "agents-hard-rules.md"
$MapPath = Join-Path $PSScriptRoot "legacy-context-path-map.json"
$TemplatePath = Join-Path $RepoRoot "projects\context-template\root-AGENTS.md"
$MigrateMarker = "## Migrated from root AGENTS"

$ProfileConfig = $null
if ($Profile -ne "default") {
  $ProfilePath = Join-Path $PSScriptRoot "profiles\$Profile.json"
  if (Test-Path $ProfilePath) {
    $ProfileConfig = Get-Content -Raw $ProfilePath | ConvertFrom-Json
  }
}

$Title = "5fedu Project Entry"
$DeployNote = ""
$ProductionUrl = ""
if ($ProfileConfig -and $ProfileConfig.rootAgents) {
  if ($ProfileConfig.rootAgents.title) { $Title = $ProfileConfig.rootAgents.title }
  if ($ProfileConfig.rootAgents.deployNote) { $DeployNote = $ProfileConfig.rootAgents.deployNote }
  if ($ProfileConfig.rootAgents.productionVerifyUrl) { $ProductionUrl = $ProfileConfig.rootAgents.productionVerifyUrl }
}

function Test-LegacyAgentsContent {
  param([string]$Body)
  if (-not $Body) { return $false }
  $LegacyNeedles = @(
    "03-database-supabase.md",
    "04-auth-permissions-and-flows.md",
    "05-delivery-quality.md",
    "07-working-format.md",
    "context/5fedu/00-index.md",
    "04-decision-status-and-backlog.md",
    "06-decision-status.md",
    "11-current-sheets-source-map.md",
    "01-tech-stack-and-template.md",
    "02-frontend-mapping.md"
  )
  foreach ($N in $LegacyNeedles) {
    if ($Body -like "*$N*") { return $true }
  }
  return $false
}

function Rewrite-LegacyPaths {
  param([string]$Text, [hashtable]$Map)
  $Out = $Text
  $Bq = [char]0x60
  foreach ($Entry in $Map.GetEnumerator()) {
    $Out = $Out.Replace("context/5fedu/$($Entry.Key)", "context/5fedu/$($Entry.Value)")
    $Out = $Out.Replace("${Bq}context/5fedu/$($Entry.Key)${Bq}", "${Bq}context/5fedu/$($Entry.Value)${Bq}")
    $Out = $Out.Replace("${Bq}$($Entry.Key)${Bq}", "${Bq}$($Entry.Value)${Bq}")
  }
  $Out = $Out.Replace("${Bq}00-index.md${Bq}", "${Bq}00-context-map.md${Bq}")
  $Out = $Out.Replace("00-index.md", "00-context-map.md")
  while ($Out -match 'open-open-') {
    $Out = $Out -replace 'open-open-', 'open-'
  }
  $Out = [regex]::Replace($Out, '(?<!open-)(?<![\w/])questions\.md', 'open-questions.md')
  $Out = $Out.Replace("06-decision-status.md", "decisions.md")
  $LegacyTargets = @{
    "legacy/working-format-legacy.md" = "domains/references/ui-delivery-detail.md"
    "legacy/delivery-quality-legacy.md" = "domains/ui-delivery.md"
    "legacy/database-supabase-legacy.md" = "domains/database.md"
    "legacy/auth-permissions-legacy.md" = "domains/permissions.md"
    "legacy/decision-status-legacy.md" = "decisions.md"
  }
  foreach ($Legacy in $LegacyTargets.GetEnumerator()) {
    $Out = $Out.Replace($Legacy.Key, $Legacy.Value)
    $Out = $Out.Replace("${Bq}$($Legacy.Key)${Bq}", "${Bq}$($Legacy.Value)${Bq}")
  }
  return $Out
}

function Get-ExtractedHardRules {
  param([string]$Body, [hashtable]$Map)
  $Lines = $Body -split "`r?`n"
  $Capture = [System.Collections.Generic.List[string]]::new()
  $InSkipSection = $false
  foreach ($Line in $Lines) {
    if ($Line -match '^##\s+(Luôn đọc trước khi làm|Chỉ đọc khi liên quan)\s*$') {
      $InSkipSection = $true
      continue
    }
    if ($InSkipSection -and $Line -match '^##\s+') {
      $InSkipSection = $false
    }
    if ($InSkipSection) { continue }
    if ($Line -match '^#\s+5fedu Project Entry\s*$' -and $Capture.Count -eq 0) { continue }
    if ($Line -match '^\*\*Context:\*\*' ) { continue }
    if ($Line -match '^---\s*$' -and $Capture.Count -eq 0) { continue }
    if ($Line.Trim().Length -eq 0 -and $Capture.Count -eq 0) { continue }
    $Capture.Add($Line) | Out-Null
  }
  $Extracted = ($Capture -join "`n").Trim()
  if ($Extracted.Length -lt 40) { return "" }
  return Rewrite-LegacyPaths -Text $Extracted -Map $Map
}

function New-RootAgentsContent {
  param([string]$Title, [string]$DeployNote, [string]$ProductionUrl)
  if (-not (Test-Path $TemplatePath)) {
    throw "Missing template: $TemplatePath"
  }
  $Template = Get-Content -Raw -Encoding UTF8 $TemplatePath
  $DeployLine = if ($DeployNote) { $DeployNote } else { "" }
  $ProdLine = if ($ProductionUrl) { "Production verify: $ProductionUrl (when applicable)" } else { "" }
  $Content = $Template.Replace("{{TITLE}}", $Title)
  $Content = $Content.Replace("{{DEPLOY_NOTE}}", $DeployLine)
  $Content = $Content.Replace("{{PRODUCTION_VERIFY}}", $ProdLine)
  return $Content.TrimEnd() + "`n"
}

if (-not (Test-Path $ContextDir)) {
  Write-Warning "No context/5fedu - skip root AGENTS sync"
  exit 0
}

New-Item -ItemType Directory -Force -Path $ProjectLocalDir | Out-Null

$PathMap = @{}
if (Test-Path $MapPath) {
  $RawMap = Get-Content -Raw -Encoding UTF8 $MapPath | ConvertFrom-Json
  foreach ($Prop in $RawMap.PSObject.Properties) {
    $PathMap[$Prop.Name] = [string]$Prop.Value
  }
}

$ExistingRoot = ""
if (Test-Path $RootAgents) {
  $ExistingRoot = Get-Content -Raw -Encoding UTF8 $RootAgents
}

$HasLegacy = Test-LegacyAgentsContent -Body $ExistingRoot
$HardRulesExists = Test-Path $HardRules
$HardRulesBody = if ($HardRulesExists) { Get-Content -Raw -Encoding UTF8 $HardRules } else { "" }
$AlreadyMigrated = $HardRulesBody -like "*$MigrateMarker*"

if ($HasLegacy -and (-not $AlreadyMigrated -or -not $HardRulesExists)) {
  $Extracted = Get-ExtractedHardRules -Body $ExistingRoot -Map $PathMap
  if ($Extracted) {
    $HardRulesText = @"
# Repo-specific hard rules

$MigrateMarker ($(Get-Date -Format 'yyyy-MM-dd')).

$Extracted
"@
    if ($WhatIf) {
      Write-Host "[WhatIf] Would write: $HardRules"
    } else {
      [System.IO.File]::WriteAllText($HardRules, $HardRulesText.TrimEnd() + "`n")
      Write-Host "Extracted hard rules -> $HardRules"
    }
  }
}

if ($HardRulesExists) {
  $Rewritten = Rewrite-LegacyPaths -Text $HardRulesBody -Map $PathMap
  if ($Rewritten -ne $HardRulesBody) {
    if ($WhatIf) {
      Write-Host "[WhatIf] Would refresh legacy paths in $HardRules"
    } else {
      [System.IO.File]::WriteAllText($HardRules, $Rewritten.TrimEnd() + "`n")
      Write-Host "Refreshed legacy paths in $HardRules"
    }
  }
}

$NewRoot = New-RootAgentsContent -Title $Title -DeployNote $DeployNote -ProductionUrl $ProductionUrl
if ($WhatIf) {
  Write-Host "[WhatIf] Would write root AGENTS.md:`n$NewRoot"
} else {
  [System.IO.File]::WriteAllText($RootAgents, $NewRoot)
  Write-Host "Updated root AGENTS.md -> $RootAgents"
}

exit 0
