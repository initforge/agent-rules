$ErrorActionPreference = "Stop"

$Manifest = Get-Content -Raw (Join-Path $PSScriptRoot "manifest.json") | ConvertFrom-Json
$Command = Get-Command $Manifest.commandName -ErrorAction SilentlyContinue
if (-not $Command) { throw "Context7 command not found: $($Manifest.commandName)" }

& $Manifest.commandName --help *> $null
if ($LASTEXITCODE -ne 0) { throw "Context7 command failed to start" }
Write-Host "Context7 PASS: $($Command.Source)"
