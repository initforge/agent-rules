param(
  [ValidateSet("codex","grok","antigravity","cursor","all")][string]$Platform = "all",
  [ValidateSet("strict")][string]$Mode = "strict"
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "path-compat.ps1")

$Root = Split-Path -Parent $PSScriptRoot
$ContextGraphScript = Join-Path $PSScriptRoot "build-context-graph.ps1"
$GraphPath = Join-Path $Root "05-generated\context-graph.json"
if (Test-Path -LiteralPath $ContextGraphScript) {
  & $ContextGraphScript -Root $Root -OutputPath $GraphPath | Write-Host
}
if (-not (Test-Path -LiteralPath $GraphPath)) { throw "Missing compiled context graph: $GraphPath" }

$PythonCommand = $env:AGENT_RULES_PYTHON
if (-not $PythonCommand) { $PythonCommand = $env:HARNESS_PYTHON }
if (-not $PythonCommand) {
  foreach ($Candidate in @("python", "python3")) {
    $Resolved = Get-Command $Candidate -ErrorAction SilentlyContinue
    if ($Resolved) { $PythonCommand = $Resolved.Source; break }
  }
}
$ConformanceTest = Join-Path $Root "automation\test-context-router.py"
if (-not $PythonCommand) { throw "Cannot run routing conformance; set AGENT_RULES_PYTHON or install python" }
& $PythonCommand $ConformanceTest
if ($LASTEXITCODE -ne 0) { throw "Routing conformance failed; strict cutover is refused" }
$RouteCasesPath = Join-Path $Root "automation\context-route-cases.json"
$RouteSchemaPath = Join-Path $Root "automation\context-route-cases.schema.json"
if (-not (Test-Path -LiteralPath $RouteCasesPath) -or -not (Test-Path -LiteralPath $RouteSchemaPath)) {
  throw "Routing conformance contract is incomplete"
}
$RouteCases = Get-Content -Raw -LiteralPath $RouteCasesPath | ConvertFrom-Json
if ([int]$RouteCases.version -lt 3) { throw "Routing conformance contract version 3+ is required" }

$Graph = Get-Content -Raw -LiteralPath $GraphPath | ConvertFrom-Json
if ([int]$Graph.version -lt 2) { throw "Context graph version 2+ is required before routing cutover" }
$Ids = @($Graph.nodes | ForEach-Object { $_.id })
if (($Ids | Sort-Object -Unique).Count -ne $Ids.Count) { throw "Context graph contains duplicate node IDs" }
$Required = @("id", "layer", "source", "load_policy", "owner", "routing", "source_hash", "token_estimate")
foreach ($Node in @($Graph.nodes)) {
  foreach ($Field in $Required) {
    if ($null -eq $Node.PSObject.Properties[$Field]) { throw "Context graph node '$($Node.id)' is missing '$Field'" }
  }
}

$UserHome = if ($env:USERPROFILE) { $env:USERPROFILE } elseif ($env:HOME) { $env:HOME } else { throw "Cannot resolve user home directory" }
$PlatformHomes = @{
  codex = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $UserHome ".codex" }
  grok = if ($env:GROK_HOME) { $env:GROK_HOME } else { Join-Path $UserHome ".grok" }
  antigravity = Join-Path $UserHome ".gemini\config"
  cursor = Join-Path $UserHome ".cursor"
}
$Selected = if ($Platform -eq "all") { @("codex", "grok", "antigravity", "cursor") } else { @($Platform) }
$GraphHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $GraphPath).Hash.ToLowerInvariant()
$RouteCasesHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $RouteCasesPath).Hash.ToLowerInvariant()
$RouteSchemaHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $RouteSchemaPath).Hash.ToLowerInvariant()

foreach ($Name in $Selected) {
  $RuntimeHome = $PlatformHomes[$Name]
  if (-not (Test-Path -LiteralPath $RuntimeHome)) { throw "Runtime home missing for $Name`: $RuntimeHome" }
  $StateDir = Join-Path $RuntimeHome "skill-state"
  New-Item -ItemType Directory -Force -Path $StateDir | Out-Null
  $State = [ordered]@{
    mode = $Mode
    platform = $Name
    graph_version = [int]$Graph.version
    graph_hash = $GraphHash
    conformance_version = [int]$RouteCases.version
    conformance_hash = $RouteCasesHash
    conformance_schema_hash = $RouteSchemaHash
    conformance_checked_at_utc = [DateTime]::UtcNow.ToString("o")
    source = $GraphPath
    updated_at_utc = [DateTime]::UtcNow.ToString("o")
  }
  $StatePath = Join-Path $StateDir "routing-mode.json"
  $State | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $StatePath -Encoding UTF8
  Write-Host ("Routing mode {0}: {1} -> {2}" -f $Mode, $Name, $StatePath)
}

Write-Host ("Context routing cutover complete: {0} ({1})" -f $Mode, ($Selected -join ", "))
