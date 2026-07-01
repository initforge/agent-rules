param(
  [string]$Root = (Split-Path -Parent $PSScriptRoot),
  [ValidateSet("codex","grok","antigravity","cursor","all")][string]$Platform = "all"
)
$ErrorActionPreference = "Stop"

$UserHome = if ($env:USERPROFILE) { $env:USERPROFILE } elseif ($env:HOME) { $env:HOME } else { throw "Cannot resolve user home" }
$PlatformHomes = @{
  codex = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $UserHome ".codex" }
  grok = if ($env:GROK_HOME) { $env:GROK_HOME } else { Join-Path $UserHome ".grok" }
  antigravity = Join-Path $UserHome ".gemini\config"
  cursor = Join-Path $UserHome ".cursor"
}
$McpConfigPaths = @{
  codex = Join-Path $UserHome ".codex/config.toml"
  grok = Join-Path $UserHome ".grok/mcp.json"
  antigravity = Join-Path $UserHome ".gemini/config/mcp_config.json"
  cursor = Join-Path $UserHome ".cursor/mcp.json"
}
$Selected = if ($Platform -eq "all") { @("codex", "grok", "antigravity", "cursor") } else { @($Platform) }

$Report = @()
$RegistryPath = Join-Path $Root "integrations\registry.json"
$Registry = if (Test-Path $RegistryPath) { Get-Content -Raw $RegistryPath | ConvertFrom-Json } else { $null }

foreach ($Name in $Selected) {
  $RuntimeHome = $PlatformHomes[$Name]
  $ManifestPath = Join-Path $RuntimeHome "agent-rules-manifest.json"
  if (-not (Test-Path $ManifestPath)) {
    $Report += [pscustomobject]@{ platform = $Name; check = "runtime-manifest"; status = "MISSING"; detail = $ManifestPath }
    continue
  }

  $BuildManifest = Join-Path $Root "05-generated\runtime-build\$Name\manifest.json"
  if (Test-Path $BuildManifest) {
    $Installed = Get-Content -Raw $ManifestPath | ConvertFrom-Json
    $Expected = Get-Content -Raw $BuildManifest | ConvertFrom-Json
    $InstalledPaths = $Installed.files | ForEach-Object { $_.Path } | Sort-Object
    $ExpectedPaths = $Expected.files | ForEach-Object { $_.Path } | Sort-Object
    $Extra = Compare-Object $ExpectedPaths $InstalledPaths | Where-Object SideIndicator -eq "=>"
    $Missing = Compare-Object $ExpectedPaths $InstalledPaths | Where-Object SideIndicator -eq "<="
    if ($Extra) { $Report += [pscustomobject]@{ platform = $Name; check = "stale-files"; status = "WARN"; detail = ($Extra.InputObject -join ", ") } }
    if ($Missing) { $Report += [pscustomobject]@{ platform = $Name; check = "missing-files"; status = "MISSING"; detail = ($Missing.InputObject -join ", ") } }

    $HashMismatch = @()
    foreach ($Exp in $Expected.files) {
      $Ins = $Installed.files | Where-Object Path -EQ $Exp.Path | Select-Object -First 1
      if ($Ins -and $Ins.Sha256 -ne $Exp.Sha256) { $HashMismatch += $Exp.Path }
    }
    if ($HashMismatch) {
      $Report += [pscustomobject]@{ platform = $Name; check = "sha256-drift"; status = "NOT_LIVE"; detail = ($HashMismatch -join ", ") }
    }
    if (-not $Extra -and -not $Missing -and -not $HashMismatch) {
      $Report += [pscustomobject]@{ platform = $Name; check = "manifest-parity"; status = "OK"; detail = "paths and hashes match build" }
    }
  }

  $McpPath = $McpConfigPaths[$Name]
  if ($Name -eq "codex") {
    if ((Test-Path $McpPath) -and (Select-String -Path $McpPath -Pattern '\[mcp_servers\.codebase_memory\]' -Quiet)) {
      $Report += [pscustomobject]@{ platform = $Name; check = "mcp-config"; status = "OK"; detail = "codebase_memory in config.toml" }
    } else {
      $Report += [pscustomobject]@{ platform = $Name; check = "mcp-config"; status = "WARN"; detail = "codebase_memory section missing — re-run install" }
    }
  } elseif (Test-Path $McpPath) {
    $Mcp = Get-Content -Raw $McpPath | ConvertFrom-Json
    $Keys = @($Mcp.mcpServers.PSObject.Properties.Name)
    if ($Keys -contains "codebase-memory") {
      $Report += [pscustomobject]@{ platform = $Name; check = "mcp-config"; status = "OK"; detail = "mcp.json has codebase-memory" }
    } else {
      $Report += [pscustomobject]@{ platform = $Name; check = "mcp-config"; status = "WARN"; detail = "mcp.json missing codebase-memory" }
    }
  } else {
    $Report += [pscustomobject]@{ platform = $Name; check = "mcp-config"; status = "WARN"; detail = "no mcp config at $McpPath" }
  }

  if ($Registry) {
    foreach ($Integration in $Registry.integrations) {
      if ($Integration.policy -eq "optional") { continue }
      $VerifyScript = Join-Path $Root $Integration.path "verify.ps1"
      if (-not (Test-Path $VerifyScript)) {
        $Status = if ($Integration.policy -eq "required") { "MISSING" } else { "WARN" }
        $Report += [pscustomobject]@{ platform = $Name; check = $Integration.name; status = $Status; detail = "no verify.ps1" }
        continue
      }
      try {
        & $VerifyScript | Out-Null
        $Report += [pscustomobject]@{ platform = $Name; check = $Integration.name; status = "OK"; detail = "verify pass" }
      } catch {
        $Status = if ($Integration.policy -eq "required") { "NOT_LIVE" } else { "WARN" }
        $Report += [pscustomobject]@{ platform = $Name; check = $Integration.name; status = $Status; detail = $_.Exception.Message }
      }
    }
  }
}

$Report | Format-Table -AutoSize
$Bad = $Report | Where-Object status -in @("MISSING", "NOT_LIVE")
if ($Bad) {
  Write-Error "Doctor found $($Bad.Count) problem(s)"
  exit 1
}
Write-Host "Doctor PASS"
