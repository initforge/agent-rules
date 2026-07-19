param([ValidateSet("codex","grok","antigravity","cursor","all")][string]$Platform = "all")
$ErrorActionPreference = "Stop"
$SkipRuntimeHooks = $env:AGENT_RULES_SKIP_RUNTIME_HOOKS -eq "1"
$SkipIntegrationInstall = $env:AGENT_RULES_SKIP_INTEGRATION_INSTALL -eq "1"
. (Join-Path $PSScriptRoot "path-compat.ps1")

$Root = Split-Path -Parent $PSScriptRoot
& (Join-Path $PSScriptRoot "03-validate-context.ps1")
if ($LASTEXITCODE -ne 0) { throw "validate-context failed - fix harness before runtime install" }
& (Join-Path $PSScriptRoot "01-build-runtime.ps1") -Root $Root
. (Join-Path $PSScriptRoot "Merge-Mcp-Adapters.ps1")

$UserHome = if ($env:USERPROFILE) { $env:USERPROFILE } elseif ($env:HOME) { $env:HOME } else { throw "Cannot resolve user home directory" }
$PlatformHomes = @{
  codex = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $UserHome ".codex" }
  grok = if ($env:GROK_HOME) { $env:GROK_HOME } else { Join-Path $UserHome ".grok" }
  antigravity = Join-Path $UserHome ".gemini\config"
  cursor = Join-Path $UserHome ".cursor"
}
$Selected = if ($Platform -eq "all") { @("codex", "grok", "antigravity", "cursor") } else { @($Platform) }
$BuildRoot = Join-Path $Root "05-generated\runtime-build"
$Registry = Get-Content -Raw (Join-Path $Root "integrations\registry.json") | ConvertFrom-Json
$IntegrationState = @()
$SharedIntegrations = @{}

function Stage-Adapters {
  param(
    [pscustomobject]$Integration,
    [string]$PlatformName,
    [string]$RuntimeHome
  )

  $AdaptersRoot = Join-Path $Root $Integration.path
  $SourceAdapter = switch ($PlatformName) {
    "codex" { Join-Path $AdaptersRoot "adapters\codex.toml" }
    "grok" { Join-Path $AdaptersRoot "adapters\grok.json" }
    "antigravity" { Join-Path $AdaptersRoot "adapters\antigravity.json" }
    "cursor" { Join-Path $AdaptersRoot "adapters\cursor.json" }
  }

  if (-not (Test-Path $SourceAdapter)) { return $null }

  $TargetDir = Join-Path $RuntimeHome "agent-rules-adapters"
  New-Item -ItemType Directory -Force -Path $TargetDir | Out-Null
  $TargetPath = Join-Path $TargetDir ([IO.Path]::GetFileName($SourceAdapter))
  Copy-Item -LiteralPath $SourceAdapter -Destination $TargetPath -Force
  return $TargetPath
}

function Install-Integration {
  param(
    [pscustomobject]$Integration,
    [string]$PlatformName,
    [string]$RuntimeHome,
    [switch]$SkipInstall
  )

  $Path = Join-Path $Root $Integration.path
  $InstallScript = Join-Path $Path "install.ps1"
  $VerifyScript = Join-Path $Path "verify.ps1"
  $State = [ordered]@{
    name = $Integration.name
    policy = $Integration.policy
    platform = $PlatformName
    installed = $false
    verified = $false
    adapterStaged = $false
    adapterPath = ""
    note = ""
  }

  if (-not (Test-Path $InstallScript)) {
    $State.note = "Missing install script"
    return [pscustomobject]$State
  }

  try {
    if ($SkipInstall) {
      $State.installed = $true
      $State.note = "Shared integration install reused"
    } else {
      & $InstallScript | Out-Null
      $State.installed = $true
    }
    $AdapterPath = Stage-Adapters -Integration $Integration -PlatformName $PlatformName -RuntimeHome $RuntimeHome
    if ($AdapterPath) {
      $State.adapterStaged = $true
      $State.adapterPath = $AdapterPath
    }
    if (Test-Path $VerifyScript) {
      & $VerifyScript | Out-Null
      $State.verified = $true
    } else {
      $State.verified = $false
      $State.note = "No verify script"
    }
  } catch {
    $State.note = $_.Exception.Message
    if ($Integration.policy -eq "required") { throw }
  }

  return [pscustomobject]$State
}

