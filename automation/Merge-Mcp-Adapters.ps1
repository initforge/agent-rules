$ErrorActionPreference = "Stop"

function Get-CodebaseMcpBin {
  $Cmd = Get-Command codebase-memory-mcp -ErrorAction SilentlyContinue
  if ($Cmd) { return $Cmd.Source }
  $Linux = Join-Path $HOME ".local/share/codebase-memory-mcp/codebase-memory-mcp"
  if (Test-Path $Linux) { return $Linux }
  return $null
}

function Expand-McpPlaceholders {
  param([string]$Text)
  $Bin = Get-CodebaseMcpBin
  if ($Bin) {
    $SafeBin = $Bin.Replace('\', '/')
    return $Text.Replace('${CODEBASE_MEMORY_MCP_BIN}', $SafeBin)
  }
  return $Text
}

function Get-PlatformAdapterFile {
  param([string]$PlatformName)
  switch ($PlatformName) {
    "codex" { return "codex.toml" }
    "grok" { return "grok.json" }
    "antigravity" { return "antigravity.json" }
    "cursor" { return "cursor.json" }
    default { return $null }
  }
}

function Merge-JsonMcpAdapters {
  param(
    [string]$ConfigPath,
    [string[]]$AdapterPaths
  )
  if (-not $AdapterPaths.Count) { return $false }

  $Merged = [ordered]@{ mcpServers = [ordered]@{} }
  if (Test-Path $ConfigPath) {
    $Existing = Get-Content -Raw $ConfigPath | ConvertFrom-Json
    if ($Existing.mcpServers) {
      foreach ($Prop in $Existing.mcpServers.PSObject.Properties) {
        $Merged.mcpServers[$Prop.Name] = $Prop.Value
      }
    }
  }

  $Changed = $false
  foreach ($AdapterPath in $AdapterPaths) {
    if (-not (Test-Path $AdapterPath)) { continue }
    $Raw = Expand-McpPlaceholders (Get-Content -Raw $AdapterPath)
    $Adapter = $Raw | ConvertFrom-Json
    if (-not $Adapter.mcpServers) { continue }
    foreach ($Prop in $Adapter.mcpServers.PSObject.Properties) {
      $Merged.mcpServers[$Prop.Name] = $Prop.Value
      $Changed = $true
    }
  }

  if (-not $Changed) { return $false }
  $Parent = Split-Path $ConfigPath -Parent
  if (-not (Test-Path $Parent)) { New-Item -ItemType Directory -Force -Path $Parent | Out-Null }
  [System.IO.File]::WriteAllText($ConfigPath, ($Merged | ConvertTo-Json -Depth 10))
  return $true
}

function Merge-CodexTomlAdapters {
  param(
    [string]$ConfigPath,
    [string[]]$AdapterPaths
  )
  if (-not $AdapterPaths.Count) { return $false }

  $Content = if (Test-Path $ConfigPath) { Get-Content -Raw $ConfigPath } else { "" }
  $Changed = $false

  foreach ($AdapterPath in $AdapterPaths) {
    if (-not (Test-Path $AdapterPath)) { continue }
    $Block = Expand-McpPlaceholders (Get-Content -Raw $AdapterPath).Trim()
    if ($Block -match '\[mcp_servers\.([^\]]+)\]') {
      $Header = $Matches[0]
      $SectionName = $Matches[1]
      $Pattern = "(?ms)\[mcp_servers\.$([regex]::Escape($SectionName))\][^\[]*"
      if ($Content -match $Pattern) {
        $Content = [regex]::Replace($Content, $Pattern, ($Block + "`n"))
      } else {
        $Content = ($Content.TrimEnd() + "`n`n# agent-rules`n" + $Block + "`n")
      }
      $Changed = $true
    }
  }

  if (-not $Changed) { return $false }
  $Parent = Split-Path $ConfigPath -Parent
  if (-not (Test-Path $Parent)) { New-Item -ItemType Directory -Force -Path $Parent | Out-Null }
  [System.IO.File]::WriteAllText($ConfigPath, $Content)
  return $true
}

function Get-RegistryAdapterPaths {
  param(
    [string]$Root,
    [string]$PlatformName
  )
  $File = Get-PlatformAdapterFile $PlatformName
  if (-not $File) { return @() }

  $RegistryPath = Join-Path $Root "integrations\registry.json"
  if (-not (Test-Path $RegistryPath)) { return @() }
  $Registry = Get-Content -Raw $RegistryPath | ConvertFrom-Json
  $Paths = @()
  foreach ($Integration in $Registry.integrations) {
    if ($Integration.policy -eq "optional") { continue }
    $Candidate = Join-Path (Join-Path $Root ($Integration.path -replace "/", "\")) "adapters\$File"
    if (Test-Path $Candidate) { $Paths += $Candidate }
  }
  return $Paths
}

function Merge-PlatformMcpAdapters {
  param(
    [string]$PlatformName,
    [string]$RuntimeHome,
    [string]$UserHome,
    [string]$Root
  )
  $AdapterPaths = Get-RegistryAdapterPaths -Root $Root -PlatformName $PlatformName
  if (-not $AdapterPaths.Count) { return $false }

  switch ($PlatformName) {
    "cursor" { return Merge-JsonMcpAdapters (Join-Path $UserHome ".cursor/mcp.json") $AdapterPaths }
    "grok" { return Merge-JsonMcpAdapters (Join-Path $UserHome ".grok/mcp.json") $AdapterPaths }
    "antigravity" { return Merge-JsonMcpAdapters (Join-Path $UserHome ".gemini/config/mcp_config.json") $AdapterPaths }
    "codex" { return Merge-CodexTomlAdapters (Join-Path $UserHome ".codex/config.toml") $AdapterPaths }
    default { return $false }
  }
}
