param([string]$Root = (Split-Path -Parent $PSScriptRoot))
$ErrorActionPreference = "Stop"
$Build = Join-Path $Root "build"
if (Test-Path $Build) { Remove-Item -LiteralPath $Build -Recurse -Force }
$Platforms = @("codex", "grok", "antigravity")
$Core = Join-Path $Root "knowledge\core"
$Capabilities = Join-Path $Root "knowledge\capabilities"
foreach ($Platform in $Platforms) {
  $Target = Join-Path $Build $Platform
  $Rules = Join-Path $Target "rules"
  $Skills = Join-Path $Target "skills"
  New-Item -ItemType Directory -Force -Path $Rules, $Skills | Out-Null
  Get-ChildItem $Core -File -Filter "*.md" | ForEach-Object { Copy-Item $_.FullName (Join-Path $Rules $_.Name) }
  $Overlay = Join-Path $Root "platforms\$Platform\$Platform-overlay.md"
  if (Test-Path $Overlay) { Copy-Item $Overlay (Join-Path $Rules "$Platform-overlay.md") }
  Get-ChildItem $Capabilities -Recurse -File -Filter "SKILL.md" | ForEach-Object {
    $SourceDir = $_.Directory.FullName
    $Slug = $_.Directory.Name
    $Dest = Join-Path $Skills $Slug
    Copy-Item -LiteralPath $SourceDir -Destination $Dest -Recurse
  }
  $Hashes = Get-ChildItem $Target -Recurse -File | Sort-Object FullName | ForEach-Object {
    [pscustomobject]@{ Path = $_.FullName.Substring($Target.Length + 1).Replace('\','/'); Sha256 = (Get-FileHash $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant() }
  }
  $Hashes | ConvertTo-Json -Depth 3 | Set-Content -Encoding UTF8 (Join-Path $Target "manifest.json")
}
Write-Host "Runtime builds created: $Build"