function Install-RulesSkillsDocs {
  param(
    [string]$Source,
    [string]$Dest,
    [string[]]$Folders = @("rules", "skills", "docs")
  )
  foreach ($Folder in $Folders) {
    $SrcFolder = Join-Path $Source $Folder
    $TargetFolder = Join-Path $Dest $Folder
    if (Test-Path $TargetFolder) { Remove-Item -LiteralPath $TargetFolder -Recurse -Force }
    New-Item -ItemType Directory -Force -Path $TargetFolder | Out-Null
    if (Test-Path $SrcFolder) {
      Copy-Item -Path (Join-Path $SrcFolder "*") -Destination $TargetFolder -Recurse -Force
    }
  }
}

# Grok native discovery loads global rules from $GROK_HOME/.grok/rules (not $GROK_HOME/rules).
# Install lean rules to both: doctor/manifest path + inject path. Wipe legacy dual-tree.
function Sync-GrokInjectRules {
  param([string]$GrokHome, [string]$BuildRulesDir)
  $InjectRules = Join-Path (Join-Path $GrokHome ".grok") "rules"
  $LegacyMarkers = @("00-index.md", "01-agent-workflow-sop.md", "07-finish-to-completion.md", "antigravity-overlay.md", "platform-boundary.md")
  $HadLegacy = $false
  if (Test-Path $InjectRules) {
    foreach ($M in $LegacyMarkers) {
      if (Test-Path (Join-Path $InjectRules $M)) { $HadLegacy = $true; break }
    }
    if ($HadLegacy) {
      $Stamp = Get-Date -Format "yyyyMMdd-HHmmss"
      $Backup = Join-Path $GrokHome (".legacy-rules-backup-" + $Stamp)
      Write-Host "Archiving legacy Grok inject rules -> $Backup"
      New-Item -ItemType Directory -Force -Path $Backup | Out-Null
      Move-Item -LiteralPath $InjectRules -Destination (Join-Path $Backup "rules") -Force
    } else {
      Remove-Item -LiteralPath $InjectRules -Recurse -Force
    }
  }
  New-Item -ItemType Directory -Force -Path $InjectRules | Out-Null
  if (Test-Path $BuildRulesDir) {
    Copy-Item -Path (Join-Path $BuildRulesDir "*") -Destination $InjectRules -Recurse -Force
  }
  Write-Host "Grok inject rules synced -> $InjectRules"
}

