param([string]$Root = (Split-Path -Parent $PSScriptRoot))
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "path-compat.ps1")

$BuildRoot = Join-Path $Root "05-generated\runtime-build"
if (Test-Path $BuildRoot) { Remove-Item -LiteralPath $BuildRoot -Recurse -Force }

$Platforms = @("codex", "grok", "antigravity", "cursor")
$Core = Join-Path $Root "rules"
$SkillsRoot = Join-Path $Root "skills"
$SystemMap = Join-Path $Root "guides"

foreach ($Platform in $Platforms) {
  $Target = Join-Path $BuildRoot $Platform
  $Rules = Join-Path $Target "rules"
  $Skills = Join-Path $Target "skills"
  $Docs = Join-Path $Target "docs"
  New-Item -ItemType Directory -Force -Path $Rules, $Skills, $Docs | Out-Null

  $PlatformAgents = Join-Path $Root "platforms\$Platform\AGENTS.md"
  if (Test-Path $PlatformAgents) {
    Copy-Item -LiteralPath $PlatformAgents -Destination (Join-Path $Target "AGENTS.md") -Force
  }

  Get-ChildItem $Core -File -Filter "*.md" | Where-Object { $_.Name -ne "README.md" } | ForEach-Object {
    Copy-Item $_.FullName (Join-Path $Rules $_.Name)
  }

  $CoreManifest = Join-Path $Core "manifest.yaml"
  if (Test-Path $CoreManifest) {
    Copy-Item $CoreManifest (Join-Path $Rules "manifest.yaml")
  }

  $Overlay = Join-Path $Root "platforms\$Platform\$Platform-overlay.md"
  if (Test-Path $Overlay) {
    Copy-Item $Overlay (Join-Path $Rules "$Platform-overlay.md")
  }

  Get-ChildItem $SkillsRoot -Directory | ForEach-Object {
    $SkillFile = Join-Path $_.FullName "SKILL.md"
    if (-not (Test-Path $SkillFile)) { return }
    $Slug = $_.Name
    $Dest = Join-Path $Skills $Slug
    Copy-Item -LiteralPath $_.FullName -Destination $Dest -Recurse
  }

  $ManifestItems = Get-ChildItem $Target -Recurse -File | Sort-Object FullName | ForEach-Object {
    [pscustomobject]@{
      Path = $_.FullName.Substring($Target.Length + 1).Replace('\', '/')
      Sha256 = (Get-FileHash $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    }
  }

  $Inventory = [pscustomobject]@{
    version = 1
    platform = $Platform
    generatedFrom = [pscustomobject]@{
      docs = "guides"
      core = "rules"
      skills = "skills"
      overlays = "platforms/$Platform"
    }
    files = $ManifestItems
  }

  $Inventory | ConvertTo-Json -Depth 5 | Set-Content -Encoding UTF8 (Join-Path $Target "manifest.json")
  Copy-Item -Path (Join-Path $SystemMap "*") -Destination (Join-Path $Target "docs") -Recurse -Force
}

Write-Host "Runtime builds created: $BuildRoot"
