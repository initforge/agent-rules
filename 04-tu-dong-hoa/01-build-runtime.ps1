param([string]$Root = (Split-Path -Parent $PSScriptRoot))
$ErrorActionPreference = "Stop"

$BuildRoot = Join-Path $Root "05-ban-dung\runtime-build"
if (Test-Path $BuildRoot) { Remove-Item -LiteralPath $BuildRoot -Recurse -Force }

$Platforms = @("codex", "grok", "antigravity")
$Core = Join-Path $Root "01-global\loi"
$SkillsRoot = Join-Path $Root "01-global\ky-nang"
$SystemMap = Join-Path $Root "00-huong-dan"

foreach ($Platform in $Platforms) {
  $Target = Join-Path $BuildRoot $Platform
  $Rules = Join-Path $Target "rules"
  $Skills = Join-Path $Target "skills"
  New-Item -ItemType Directory -Force -Path $Rules, $Skills | Out-Null

  Get-ChildItem $Core -File -Filter "*.md" | ForEach-Object {
    Copy-Item $_.FullName (Join-Path $Rules $_.Name)
  }

  $Overlay = Join-Path $Root "03-nen-tang\$Platform\$Platform-overlay.md"
  if (Test-Path $Overlay) {
    Copy-Item $Overlay (Join-Path $Rules "$Platform-overlay.md")
  }

  Get-ChildItem $SkillsRoot -Recurse -File -Filter "SKILL.md" | ForEach-Object {
    $SourceDir = $_.Directory.FullName
    $Slug = $_.Directory.Name
    $Dest = Join-Path $Skills $Slug
    Copy-Item -LiteralPath $SourceDir -Destination $Dest -Recurse
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
      docs = "00-huong-dan"
      core = "01-global/loi"
      skills = "01-global/ky-nang"
      overlays = "03-nen-tang/$Platform"
    }
    files = $ManifestItems
  }

  $Inventory | ConvertTo-Json -Depth 5 | Set-Content -Encoding UTF8 (Join-Path $Target "manifest.json")
  Copy-Item -Path (Join-Path $SystemMap "*") -Destination (Join-Path $Target "docs") -Recurse -Force
}

Write-Host "Runtime builds created: $BuildRoot"
