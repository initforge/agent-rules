param(
  [string]$Root = (Split-Path -Parent $PSScriptRoot),
  [string]$OutputPath = (Join-Path $Root "generated\context-graph.json")
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Error "PREFLIGHT FAIL: node is not installed or not on PATH"
  exit 1
}
$nodeVersion = & node --version
Write-Host "node $nodeVersion"

$Cli = Join-Path $Root "packages\cli\dist\index.js"
if (-not (Test-Path -LiteralPath $Cli)) {
  Write-Error "PREFLIGHT FAIL: Canonical CLI is not built: $Cli - run 'npm run build' first"
  exit 1
}

Write-Host "Building context graph from $Root"
& node $Cli context-graph build $OutputPath
if ($LASTEXITCODE -ne 0) {
  Write-Error "PREFLIGHT FAIL: context-graph build exited with code $LASTEXITCODE"
  exit $LASTEXITCODE
}
Write-Host "Context graph written to $OutputPath"