foreach ($Name in $Selected) {
  $Source = Join-Path $BuildRoot $Name
  $Dest = $PlatformHomes[$Name]
  New-Item -ItemType Directory -Force -Path $Dest | Out-Null

  if ($Name -eq "cursor") {
    Install-RulesSkillsDocs -Source $Source -Dest $Dest -Folders @("rules", "skills")
    $DocsDest = Join-Path $Dest "agent-rules-docs"
    if (Test-Path $DocsDest) { Remove-Item -LiteralPath $DocsDest -Recurse -Force }
    $DocsSrc = Join-Path $Source "docs"
    if (Test-Path $DocsSrc) {
      Copy-Item -Path $DocsSrc -Destination $DocsDest -Recurse -Force
    }
  } else {
    Install-RulesSkillsDocs -Source $Source -Dest $Dest
  }

  $RuntimeAgents = Join-Path $Source "AGENTS.md"
  if (Test-Path $RuntimeAgents) {
    Copy-Item -LiteralPath $RuntimeAgents -Destination (Join-Path $Dest "AGENTS.md") -Force
  }

  $RuntimeScripts = Join-Path $Source "scripts"
  if (Test-Path -LiteralPath $RuntimeScripts) {
    New-Item -ItemType Directory -Force -Path (Join-Path $Dest "scripts") | Out-Null
    Copy-Item -Path (Join-Path $RuntimeScripts "*") -Destination (Join-Path $Dest "scripts") -Recurse -Force
  }

  $ContextGraph = Join-Path $Source "context-graph.json"
  if (Test-Path -LiteralPath $ContextGraph) {
    Copy-Item -LiteralPath $ContextGraph -Destination (Join-Path $Dest "context-graph.json") -Force
  }
  foreach ($RouteContract in @("context-route-cases.json", "context-route-cases.schema.json")) {
    $RouteContractPath = Join-Path $Source $RouteContract
    if (Test-Path -LiteralPath $RouteContractPath) {
      Copy-Item -LiteralPath $RouteContractPath -Destination (Join-Path $Dest $RouteContract) -Force
    }
  }

  if ($Name -eq "grok") {
    Sync-GrokInjectRules -GrokHome $Dest -BuildRulesDir (Join-Path $Source "rules")
  }

  Copy-Item (Join-Path $Source "manifest.json") (Join-Path $Dest "agent-rules-manifest.json") -Force

  if (-not $SkipIntegrationInstall) {
    foreach ($Integration in $Registry.integrations) {
      if ($Integration.policy -eq "optional") { continue }
      $reuse = $SharedIntegrations.ContainsKey([string]$Integration.name)
      $state = Install-Integration -Integration $Integration -PlatformName $Name -RuntimeHome $Dest -SkipInstall:$reuse
      $IntegrationState += $state
      if ($state.installed -and $state.verified) { $SharedIntegrations[[string]$Integration.name] = $true }
    }

    $StatePath = Join-Path $Dest "agent-rules-integrations.json"
    [System.IO.File]::WriteAllText($StatePath, ($IntegrationState | Where-Object platform -eq $Name | ConvertTo-Json -Depth 4))
  } else {
    Write-Host "Integration install skipped (AGENT_RULES_SKIP_INTEGRATION_INSTALL=1)"
  }

  $McpMerged = Merge-PlatformMcpAdapters -PlatformName $Name -RuntimeHome $Dest -UserHome $UserHome -Root $Root
  if ($McpMerged) { Write-Host "Merged MCP adapters for $Name" }

  Write-Host "Installed $Name -> $Dest"
}

if (-not $SkipRuntimeHooks) {
  $HooksScript = Join-Path $PSScriptRoot "11-install-runtime-hooks.sh"
# Prefer Git Bash on Windows; system `bash` may be a broken WSL relay.
$BashCandidates = @(
  (Get-Command bash -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -ErrorAction SilentlyContinue),
  "C:\Program Files\Git\bin\bash.exe",
  "C:\Program Files\Git\usr\bin\bash.exe"
) | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -Unique
$GitBash = $BashCandidates | Where-Object { $_ -match 'Git\\bin\\bash|Git/bin/bash' } | Select-Object -First 1
if (-not $GitBash) { $GitBash = $BashCandidates | Select-Object -First 1 }
if ($GitBash -and (Test-Path -LiteralPath $HooksScript)) {
  Write-Host "Installing runtime hooks via $GitBash ..."
  & $GitBash $HooksScript
  if ($LASTEXITCODE -ne 0) {
    throw "Runtime hooks install failed with exit $LASTEXITCODE - re-run with Git Bash: `"$GitBash`" automation/11-install-runtime-hooks.sh"
  }
  } else {
    throw "Runtime hooks install blocked: Git Bash or automation/11-install-runtime-hooks.sh is missing"
  }
} else {
  Write-Host "Runtime hooks skipped (AGENT_RULES_SKIP_RUNTIME_HOOKS=1); run automation/11-install-runtime-hooks.sh separately"
}

$DoctorArgs = @{ Root = $Root; Platform = $Platform }
if ($env:AGENT_RULES_SKIP_INTEGRATION_VERIFY -eq "1") {
  $DoctorArgs.SkipIntegrationVerify = $true
}
& (Join-Path $PSScriptRoot "09-doctor.ps1") @DoctorArgs
