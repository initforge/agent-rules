param(
  [string]$CodexHome = "$env:USERPROFILE\.codex",
  [string]$RulesRoot = "P:\agent-rules",
  [switch]$Backup = $true
)

$ErrorActionPreference = "Stop"

$ts = Get-Date -Format "yyyyMMdd-HHmmss"
$target = Join-Path $RulesRoot "codex"

New-Item -ItemType Directory -Force -Path $RulesRoot | Out-Null

if ($Backup -and (Test-Path $target)) {
  Copy-Item $target "$target.bak.$ts" -Recurse -Force
}

if (Test-Path $target) {
  Remove-Item $target -Recurse -Force
}

New-Item -ItemType Directory -Force -Path $target | Out-Null

foreach ($item in @(
  "AGENTS.md",
  "config.toml",
  "RTK.md",
  "rules",
  "templates",
  "prompts",
  "scripts",
  "agents",
  "skills",
  "docs",
  "inventory"
)) {
  $src = Join-Path $CodexHome $item

  if (Test-Path $src) {
    Copy-Item $src $target -Recurse -Force
  }
}

Write-Host "[Sync] $CodexHome -> $target"
