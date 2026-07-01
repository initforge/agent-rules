$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
& (Join-Path $PSScriptRoot "01-build-runtime.ps1") -Root $Root

$Platforms = @("codex", "grok", "antigravity", "cursor")
$BuildRoot = Join-Path $Root "05-generated\runtime-build"
$Base = (Get-Content -Raw (Join-Path $BuildRoot "codex\manifest.json") | ConvertFrom-Json).files

foreach ($Platform in $Platforms[1..3]) {
  $Other = (Get-Content -Raw (Join-Path $BuildRoot "$Platform\manifest.json") | ConvertFrom-Json).files

  foreach ($Item in $Base | Where-Object Path -Like "skills/*") {
    $Match = $Other | Where-Object Path -EQ $Item.Path
    if (-not $Match -or $Match.Sha256 -ne $Item.Sha256) { throw "Skill mirror drift: $Platform $($Item.Path)" }
  }

  foreach ($Item in $Base | Where-Object { $_.Path -like "rules/*" -and $_.Path -notlike "*-overlay.md" }) {
    $Match = $Other | Where-Object Path -EQ $Item.Path
    if (-not $Match -or $Match.Sha256 -ne $Item.Sha256) { throw "Core mirror drift: $Platform $($Item.Path)" }
  }
}

Write-Host "Mirror parity PASS"
