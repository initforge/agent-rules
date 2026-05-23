param(
  [string]$CodexHome = "$env:USERPROFILE\.codex",
  [string]$RulesRoot = "P:\agent-rules",
  [switch]$Backup = $true,
  [int]$KeepBackups = 3
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

if ($Backup -and $KeepBackups -gt 0) {
  $root = (Resolve-Path $RulesRoot).Path
  $oldBackups = Get-ChildItem -LiteralPath $root -Directory -Filter "codex.bak.*" |
    Sort-Object LastWriteTime -Descending |
    Select-Object -Skip $KeepBackups

  foreach ($backup in $oldBackups) {
    $full = (Resolve-Path $backup.FullName).Path

    if ($full.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase) -and
        $backup.Name -like "codex.bak.*") {
      Remove-Item -LiteralPath $full -Recurse -Force
      Write-Host "[Sync] pruned old backup $full"
    }
  }
}
