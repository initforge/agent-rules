# Thin compatibility wrapper — canonical implementation is in TypeScript CLI
param()
$ErrorActionPreference = "Stop"
$CliDir = Join-Path $PSScriptRoot "..\cli"
$CliEntry = Join-Path $CliDir "dist\index.js"
if (-not (Test-Path $CliEntry)) {
  throw "CLI not built: run 'npm install && npm run build' in cli/"
}
& node $CliEntry verify-mirrors
exit $LASTEXITCODE
