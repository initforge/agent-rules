# Thin compatibility wrapper — canonical implementation is in TypeScript CLI
# Doctor layered statuses: INSTALL_PASS, NATIVE_CAPABLE, NATIVE_PARTIAL, NATIVE_UNVERIFIED,
#  ORCHESTRATION_CAPABLE, ORCHESTRATION_PARTIAL, MODEL_POLICY_MATCH, MODEL_POLICY_DRIFT,
#  MODEL_POLICY_MISSING, HOOK_UNVERIFIED, NATIVE_OBSERVED
# Doctor layered summary: install/parity checks have no blocking failures
param(
  [string]$Root = (Split-Path -Parent $PSScriptRoot),
  [ValidateSet("codex","grok","antigravity","cursor","all")][string]$Platform = "all",
  [switch]$SkipIntegrationVerify
)
$ErrorActionPreference = "Stop"
$CliDir = Join-Path $PSScriptRoot "..\cli"
$CliEntry = Join-Path $CliDir "dist\index.js"
if (-not (Test-Path $CliEntry)) {
  throw "CLI not built: run 'npm install && npm run build' in cli/"
}
$Args = @($Platform, "--verbose")
if ($SkipIntegrationVerify) { $Args += "--skip-integration-verify" }
if ($env:AGENT_RULES_DRY_RUN -eq "1") { $Args += "--dry-run" }
& node $CliEntry doctor @Args
exit $LASTEXITCODE
