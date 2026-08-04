param(
  [switch]$WhatIf,
  [switch]$DryRun,
  [switch]$SkipDoctor,
  [string]$ClaudeHome = "",
  [string]$Root = (Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)))
)

# Install the managed Agent Rules runtime into Claude Code's global config home.
# Only files recorded in agent-rules-owned.json are managed. User settings are
# merged with a backup so existing Claude configuration and hooks survive.
$ErrorActionPreference = "Stop"
$OwnedFileName = "agent-rules-owned.json"
$BackupDirName = "agent-rules-backups"
$BuildHome = Join-Path $Root "generated\runtime-build\claude"
$SourceHook = Join-Path $Root "platforms\claude\scripts\context-hook.py"
$ContextRelative = "rules/agent-rules-context.md"

$UserHome = if ($env:USERPROFILE) { $env:USERPROFILE } elseif ($env:HOME) { $env:HOME } else { throw "Cannot resolve user home" }
$TargetHome = if ($ClaudeHome) { [IO.Path]::GetFullPath($ClaudeHome) } elseif ($env:CLAUDE_CONFIG_DIR) { [IO.Path]::GetFullPath($env:CLAUDE_CONFIG_DIR) } else { Join-Path $UserHome ".claude" }
$OwnershipManifest = Join-Path $TargetHome $OwnedFileName
$BackupDir = Join-Path $TargetHome $BackupDirName

function Write-Diagnostic {
  param([string]$Message, [string]$Level = "INFO")
  if ($WhatIf -or $DryRun) { Write-Host "[$Level][DryRun] $Message" } else { Write-Host "[$Level] $Message" }
}

function Read-OwnershipManifest {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return @() }
  try {
    $Raw = Get-Content -Raw -Encoding UTF8 -LiteralPath $Path | ConvertFrom-Json
    return @($Raw | ForEach-Object { [string]$_ })
  } catch { throw "Invalid ownership manifest: $Path" }
}

