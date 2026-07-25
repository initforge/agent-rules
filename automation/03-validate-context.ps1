# Thin compatibility wrapper — canonical implementation is in TypeScript CLI
param()
$ErrorActionPreference = "Stop"
$CliDir = Join-Path $PSScriptRoot "..\cli"
$CliEntry = Join-Path $CliDir "dist\index.js"
if (-not (Test-Path $CliEntry)) {
  throw "CLI not built: run 'npm install && npm run build' in cli/"
}
# Check for verbose mode via env var (used by existing callers)
$Extra = @()
if ($env:AGENT_RULES_VERBOSE -eq "1") { $Extra += "--verbose" }
if ($env:AGENT_RULES_DRY_RUN -eq "1") { $Extra += "--dry-run" }
& node $CliEntry validate @Extra
exit $LASTEXITCODE
