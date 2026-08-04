param(
  [string]$Root = (Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))),
  [string]$ClaudeHome = "",
  [string]$OpenCodeConfig = "",
  [switch]$UseLocalBridge,
  [string]$BridgeUrl = "http://127.0.0.1:4000",
  [string]$BridgeApiKey = "local-claude-opencode-bridge",
  [switch]$WhatIf,
  [switch]$DryRun
)

# Mirror the local OpenCode provider/model/agent contract into Claude Code's
# native settings and custom-agent markdown files. Secrets are read locally and
# are never written to stdout.
$ErrorActionPreference = "Stop"

$UserHome = if ($env:USERPROFILE) { $env:USERPROFILE } elseif ($env:HOME) { $env:HOME } else { throw "Cannot resolve user home" }
$TargetHome = if ($ClaudeHome) { [IO.Path]::GetFullPath($ClaudeHome) } elseif ($env:CLAUDE_CONFIG_DIR) { [IO.Path]::GetFullPath($env:CLAUDE_CONFIG_DIR) } else { Join-Path $UserHome ".claude" }
$SourceConfig = if ($OpenCodeConfig) { [IO.Path]::GetFullPath($OpenCodeConfig) } else { Join-Path $UserHome ".config\opencode\opencode.json" }
$BackupDir = Join-Path $TargetHome "agent-rules-backups"

function Write-Diagnostic {
  param([string]$Message, [string]$Level = "INFO")
  if ($WhatIf -or $DryRun) { Write-Host "[$Level][DryRun] $Message" } else { Write-Host "[$Level] $Message" }
}

function Add-Or-ReplaceProperty {
  param([object]$Object, [string]$Name, [object]$Value)
  if ($Object.PSObject.Properties[$Name]) { $Object.$Name = $Value }
  else { $Object | Add-Member -MemberType NoteProperty -Name $Name -Value $Value }
}

function Backup-File {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return }
  New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null
  $Name = [IO.Path]::GetFileName($Path)
  $BackupPath = Join-Path $BackupDir ("$(Get-Date -Format 'yyyyMMdd-HHmmss')-before-opencode-parity-$Name.backup")
  Copy-Item -LiteralPath $Path -Destination $BackupPath -Force
  Write-Diagnostic "Backed up $Name" -Level "BACKUP"
}

function Resolve-OpenCodeOption {
  param([string]$Value)
  if ($Value -match '^\{env:([^}]+)\}$') {
    $EnvName = $Matches[1]
    $Resolved = [Environment]::GetEnvironmentVariable($EnvName, "Process")
    if (-not $Resolved) { $Resolved = [Environment]::GetEnvironmentVariable($EnvName, "User") }
    if (-not $Resolved) { throw "OpenCode option references missing environment variable: $EnvName" }
    return $Resolved
  }
  return $Value
}

function To-YamlString {
  param([string]$Value)
  return ($Value | ConvertTo-Json -Compress)
}

if (-not (Test-Path -LiteralPath $SourceConfig -PathType Leaf)) { throw "OpenCode config is missing: $SourceConfig" }
$OpenCode = Get-Content -Raw -Encoding UTF8 -LiteralPath $SourceConfig | ConvertFrom-Json
$ProviderName = [string]@($OpenCode.enabled_providers)[0]
if (-not $ProviderName) { $ProviderName = ([string]$OpenCode.model -split '/', 2)[0] }
$ProviderProperty = $OpenCode.provider.PSObject.Properties[$ProviderName]
if (-not $ProviderProperty) { throw "OpenCode provider is missing: $ProviderName" }
$Provider = $ProviderProperty.Value
$BaseUrl = Resolve-OpenCodeOption -Value ([string]$Provider.options.baseURL)
$ApiKey = Resolve-OpenCodeOption -Value ([string]$Provider.options.apiKey)
$MainModel = ([string]$OpenCode.model -split '/', 2)[-1]
$SmallModel = ([string]$OpenCode.small_model -split '/', 2)[-1]
if (-not $BaseUrl -or -not $ApiKey -or -not $MainModel -or -not $SmallModel) { throw "OpenCode provider parity data is incomplete" }
$AvailableModels = @($Provider.models.PSObject.Properties.Name)
if ($AvailableModels.Count -eq 0) { throw "OpenCode provider has no model catalog: $ProviderName" }
# Read the session model from model-policy.json, the single place selectors may live
# (enforced by automation/test-native-agent-policy.py). It used to be hardcoded here,
# which duplicated a selector outside the policy and failed validate-context.
$PolicyPath = Join-Path $Root "automation/model-policy.json"
if (-not (Test-Path -LiteralPath $PolicyPath)) { throw "Model policy not found: $PolicyPath" }
$Policy = Get-Content -Raw -LiteralPath $PolicyPath | ConvertFrom-Json
$SessionModel = [string]$Policy.platforms.claude.adapter_defaults.model_selectors.session_bridge.selector
if (-not $SessionModel) { throw "model-policy.json has no platforms.claude session_bridge selector" }
if ($AvailableModels -notcontains $SessionModel) { throw "Required Claude session model is missing from provider catalog: $SessionModel" }
if ($UseLocalBridge) {
  $BaseUrl = $BridgeUrl.TrimEnd('/')
  $ApiKey = $BridgeApiKey
}

