param([ValidateSet("codex","grok","antigravity","all")][string]$Platform = "all")
$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$UserHome = if ($env:USERPROFILE) { $env:USERPROFILE } elseif ($env:HOME) { $env:HOME } else { throw "Cannot resolve user home directory" }
$PlatformHomes = @{
  codex = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $UserHome ".codex" }
  grok = if ($env:GROK_HOME) { $env:GROK_HOME } else { Join-Path $UserHome ".grok" }
  antigravity = Join-Path $UserHome ".gemini\config"
}
$Selected = if ($Platform -eq "all") { @("codex", "grok", "antigravity") } else { @($Platform) }
$Result = @()

foreach ($Name in $Selected) {
  $RuntimeHome = $PlatformHomes[$Name]
  $Result += [pscustomobject]@{
    platform = $Name
    runtimeHome = $RuntimeHome
    manifestExists = Test-Path (Join-Path $RuntimeHome "agent-rules-manifest.json")
    integrationsStateExists = Test-Path (Join-Path $RuntimeHome "agent-rules-integrations.json")
  }
}

$Result | ConvertTo-Json -Depth 4
