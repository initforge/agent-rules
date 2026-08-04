$ErrorActionPreference = "Stop"
$Manifest = Get-Content -Raw (Join-Path $PSScriptRoot "manifest.json") | ConvertFrom-Json
Write-Host "Verifying $($Manifest.name)..."
$Output = & npx -y $Manifest.package --help 2>&1
if ($LASTEXITCODE -ne 0) { throw "Health check failed: $Output" }
Write-Host "$($Manifest.name) PASS"
