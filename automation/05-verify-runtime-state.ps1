param([ValidateSet("codex","grok","antigravity","cursor","all")][string]$Platform = "all")
$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$UserHome = if ($env:USERPROFILE) { $env:USERPROFILE } elseif ($env:HOME) { $env:HOME } else { throw "Cannot resolve user home directory" }
$PlatformHomes = @{
  codex = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $UserHome ".codex" }
  grok = if ($env:GROK_HOME) { $env:GROK_HOME } else { Join-Path $UserHome ".grok" }
  antigravity = Join-Path $UserHome ".gemini\config"
  cursor = Join-Path $UserHome ".cursor"
}
$Selected = if ($Platform -eq "all") { @("codex", "grok", "antigravity", "cursor") } else { @($Platform) }

foreach ($Name in $Selected) {
  $RuntimeHome = $PlatformHomes[$Name]
  $Manifest = Join-Path $RuntimeHome "agent-rules-manifest.json"
  $State = Join-Path $RuntimeHome "agent-rules-integrations.json"
  if (-not (Test-Path $Manifest)) { throw "Missing runtime manifest for ${Name}: $Manifest" }
  if (-not (Test-Path $State)) { throw "Missing integration state for ${Name}: $State" }
  Write-Host "Runtime state PASS: $Name"
}
