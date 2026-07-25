param(
  [string]$Root = (Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))),
  [string]$OpenCodeHome = "",
  [switch]$WhatIf
)

$ErrorActionPreference = "Stop"

$OwnedFileName = "agent-rules-owned.json"
$ProbeScript = Join-Path $PSScriptRoot "adapter-probe.py"

# Resolve OpenCode home if not provided
if (-not $OpenCodeHome) {
  $ProjectRoot = if ($env:INITFORGE_PROJECT_ROOT) { $env:INITFORGE_PROJECT_ROOT } else { (Get-Location).Path }
  $ProjLocal = Join-Path $ProjectRoot ".opencode"
  $UserHome = if ($env:USERPROFILE) { $env:USERPROFILE } elseif ($env:HOME) { $env:HOME }
  $GlobalHome = if ($UserHome) { Join-Path $UserHome ".config\opencode" } else { $null }

  if (Test-Path (Join-Path $ProjLocal $OwnedFileName)) {
    $OpenCodeHome = $ProjLocal
  } elseif ($GlobalHome -and (Test-Path (Join-Path $GlobalHome $OwnedFileName))) {
    $OpenCodeHome = $GlobalHome
  } else {
    # Check both
    if (Test-Path $ProjLocal) { $OpenCodeHome = $ProjLocal }
    elseif ($GlobalHome -and (Test-Path $GlobalHome)) { $OpenCodeHome = $GlobalHome }
  }
}

$Report = @()

if (-not $OpenCodeHome -or -not (Test-Path -LiteralPath $OpenCodeHome)) {
  $Report += [pscustomobject]@{ check = "runtime-home"; status = "MISSING"; detail = "No OpenCode runtime found" }
  $Report | Format-Table -AutoSize
  return $Report
}

$Mode = if ((Split-Path -Leaf $OpenCodeHome) -eq ".opencode") { "project-local" } else { "global" }

$Report += [pscustomobject]@{ check = "runtime-home"; status = "OK"; detail = "$OpenCodeHome ($Mode)" }

# Check ownership manifest
$OwnershipManifest = Join-Path $OpenCodeHome $OwnedFileName
if (Test-Path -LiteralPath $OwnershipManifest) {
  try {
    $Owned = Get-Content -Raw -LiteralPath $OwnershipManifest | ConvertFrom-Json
    $OwnedCount = @($Owned).Count
    $Report += [pscustomobject]@{ check = "ownership-manifest"; status = "OK"; detail = "$OwnedCount entries" }
  } catch {
    $Report += [pscustomobject]@{ check = "ownership-manifest"; status = "NOT_LIVE"; detail = "Invalid manifest" }
  }
} else {
  $Report += [pscustomobject]@{ check = "ownership-manifest"; status = "MISSING"; detail = "No ownership manifest" }
}

# Check agent files
$AgentDir = Join-Path $OpenCodeHome "agents"
$ExpectedAgents = @(
  "initforge-coordinator.md",
  "initforge-architect.md",
  "initforge-implementer.md",
  "initforge-reviewer.md",
  "initforge-verifier.md",
  "initforge-utility-worker.md"
)
$AgentOk = $true
$MissingAgents = @()
foreach ($Agent in $ExpectedAgents) {
  if (-not (Test-Path (Join-Path $AgentDir $Agent))) {
    $MissingAgents += $Agent
    $AgentOk = $false
  }
}
if ($AgentOk) {
  $Report += [pscustomobject]@{ check = "agents"; status = "OK"; detail = "All $($ExpectedAgents.Count) agents present" }
} else {
  $Report += [pscustomobject]@{ check = "agents"; status = "PARTIAL"; detail = "Missing: $($MissingAgents -join ', ')" }
}

