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
    $TomlChecks = @{
      "mcp-config-codebase-memory" = '\[mcp_servers\.codebase_memory\]'
      "mcp-config-context7"        = '\[mcp_servers\.context7\]'
      "mcp-config-playwright"      = '\[mcp_servers\.playwright\]'
      "mcp-config-chrome-devtools" = '\[mcp_servers\.chrome_devtools\]'
    }
    foreach ($Check in $TomlChecks.GetEnumerator()) {
      $Ok = (Test-Path $McpPath) -and (Select-String -Path $McpPath -Pattern $Check.Value -Quiet)
      if ($Ok) {
        $Report += [pscustomobject]@{ platform = $Name; check = $Check.Key; status = "OK"; detail = "present in config.toml" }
      } else {
        $Report += [pscustomobject]@{ platform = $Name; check = $Check.Key; status = "WARN"; detail = "missing - re-run install" }
      }
    }
    try {
      $CodexMcpOutput = (& codex mcp list 2>&1 | Out-String).Trim()
      if ($LASTEXITCODE -eq 0) {
        $Report += [pscustomobject]@{ platform = $Name; check = "mcp-config-parse"; status = "OK"; detail = "codex mcp list parsed config.toml" }
      } else {
        $Report += [pscustomobject]@{ platform = $Name; check = "mcp-config-parse"; status = "NOT_LIVE"; detail = $CodexMcpOutput }
      }
    } catch {
      $Report += [pscustomobject]@{ platform = $Name; check = "mcp-config-parse"; status = "NOT_LIVE"; detail = $_.Exception.Message }
    }
  } elseif (Test-Path $McpPath) {
    $Mcp = Get-Content -Raw $McpPath | ConvertFrom-Json
    $Keys = @($Mcp.mcpServers.PSObject.Properties.Name)
    $JsonChecks = @{
      "mcp-config-codebase-memory" = "codebase-memory"
      "mcp-config-context7"        = "context7"
      "mcp-config-playwright"      = "playwright"
      "mcp-config-chrome-devtools" = "chrome-devtools"
    }
    foreach ($Check in $JsonChecks.GetEnumerator()) {
      if ($Keys -contains $Check.Value) {
        $Report += [pscustomobject]@{ platform = $Name; check = $Check.Key; status = "OK"; detail = "mcp.json has $($Check.Value)" }
      } else {
        $Report += [pscustomobject]@{ platform = $Name; check = $Check.Key; status = "WARN"; detail = "mcp.json missing $($Check.Value)" }
      }
    }
  } else {
    $Report += [pscustomobject]@{ platform = $Name; check = "mcp-config"; status = "WARN"; detail = "no mcp config at $McpPath" }
  }

  if ($Registry) {
    foreach ($Integration in $Registry.integrations) {
      if ($Integration.policy -eq "optional") { continue }
      $VerifyScript = Join-Path (Join-Path $Root $Integration.path) "verify.ps1"
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

# Grok: inject path must be lean-only (no legacy dual tree)
$GrokHome = $PlatformHomes["grok"]
$GrokInject = Join-Path (Join-Path $GrokHome ".grok") "rules"
$GrokManifestRules = Join-Path $GrokHome "rules"
$LegacyNames = @("00-index.md", "01-agent-workflow-sop.md", "00-universal-frontier-contract.md", "07-finish-to-completion.md", "antigravity-overlay.md", "platform-boundary.md", "08-ui-consistency-gate.md")
if (Test-Path $GrokInject) {
  $LegacyHits = @()
  foreach ($Ln in $LegacyNames) {
    if (Test-Path (Join-Path $GrokInject $Ln)) { $LegacyHits += $Ln }
  }
  if ($LegacyHits.Count -gt 0) {
    $Report += [pscustomobject]@{
      platform = "grok"
      check    = "legacy-inject-rules"
      status   = "NOT_LIVE"
      detail   = "Legacy dual-tree still at $GrokInject : $($LegacyHits -join ', ') - re-run 02-install-runtime"
    }
  } else {
    $LeanOk = (Test-Path (Join-Path $GrokInject "00-bootstrap.md")) -and (Test-Path (Join-Path $GrokInject "10-execution.md"))
    if (-not $LeanOk) {
      $Report += [pscustomobject]@{
        platform = "grok"
        check    = "inject-rules-lean"
        status   = "MISSING"
        detail   = "Inject path missing lean core: $GrokInject"
      }
    } else {
      # Hash sample: inject bootstrap must match installed rules/bootstrap when both exist
      if (Test-Path (Join-Path $GrokManifestRules "00-bootstrap.md")) {
        $H1 = (Get-FileHash -Algorithm SHA256 (Join-Path $GrokInject "00-bootstrap.md")).Hash
        $H2 = (Get-FileHash -Algorithm SHA256 (Join-Path $GrokManifestRules "00-bootstrap.md")).Hash
        if ($H1 -ne $H2) {
          $Report += [pscustomobject]@{
            platform = "grok"
            check    = "inject-vs-rules-drift"
            status   = "NOT_LIVE"
            detail   = "Inject path drift vs $GrokManifestRules - re-run install"
          }
        } else {
          $Report += [pscustomobject]@{
            platform = "grok"
            check    = "inject-rules-lean"
            status   = "OK"
            detail   = "Lean inject path matches installed rules"
          }
        }
      } else {
        $Report += [pscustomobject]@{
          platform = "grok"
          check    = "inject-rules-lean"
          status   = "OK"
          detail   = "Lean inject path present"
        }
      }
    }
  }
} elseif (Test-Path (Join-Path $GrokHome "agent-rules-manifest.json")) {
  $Report += [pscustomobject]@{
    platform = "grok"
    check    = "inject-rules-lean"
    status   = "MISSING"
    detail   = "Grok installed but inject path missing: $GrokInject"
  }
}

$Report | Format-Table -AutoSize
$Bad = $Report | Where-Object status -in @("MISSING", "NOT_LIVE")
if ($Bad) {
  Write-Error "Doctor found $($Bad.Count) problem(s)"
  exit 1
}
Write-Host "Doctor PASS"
