$ErrorActionPreference = "Stop"

$Manifest = Get-Content -Raw (Join-Path $PSScriptRoot "manifest.json") | ConvertFrom-Json
& npm uninstall -g $Manifest.npmPackage
if ($LASTEXITCODE -ne 0) { throw "Context7 uninstall failed" }
Write-Host "Removed Context7 MCP"
