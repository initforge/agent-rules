param([ValidateSet("codex","grok","antigravity","cursor","all")][string]$Platform = "all")
$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "path-compat.ps1")
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
  $Tools = Join-Path $RuntimeHome "agent-rules-tools"
  foreach ($Tool in @("workctl.py", "workctl.ps1", "workctl.sh", "work-ledger.schema.json")) {
    if (-not (Test-Path -LiteralPath (Join-Path $Tools $Tool))) { throw "Missing portable workctl tool for ${Name}: $Tool" }
  }
  $NativeRequired = switch ($Name) {
    "codex" { Join-Path $RuntimeHome "agents\agent_rules_implementer.toml" }
    "cursor" { Join-Path $RuntimeHome "agents\agent-rules-implementer.md" }
    "grok" { Join-Path $RuntimeHome "agents\agent-rules-implementer.toml" }
    "antigravity" { Join-Path $RuntimeHome "agents\agent-rules-implementer\agent.md" }
  }
  if (-not (Test-Path -LiteralPath $NativeRequired)) { throw "Missing mapped native definition for ${Name}: $NativeRequired" }
  Write-Host "Runtime state PASS: $Name"
}