# Check for user-native agents (not initforge-*)
$UserNativeAgents = @()
if (Test-Path -LiteralPath $AgentDir) {
  $UserNativeAgents = @(Get-ChildItem -LiteralPath $AgentDir -File -Filter "*.md" | Where-Object { $_.Name -notlike "initforge-*" -and $_.Name -ne "README.md" } | ForEach-Object { $_.Name })
}
if ($UserNativeAgents.Count -gt 0) {
  $Report += [pscustomobject]@{ check = "user-native-agents"; status = "PRESERVED"; detail = "$($UserNativeAgents.Count) user-native agent(s): $($UserNativeAgents -join ', ')" }
} else {
  $Report += [pscustomobject]@{ check = "user-native-agents"; status = "OK"; detail = "No user-native agents to preserve" }
}

# Check model mapping
$OpenCodeConfig = $null
$ConfigPaths = [System.Collections.ArrayList]::new()
[void]$ConfigPaths.Add([System.IO.Path]::Combine((Split-Path $OpenCodeHome -Parent), "opencode.json"))
[void]$ConfigPaths.Add([System.IO.Path]::Combine($OpenCodeHome, "opencode.json"))
foreach ($CfgPath in $ConfigPaths) {
  if (Test-Path -LiteralPath $CfgPath) {
    try { $OpenCodeConfig = Get-Content -Raw -LiteralPath $CfgPath -Encoding UTF8 | ConvertFrom-Json } catch {}
    break
  }
}

$ModelStatus = "UNSET"
if ($OpenCodeConfig) {
  $Model = if ($OpenCodeConfig.model) { $OpenCodeConfig.model } else { $null }
  if ($Model -and $Model -ne "unset") {
    $ModelStatus = "CONFIGURED"
    $Report += [pscustomobject]@{ check = "model-mapping"; status = "OK"; detail = "Model: $Model" }
  } else {
    $Report += [pscustomobject]@{ check = "model-mapping"; status = "UNSET"; detail = "No model configured in opencode.json" }
  }
} else {
  $Report += [pscustomobject]@{ check = "model-mapping"; status = "NOT_LIVE"; detail = "No opencode.json found" }
}

# Check MCP/config
$McpServers = if ($OpenCodeConfig -and $OpenCodeConfig.mcp) { $OpenCodeConfig.mcp } else { $null }
$McpCount = if ($McpServers) { @($McpServers.PSObject.Properties).Count } else { 0 }
$Report += [pscustomobject]@{ check = "mcp-configuration"; status = $(if ($McpCount -gt 0) { "OK" } else { "EMPTY" }); detail = "$McpCount MCP server(s) configured" }

# Probe execution
$PythonCommand = $env:AGENT_RULES_PYTHON
if (-not $PythonCommand) { $PythonCommand = $env:HARNESS_PYTHON }
if (-not $PythonCommand) {
  foreach ($Candidate in @("python", "python3")) {
    $Resolved = Get-Command $Candidate -ErrorAction SilentlyContinue
    if ($Resolved) { $PythonCommand = $Resolved.Source; break }
  }
}

$ProbeStatus = "SKIP"
$ProbeDetail = "Python not available"
if ($PythonCommand -and (Test-Path -LiteralPath $ProbeScript)) {
  try {
    $ProbeResult = & $PythonCommand $ProbeScript --opencode-home $OpenCodeHome 2>&1 | Out-String
    if ($LASTEXITCODE -eq 0) {
      $ProbeStatus = "ADAPTER_PASS"
      $ProbeDetail = "Probe passed"
    } else {
      $ProbeStatus = "ADAPTER_FAIL"
      $ProbeDetail = $ProbeResult.Trim()
    }
  } catch {
    $ProbeStatus = "ADAPTER_ERROR"
    $ProbeDetail = $_.Exception.Message
  }
}
$Report += [pscustomobject]@{ check = "adapter-probe"; status = $ProbeStatus; detail = $ProbeDetail }

# Summary
$Report | Format-Table -AutoSize

$NotLive = $Report | Where-Object status -in @("MISSING", "NOT_LIVE", "PARTIAL", "ADAPTER_FAIL", "UNSET")
if ($NotLive) {
  Write-Host "Doctor: $($NotLive.Count) issue(s) found."
} else {
  Write-Host "Doctor: All checks pass."
}

return $Report
