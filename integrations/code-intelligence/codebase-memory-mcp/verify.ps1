$ErrorActionPreference = "Stop"
$Manifest = Get-Content -Raw (Join-Path $PSScriptRoot "manifest.json") | ConvertFrom-Json
$Bin = Join-Path ([Environment]::ExpandEnvironmentVariables($Manifest.installDir)) "codebase-memory-mcp.exe"
if (-not (Test-Path $Bin)) { throw "Missing binary: $Bin" }
$Version = & $Bin --version 2>&1
if ($LASTEXITCODE -ne 0) { throw "Binary failed: $Version" }
Write-Host "Codebase MCP PASS: $Version"
Write-Host $Bin