function Get-RelativePath {
  param([string]$Base, [string]$Path)
  $BaseFull = [IO.Path]::GetFullPath($Base).TrimEnd([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar)
  $PathFull = [IO.Path]::GetFullPath($Path)
  return $PathFull.Substring($BaseFull.Length + 1).Replace('\', '/')
}

function Backup-File {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return }
  $Stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $Relative = (Get-RelativePath -Base $TargetHome -Path $Path) -replace '/', '-'
  $BackupPath = Join-Path $BackupDir "$Stamp-$Relative.backup"
  New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null
  Copy-Item -LiteralPath $Path -Destination $BackupPath -Force
  Write-Diagnostic "Backed up $Relative -> $BackupPath" -Level "BACKUP"
}

function Add-Or-ReplaceProperty {
  param([object]$Object, [string]$Name, [object]$Value)
  if ($Object.PSObject.Properties[$Name]) { $Object.$Name = $Value }
  else { $Object | Add-Member -MemberType NoteProperty -Name $Name -Value $Value }
}

function Get-PythonCommand {
  $Candidate = if ($env:AGENT_RULES_PYTHON) { $env:AGENT_RULES_PYTHON } elseif ($env:HARNESS_PYTHON) { $env:HARNESS_PYTHON } else { "python" }
  $Resolved = Get-Command $Candidate -ErrorAction SilentlyContinue
  if (-not $Resolved) { throw "Python is required for the Claude Code context hook" }
  return $Resolved.Source
}

function Get-ClaudeMcpServers {
  $AdapterPaths = @(
    "integrations/required/codebase-memory-mcp/adapters/claude.json",
    "integrations/required/playwright-mcp/adapters/claude.json",
    "integrations/required/chrome-devtools-mcp/adapters/claude.json",
    "integrations/recommended/context7/adapters/claude.json"
  )
  $Servers = [ordered]@{}
  foreach ($RelativePath in $AdapterPaths) {
    $Path = Join-Path $Root ($RelativePath -replace '/', [IO.Path]::DirectorySeparatorChar)
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { throw "Claude MCP adapter is missing: $Path" }
    $Adapter = Get-Content -Raw -Encoding UTF8 -LiteralPath $Path | ConvertFrom-Json
    foreach ($Property in @($Adapter.mcpServers.PSObject.Properties)) {
      $Server = $Property.Value
      if ([string]$Server.command -eq '${CODEBASE_MEMORY_MCP_BIN}') {
        $Binary = Join-Path $env:LOCALAPPDATA "Programs\codebase-memory-mcp\codebase-memory-mcp.exe"
        if (-not (Test-Path -LiteralPath $Binary -PathType Leaf)) { throw "codebase-memory-mcp binary is missing: $Binary" }
        $Server.command = $Binary
      }
      $Servers[$Property.Name] = $Server
    }
  }
  return $Servers
}

if (-not (Test-Path -LiteralPath $SourceHook -PathType Leaf)) { throw "Claude context hook source is missing: $SourceHook" }

# Build from canonical source so the installer never copies a stale generated tree.
if (-not $WhatIf -and -not $DryRun) {
  & (Join-Path $Root "automation\03-validate-context.ps1")
  if ($LASTEXITCODE -ne 0) { throw "validate-context failed - fix harness before Claude install" }
  & (Join-Path $Root "automation\01-build-runtime.ps1") -Root $Root
}
if (-not (Test-Path -LiteralPath $BuildHome)) { throw "Claude runtime build is missing: $BuildHome" }

$ExistingOwned = @(Read-OwnershipManifest -Path $OwnershipManifest)
$InstallFiles = @()
Get-ChildItem -LiteralPath $BuildHome -Recurse -File | ForEach-Object {
  $Relative = Get-RelativePath -Base $BuildHome -Path $_.FullName
  $TargetRelative = if ($Relative -eq "AGENTS.md") { "CLAUDE.md" } else { $Relative }
  $InstallFiles += [pscustomobject]@{ Source = $_.FullName; TargetRelative = $TargetRelative }
}
$InstallFiles += [pscustomobject]@{ Source = $SourceHook; TargetRelative = "scripts/context-hook.py" }
$InstallFiles = @($InstallFiles | Sort-Object TargetRelative -Unique)

# Never overwrite an unowned file. This matches the OpenCode adapter's boundary.
$Collisions = @()
foreach ($File in $InstallFiles) {
  $Target = Join-Path $TargetHome ($File.TargetRelative -replace '/', [IO.Path]::DirectorySeparatorChar)
  if ((Test-Path -LiteralPath $Target) -and ($ExistingOwned -notcontains $File.TargetRelative)) { $Collisions += $File.TargetRelative }
}
if ($Collisions.Count -gt 0) {
  throw "Unowned Claude runtime file(s) already exist: $($Collisions -join ', '). Move them or record ownership before retrying."
}
$ContextTarget = Join-Path $TargetHome ($ContextRelative -replace '/', [IO.Path]::DirectorySeparatorChar)
if ((Test-Path -LiteralPath $ContextTarget) -and ($ExistingOwned -notcontains $ContextRelative)) {
  throw "Unowned Claude context capsule already exists: $ContextTarget"
}

if ($DryRun) {
  Write-Host "`n=== Claude Code Adapter Install (Dry Run) ==="
  Write-Host "Target: $TargetHome"
  Write-Host "Files to install/update: $($InstallFiles.Count)"
  foreach ($File in $InstallFiles) {
    $Target = Join-Path $TargetHome ($File.TargetRelative -replace '/', [IO.Path]::DirectorySeparatorChar)
    Write-Host "  $(if (Test-Path -LiteralPath $Target) { 'UPDATE' } else { 'CREATE' }) $($File.TargetRelative)"
  }
  Write-Host "  $(if (Test-Path -LiteralPath $ContextTarget) { 'UPDATE' } else { 'CREATE' }) $ContextRelative"
  Write-Host "Existing owned files to remove: $(@($ExistingOwned | Where-Object { $InstallFiles.TargetRelative -notcontains $_ }).Count)"
  return
}
if ($WhatIf) {
  Write-Host "`n=== Claude Code Adapter Install (WhatIf) ==="
  Write-Host "Target: $TargetHome"
  Write-Host "Would install/update $($InstallFiles.Count) owned files."
  Write-Host "Would merge UserPromptSubmit hook into settings.json with a backup."
  return
}

New-Item -ItemType Directory -Force -Path $TargetHome, $BackupDir | Out-Null
foreach ($OldEntry in $ExistingOwned) {
  $OldPath = Join-Path $TargetHome ($OldEntry -replace '/', [IO.Path]::DirectorySeparatorChar)
  if (Test-Path -LiteralPath $OldPath -PathType Leaf) { Backup-File -Path $OldPath }
}
foreach ($OldEntry in $ExistingOwned) {
  if ($InstallFiles.TargetRelative -notcontains $OldEntry) {
    $OldPath = Join-Path $TargetHome ($OldEntry -replace '/', [IO.Path]::DirectorySeparatorChar)
    if (Test-Path -LiteralPath $OldPath -PathType Leaf) {
      Remove-Item -LiteralPath $OldPath -Force
      Write-Diagnostic "Removed stale owned file: $OldEntry"
    }
  }
}
foreach ($File in $InstallFiles) {
  $Target = Join-Path $TargetHome ($File.TargetRelative -replace '/', [IO.Path]::DirectorySeparatorChar)
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Target) | Out-Null
  Copy-Item -LiteralPath $File.Source -Destination $Target -Force
  Write-Diagnostic "Installed: $($File.TargetRelative)"
}

# Seed a small prompt capsule. The full rules remain canonical files; this
# capsule is the hook's runtime signal that those rules are active and reachable.
$ContextContent = @"
Agent Rules runtime is active for Claude Code.
Global entrypoint: CLAUDE.md
Canonical source: $Root
Apply the imported rules and route only the minimum required skills/context for this prompt.
"@
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $ContextTarget) | Out-Null
[IO.File]::WriteAllText($ContextTarget, $ContextContent, [Text.UTF8Encoding]::new($false))
Write-Diagnostic "Installed: $ContextRelative"

