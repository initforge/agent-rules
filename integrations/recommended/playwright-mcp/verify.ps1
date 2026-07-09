$ErrorActionPreference = "Stop"
$Manifest = Get-Content -Raw (Join-Path $PSScriptRoot "manifest.json") | ConvertFrom-Json
& npx -y "$($Manifest.npmPackage)@latest" --help *> $null
if ($LASTEXITCODE -ne 0) { throw "Playwright MCP via npx failed" }
Write-Host "Playwright MCP PASS: npx $($Manifest.npmPackage)"
