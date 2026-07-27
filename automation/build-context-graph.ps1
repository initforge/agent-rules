param(
  [string]$Root = (Split-Path -Parent $PSScriptRoot),
  [string]$OutputPath = (Join-Path $Root "generated\context-graph.json")
)

$ErrorActionPreference = "Stop"
$Cli = Join-Path $Root "packages\cli\dist\index.js"
if (-not (Test-Path -LiteralPath $Cli)) { throw "Canonical CLI is not built: $Cli" }

& node $Cli context-graph build $OutputPath
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
