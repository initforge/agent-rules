param([switch]$Force)
$ErrorActionPreference = "Stop"
$Manifest = Get-Content -Raw (Join-Path $PSScriptRoot "manifest.json") | ConvertFrom-Json
Write-Host "Installing $($Manifest.name) via npx..."
$Output = & npx -y $Manifest.package --help 2>&1
if ($LASTEXITCODE -ne 0) { throw "npx install failed: $Output" }
Write-Host "$($Manifest.name) ready via npx"
