$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
& (Join-Path $PSScriptRoot "build-runtime.ps1") -Root $Root
$Platforms = @("codex","grok","antigravity")
$Base = Get-Content -Raw (Join-Path $Root "build\codex\manifest.json") | ConvertFrom-Json
foreach ($Platform in $Platforms[1..2]) {
  $Other = Get-Content -Raw (Join-Path $Root "build\$Platform\manifest.json") | ConvertFrom-Json
  foreach ($Item in $Base | Where-Object Path -Like "skills/*") {
    $Match = $Other | Where-Object Path -EQ $Item.Path
    if (-not $Match -or $Match.Sha256 -ne $Item.Sha256) { throw "Capability mirror drift: $Platform $($Item.Path)" }
  }
  foreach ($Item in $Base | Where-Object { $_.Path -like 'rules/*' -and $_.Path -notlike '*-overlay.md' }) {
    $Match = $Other | Where-Object Path -EQ $Item.Path
    if (-not $Match -or $Match.Sha256 -ne $Item.Sha256) { throw "Core mirror drift: $Platform $($Item.Path)" }
  }
}
Write-Host "Mirror parity PASS"
