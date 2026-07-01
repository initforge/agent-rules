param([switch]$Force)
$ErrorActionPreference = "Stop"

$Manifest = Get-Content -Raw (Join-Path $PSScriptRoot "manifest.json") | ConvertFrom-Json
$Command = Get-Command $Manifest.commandName -ErrorAction SilentlyContinue
if ($Command -and -not $Force) {
  Write-Host "Already installed: $($Command.Source)"
  exit 0
}

& npm install -g $Manifest.npmPackage
if ($LASTEXITCODE -ne 0) { throw "Context7 install failed" }
Write-Host "Installed Context7 MCP"
