param(
  [string]$RepoRoot = (Get-Location).Path,
  [switch]$Force = $false
)

$ErrorActionPreference = "Stop"

$skillRoot = Split-Path -Parent $PSScriptRoot
$sourceRoot = Join-Path $skillRoot "assets\project-context"

if (-not (Test-Path $sourceRoot)) {
  throw "Missing template source: $sourceRoot"
}

$repo = (Resolve-Path $RepoRoot).Path
$agentsPath = Join-Path $repo "AGENTS.md"
$targetContext = Join-Path $repo ".codex\5fedu"

if ((Test-Path $agentsPath) -and -not $Force) {
  throw "AGENTS.md already exists. Re-run with -Force after reviewing it."
}

if ((Test-Path $targetContext) -and -not $Force) {
  throw ".codex\5fedu already exists. Re-run with -Force after reviewing it."
}

New-Item -ItemType Directory -Force -Path $repo | Out-Null
Copy-Item -LiteralPath (Join-Path $sourceRoot "AGENTS.md") -Destination $agentsPath -Force
Copy-Item -LiteralPath (Join-Path $sourceRoot ".codex") -Destination $repo -Recurse -Force

Write-Host "[5fedu] Installed project context into $repo"
