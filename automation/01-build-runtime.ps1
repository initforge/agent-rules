# Thin compatibility wrapper — canonical implementation is in TypeScript CLI
param([string]$Root = "")
$ErrorActionPreference = "Stop"
$CliDir = Join-Path $PSScriptRoot "..\cli"
$CliEntry = Join-Path $CliDir "dist\index.js"
if (-not (Test-Path $CliEntry)) {
  throw "CLI not built: run 'npm install && npm run build' in cli/"
}
$Extra = @()
if ($Root) { $Extra += @("--verbose", $Root) }
& node $CliEntry build @Extra
exit $LASTEXITCODE
