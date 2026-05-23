$ErrorActionPreference = "Continue"

$machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($machinePath -or $userPath -or $env:PATH) {
  $parts = @()
  foreach ($segment in @($machinePath, $userPath, $env:PATH)) {
    if (-not [string]::IsNullOrWhiteSpace($segment)) {
      $parts += $segment -split ';'
    }
  }

  $env:PATH = ($parts | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -Unique) -join ";"
}

$codexHome = "$env:USERPROFILE\.codex"
$inv = Join-Path $codexHome "inventory"
$docs = Join-Path $codexHome "docs"

New-Item -ItemType Directory -Force -Path $inv | Out-Null
New-Item -ItemType Directory -Force -Path $docs | Out-Null

function Get-CmdInfo($name) {
  $cmd = Get-Command $name -ErrorAction SilentlyContinue

  if (-not $cmd) {
    return [ordered]@{
      name = $name
      found = $false
      path = $null
      version = $null
    }
  }

  $version = $null

  try {
    switch ($name) {
      "codex"       { $version = (& codex --version 2>$null | Select-Object -First 1) }
      "rtk"         { $version = (& rtk --version 2>$null | Select-Object -First 1) }
      "git"         { $version = (& git --version 2>$null | Select-Object -First 1) }
      "node"        { $version = (& node --version 2>$null | Select-Object -First 1) }
      "npm"         { $version = (& npm --version 2>$null | Select-Object -First 1) }
      "pnpm"        { $version = (& pnpm --version 2>$null | Select-Object -First 1) }
      "python"      { $version = (& python --version 2>$null | Select-Object -First 1) }
      "rg"          { $version = (& rg --version 2>$null | Select-Object -First 1) }
      "fd"          { $version = (& fd --version 2>$null | Select-Object -First 1) }
      "jq"          { $version = (& jq --version 2>$null | Select-Object -First 1) }
      "flutter"     { $version = (& flutter --version 2>$null | Select-Object -First 1) }
      "dart"        { $version = (& dart --version 2>$null | Select-Object -First 1) }
      "npx"         { $version = (& npx --version 2>$null | Select-Object -First 1) }
      default       { $version = (& $name --version 2>$null | Select-Object -First 1) }
    }
  } catch {}

  return [ordered]@{
    name = $name
    found = $true
    path = $cmd.Source
    version = $version
  }
}

$tools = @(
  "codex",
  "rtk",
  "git",
  "node",
  "npm",
  "pnpm",
  "python",
  "rg",
  "fd",
  "jq",
  "flutter",
  "dart",
  "npx"
)

$toolInfo = foreach ($t in $tools) {
  Get-CmdInfo $t
}

$toolInfo |
  ConvertTo-Json -Depth 5 |
  Set-Content -Encoding UTF8 (Join-Path $inv "tools.json")

$envInfo = [ordered]@{
  COMPUTERNAME = $env:COMPUTERNAME
  USERNAME = $env:USERNAME
  USERPROFILE = $env:USERPROFILE
  PSVersion = $PSVersionTable.PSVersion.ToString()
  PATH = $env:PATH
}

$envInfo |
  ConvertTo-Json -Depth 5 |
  Set-Content -Encoding UTF8 (Join-Path $inv "env.json")

$paths = [ordered]@{
  CodexHome = $codexHome
  AgentRules = "P:\agent-rules"
  CodexConfig = (Join-Path $codexHome "config.toml")
  CodexAgents = (Join-Path $codexHome "agents")
  CodexSkills = (Join-Path $codexHome "skills")
}

$paths |
  ConvertTo-Json -Depth 5 |
  Set-Content -Encoding UTF8 (Join-Path $inv "paths.json")

$config = Join-Path $codexHome "config.toml"

if (Test-Path $config) {
  Copy-Item $config (Join-Path $inv "codex-config.snapshot.toml") -Force
}

try {
  codex mcp list |
    Set-Content -Encoding UTF8 (Join-Path $inv "mcp-list.txt")
} catch {
  "codex mcp list failed or codex unavailable: $($_.Exception.Message)" |
    Set-Content -Encoding UTF8 (Join-Path $inv "mcp-list.txt")
}

$summary = @()
$summary += "# Machine Profile"
$summary += ""
$summary += "Last updated: $(Get-Date -Format o)"
$summary += ""
$summary += "## Tools"
$summary += ""
$summary += "| Tool | Found | Version | Path |"
$summary += "|---|---:|---|---|"

foreach ($t in $toolInfo) {
  $summary += "| $($t.name) | $($t.found) | $($t.version) | $($t.path) |"
}

$summary += ""
$summary += "## Inventory files"
$summary += "- inventory/tools.json"
$summary += "- inventory/env.json"
$summary += "- inventory/paths.json"
$summary += "- inventory/codex-config.snapshot.toml"
$summary += "- inventory/mcp-list.txt"

$summary -join "`n" |
  Set-Content -Encoding UTF8 (Join-Path $docs "machine-profile.md")

Write-Host "[Inventory] wrote $inv and docs/machine-profile.md"
