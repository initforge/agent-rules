param(
  [ValidateSet("codex","grok","antigravity","cursor","all")][string]$Platform = "all",
  [ValidateSet("shadow","strict")][string]$Mode = "strict"
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "path-compat.ps1")

$Root = Split-Path -Parent $PSScriptRoot
$GraphPath = Join-Path $Root "05-generated\context-graph.json"
if (-not (Test-Path -LiteralPath $GraphPath)) { throw "Missing compiled context graph: $GraphPath" }

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
    source = $GraphPath
    updated_at_utc = [DateTime]::UtcNow.ToString("o")
  }
  $StatePath = Join-Path $StateDir "routing-mode.json"
  $State | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $StatePath -Encoding UTF8
  Write-Host ("Routing mode {0}: {1} -> {2}" -f $Mode, $Name, $StatePath)
}

Write-Host ("Context routing cutover complete: {0} ({1})" -f $Mode, ($Selected -join ", "))
