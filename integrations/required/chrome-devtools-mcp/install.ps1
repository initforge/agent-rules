param([switch]$Force)
$ErrorActionPreference = "Stop"

$Manifest = Get-Content -Raw (Join-Path $PSScriptRoot "manifest.json") | ConvertFrom-Json
Write-Host "Ensuring Chrome DevTools MCP via npx: $($Manifest.npmPackage)"
& npx -y "$($Manifest.npmPackage)@latest" --help *> $null
if ($LASTEXITCODE -ne 0) { throw "chrome-devtools-mcp npx failed" }
Write-Host "Installed Chrome DevTools MCP (npx)"
