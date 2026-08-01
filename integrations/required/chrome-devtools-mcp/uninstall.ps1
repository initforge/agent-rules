$ErrorActionPreference = "Stop"
$Manifest = Get-Content -Raw (Join-Path $PSScriptRoot "manifest.json") | ConvertFrom-Json
# npx packages are cached on-demand; no global uninstall needed
Write-Host "Uninstalling $($Manifest.name) (npx cache managed by npm)..."
& npm cache clean --force 2>$null
Write-Host "$($Manifest.name) uninstalled"
