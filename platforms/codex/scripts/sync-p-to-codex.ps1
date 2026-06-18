param(
  [string]$RulesRoot = "P:\agent-rules",
  [string]$CodexHome = "$env:USERPROFILE\.codex",
  [switch]$Backup = $false
)

$ErrorActionPreference = "Stop"

$source = Join-Path $RulesRoot "codex"

if (-not (Test-Path $source)) {
  throw "Missing source: $source"
}

$ts = Get-Date -Format "yyyyMMdd-HHmmss"

if ($Backup -and (Test-Path $CodexHome)) {
  Copy-Item $CodexHome "$CodexHome.bak.$ts" -Recurse -Force
}

New-Item -ItemType Directory -Force -Path $CodexHome | Out-Null
Copy-Item "$source\*" $CodexHome -Recurse -Force

Write-Host "[Sync] $source -> $CodexHome"
