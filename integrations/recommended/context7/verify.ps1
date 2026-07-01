$ErrorActionPreference = "Stop"

$Manifest = Get-Content -Raw (Join-Path $PSScriptRoot "manifest.json") | ConvertFrom-Json
& npx -y $Manifest.npmPackage --help *> $null
if ($LASTEXITCODE -ne 0) { throw "Context7 via npx failed to start" }
Write-Host "Context7 PASS: npx $($Manifest.npmPackage)"
