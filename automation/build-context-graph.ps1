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

$Generator = Join-Path $Root "automation\build-context-graph.mjs"
if (-not (Test-Path -LiteralPath $Generator)) {
  Write-Error "PREFLIGHT FAIL: context-graph generator is missing: $Generator"
  exit 1
}

Write-Host "Building context graph from $Root"
& node $Generator $OutputPath
if ($LASTEXITCODE -ne 0) {
  Write-Error "PREFLIGHT FAIL: context-graph build exited with code $LASTEXITCODE"
  exit $LASTEXITCODE
}
Write-Host "Context graph written to $OutputPath"
