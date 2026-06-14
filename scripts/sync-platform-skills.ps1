$ErrorActionPreference = "Stop"

# Codex master → Antigravity → local ~/.codex (một chiều — tránh drift hai chiều)
$RepoRoot = if ($env:AGENT_RULES_ROOT) { $env:AGENT_RULES_ROOT } else { "P:\agent-rules" }
$masterCodex = Join-Path $RepoRoot "codex"
$masterAntigravity = Join-Path $RepoRoot "antigravity\.agents"
$localCodex = "$env:USERPROFILE\.codex"

function Sync-OneWay {
  param(
    [string]$Src,
    [string]$Dst
  )
  if (-not (Test-Path $Src)) {
    Write-Host "[Skip] Source missing: $Src"
    return
  }
  New-Item -ItemType Directory -Force -Path $Dst | Out-Null

  Get-ChildItem $Src -Recurse -File | ForEach-Object {
    if ($_.Name -like ".*") { return }
    $relative = $_.FullName.Substring($Src.Length + 1)
    $dFile = Join-Path $Dst $relative
    $parent = Split-Path $dFile -Parent
    New-Item -ItemType Directory -Force -Path $parent | Out-Null
    Copy-Item $_.FullName $dFile -Force
    Write-Host "Synced: $relative"
  }
}

Write-Host "[Platform Sync] codex master -> antigravity + local runtime"

# Ưu tiên bash sync đầy đủ (rules + frontmatter + .agents + .grok)
$syncSh = Join-Path $RepoRoot "scripts\sync-all-harness.sh"
if (Get-Command bash -ErrorAction SilentlyContinue) {
  & bash $syncSh
} else {
  Sync-OneWay -Src (Join-Path $masterCodex "rules") -Dst (Join-Path $masterAntigravity "rules")
  Sync-OneWay -Src (Join-Path $masterCodex "skills") -Dst (Join-Path $masterAntigravity "skills")
  $fm = Join-Path $RepoRoot "antigravity\scripts\add-rules-frontmatter.ps1"
  if (Test-Path $fm) { & $fm -RulesDir (Join-Path $masterAntigravity "rules") }
}

if (Test-Path $localCodex) {
  Write-Host "[Platform Sync] codex -> $localCodex"
  Sync-OneWay -Src (Join-Path $masterCodex "rules") -Dst (Join-Path $localCodex "rules")
  Sync-OneWay -Src (Join-Path $masterCodex "skills") -Dst (Join-Path $localCodex "skills")
}

Write-Host "[Platform Sync] Done (one-way, no bidirectional merge)."