$ManifestCopy = Join-Path $TargetHome "agent-rules-manifest.json"
Copy-Item -LiteralPath (Join-Path $BuildHome "manifest.json") -Destination $ManifestCopy -Force
$OwnedEntries = @($InstallFiles.TargetRelative | Sort-Object) + @($ContextRelative, "agent-rules-manifest.json")
$OwnedEntries | ConvertTo-Json | Set-Content -Encoding UTF8 -LiteralPath $OwnershipManifest

# Merge, never replace, the user's Claude settings.
$SettingsPath = Join-Path $TargetHome "settings.json"
$Settings = if (Test-Path -LiteralPath $SettingsPath -PathType Leaf) {
  Get-Content -Raw -Encoding UTF8 -LiteralPath $SettingsPath | ConvertFrom-Json
} else { [pscustomobject]@{} }
$Python = Get-PythonCommand
$HookCommand = '"' + $Python + '" "' + (Join-Path $TargetHome "scripts\context-hook.py") + '"'
$Hook = [pscustomobject]@{ type = "command"; command = $HookCommand; timeout = 5 }
$Hooks = if ($Settings.PSObject.Properties["hooks"]) { $Settings.hooks } else { [pscustomobject]@{} }
$UserPromptSubmit = if ($Hooks.PSObject.Properties["UserPromptSubmit"]) { @($Hooks.UserPromptSubmit) } else { @() }
$AlreadyPresent = @($UserPromptSubmit | Where-Object { $_.hooks -and (@($_.hooks) | Where-Object { [string]$_.command -eq $HookCommand }) }).Count -gt 0
if (-not $AlreadyPresent) { $UserPromptSubmit += [pscustomobject]@{ hooks = @($Hook) } }
Add-Or-ReplaceProperty -Object $Hooks -Name "UserPromptSubmit" -Value @($UserPromptSubmit)
Add-Or-ReplaceProperty -Object $Settings -Name "hooks" -Value $Hooks
Backup-File -Path $SettingsPath
$Settings | ConvertTo-Json -Depth 20 | Set-Content -Encoding UTF8 -LiteralPath $SettingsPath

# Merge canonical MCP adapters into Claude's global JSON config. Existing
# servers (for example Pencil) are preserved; managed keys are deterministic.
$ClaudeMcpPath = Join-Path $UserHome ".claude.json"
$ClaudeConfig = if (Test-Path -LiteralPath $ClaudeMcpPath -PathType Leaf) {
  Get-Content -Raw -Encoding UTF8 -LiteralPath $ClaudeMcpPath | ConvertFrom-Json
} else { [pscustomobject]@{} }
$McpServers = if ($ClaudeConfig.PSObject.Properties["mcpServers"]) { $ClaudeConfig.mcpServers } else { [pscustomobject]@{} }
$ManagedMcp = Get-ClaudeMcpServers
foreach ($Property in @($ManagedMcp.GetEnumerator())) { Add-Or-ReplaceProperty -Object $McpServers -Name $Property.Key -Value $Property.Value }
Add-Or-ReplaceProperty -Object $ClaudeConfig -Name "mcpServers" -Value $McpServers
if (Test-Path -LiteralPath $ClaudeMcpPath -PathType Leaf) {
  $McpBackup = Join-Path $BackupDir ("$(Get-Date -Format 'yyyyMMdd-HHmmss')-claude.json.backup")
  Copy-Item -LiteralPath $ClaudeMcpPath -Destination $McpBackup -Force
  Write-Diagnostic "Backed up .claude.json -> $McpBackup" -Level "BACKUP"
}
$ClaudeConfig | ConvertTo-Json -Depth 20 | Set-Content -Encoding UTF8 -LiteralPath $ClaudeMcpPath

$HealthDir = Join-Path $TargetHome "skill-state"
New-Item -ItemType Directory -Force -Path $HealthDir | Out-Null
[pscustomobject]@{
  platform = "claude"
  status = "ADAPTER_PASS"
  adapter_probe = [pscustomobject]@{ status = "PASS"; at = [DateTimeOffset]::UtcNow.ToString("o") }
  native_receipt = $null
  trust_state = "unknown"
} | ConvertTo-Json -Depth 5 | Set-Content -Encoding UTF8 -LiteralPath (Join-Path $HealthDir "hook-health.json")

& (Join-Path $Root "automation\13-cutover-context-routing.ps1") -Platform claude
if (-not $SkipDoctor) { & (Join-Path $PSScriptRoot "doctor.ps1") -Root $Root -ClaudeHome $TargetHome }
Write-Host "`nClaude Code adapter installed at: $TargetHome"
Write-Host "Files: $($OwnedEntries.Count) owned entries"