$AgentFiles = @()
foreach ($AgentProperty in @($OpenCode.agent.PSObject.Properties)) {
  $Agent = $AgentProperty.Value
  $AgentName = [string]$AgentProperty.Name
  if ($AgentName -notmatch '^[A-Za-z0-9._-]+$') { throw "Unsafe OpenCode agent name: $AgentName" }
  $AgentModel = ([string]$Agent.model -split '/', 2)[-1]
  if ($AgentName -eq "supervisor-main") { $AgentModel = $SessionModel }
  elseif (-not $AgentModel) { $AgentModel = $MainModel }
  $Description = [string]$Agent.description
  $Prompt = [string]$Agent.prompt
  $Markdown = @"
---
name: $AgentName
description: $(To-YamlString $Description)
model: $AgentModel
permissionMode: bypassPermissions
---

$Prompt
"@
  $AgentFiles += [pscustomobject]@{
    Name = $AgentName
    Relative = "agents/$AgentName.md"
    Content = $Markdown
  }
}

Write-Diagnostic "Provider: $ProviderName"
Write-Diagnostic "OpenCode default model: $MainModel"
Write-Diagnostic "Claude session/supervisor model: $SessionModel"
Write-Diagnostic "Small model: $SmallModel"
Write-Diagnostic "Endpoint: $BaseUrl"
Write-Diagnostic "Available models: $($AvailableModels -join ', ')"
Write-Diagnostic "Agents: $($AgentFiles.Count)"
if ($WhatIf -or $DryRun) { return }

New-Item -ItemType Directory -Force -Path $TargetHome, $BackupDir | Out-Null
$SettingsPath = Join-Path $TargetHome "settings.json"
Backup-File -Path $SettingsPath
$Settings = if (Test-Path -LiteralPath $SettingsPath -PathType Leaf) {
  Get-Content -Raw -Encoding UTF8 -LiteralPath $SettingsPath | ConvertFrom-Json
} else { [pscustomobject]@{} }

$SettingsEnv = if ($Settings.PSObject.Properties["env"]) { $Settings.env } else { [pscustomobject]@{} }
Add-Or-ReplaceProperty -Object $SettingsEnv -Name "ANTHROPIC_BASE_URL" -Value $BaseUrl
Add-Or-ReplaceProperty -Object $SettingsEnv -Name "ANTHROPIC_AUTH_TOKEN" -Value $ApiKey
Add-Or-ReplaceProperty -Object $SettingsEnv -Name "ANTHROPIC_MODEL" -Value $SessionModel
Add-Or-ReplaceProperty -Object $SettingsEnv -Name "ANTHROPIC_SMALL_FAST_MODEL" -Value $SmallModel
Add-Or-ReplaceProperty -Object $SettingsEnv -Name "CLAUDE_CODE_SUBAGENT_MODEL" -Value $SmallModel
Add-Or-ReplaceProperty -Object $SettingsEnv -Name "ANTHROPIC_DEFAULT_OPUS_MODEL" -Value $SessionModel
Add-Or-ReplaceProperty -Object $SettingsEnv -Name "ANTHROPIC_DEFAULT_SONNET_MODEL" -Value $SessionModel
Add-Or-ReplaceProperty -Object $SettingsEnv -Name "ANTHROPIC_DEFAULT_HAIKU_MODEL" -Value $SmallModel
Add-Or-ReplaceProperty -Object $Settings -Name "env" -Value $SettingsEnv
Add-Or-ReplaceProperty -Object $Settings -Name "model" -Value $SessionModel
Add-Or-ReplaceProperty -Object $Settings -Name "availableModels" -Value $AvailableModels

$Permissions = if ($Settings.PSObject.Properties["permissions"]) { $Settings.permissions } else { [pscustomobject]@{} }
Add-Or-ReplaceProperty -Object $Permissions -Name "defaultMode" -Value "bypassPermissions"
# Claude's permission schema does not accept OpenCode's global `*` allow rule;
# bypassPermissions is the native equivalent and avoids an invalid settings warning.
if ($Permissions.PSObject.Properties["allow"]) { $Permissions.PSObject.Properties.Remove("allow") }
Add-Or-ReplaceProperty -Object $Settings -Name "permissions" -Value $Permissions
[IO.File]::WriteAllText($SettingsPath, ($Settings | ConvertTo-Json -Depth 30), [Text.UTF8Encoding]::new($false))
Write-Diagnostic "Mirrored provider/model settings into settings.json"

$AgentsHome = Join-Path $TargetHome "agents"
New-Item -ItemType Directory -Force -Path $AgentsHome | Out-Null
foreach ($AgentFile in $AgentFiles) {
  $Path = Join-Path $TargetHome ($AgentFile.Relative -replace '/', [IO.Path]::DirectorySeparatorChar)
  if (Test-Path -LiteralPath $Path -PathType Leaf) { Backup-File -Path $Path }
  [IO.File]::WriteAllText($Path, $AgentFile.Content, [Text.UTF8Encoding]::new($false))
  Write-Diagnostic "Synced agent: $($AgentFile.Name)"
}

Write-Host "`nOpenCode parity synced into Claude Code: $TargetHome"
Write-Host "Bypass: permissions.defaultMode=bypassPermissions"
Write-Host "Credential: copied from OpenCode locally (value hidden)"
