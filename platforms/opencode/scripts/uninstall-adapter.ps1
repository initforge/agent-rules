param(
  [switch]$Global,
  [switch]$WhatIf,
  [switch]$KeepBackups,
  [string]$Root = (Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)))
)

# Uninstall the OpenCode adapter.
# Default: project-local (.opencode/ in project root).
# --Global: uninstall from ~/.config/opencode/.

$ErrorActionPreference = "Stop"

$OwnedFileName = "agent-rules-owned.json"
$BackupDirName = "agent-rules-backups"

$ProjectRoot = if ($env:INITFORGE_PROJECT_ROOT) { $env:INITFORGE_PROJECT_ROOT } else { (Get-Location).Path }
if ($Global) {
  $UserHome = if ($env:USERPROFILE) { $env:USERPROFILE } elseif ($env:HOME) { $env:HOME } else { throw "Cannot resolve user home" }
  $TargetHome = Join-Path $UserHome ".config\opencode"
} else {
  $TargetHome = Join-Path $ProjectRoot ".opencode"
}

$OwnershipManifest = Join-Path $TargetHome $OwnedFileName
$BackupDir = Join-Path $TargetHome $BackupDirName

function Read-OwnershipManifest {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) { return @() }
  try {
    $Raw = Get-Content -Raw -LiteralPath $Path | ConvertFrom-Json
    return @($Raw | ForEach-Object { [string]$_ })
  } catch { return @() }
}

$ExistingOwned = Read-OwnershipManifest -Path $OwnershipManifest

if ($ExistingOwned.Count -eq 0) {
  Write-Host "No ownership manifest found at $OwnershipManifest. Nothing to uninstall."
  return
}

if ($WhatIf) {
  Write-Host "`n=== OpenCode Adapter Uninstall (WhatIf) ==="
  Write-Host "Target: $TargetHome"
  Write-Host "Would remove $($ExistingOwned.Count) owned files:"
  foreach ($Entry in $ExistingOwned) {
    Write-Host "  REMOVE $Entry"
  }
  Write-Host "Would remove ownership manifest: $OwnershipManifest"
  if (-not $KeepBackups) {
    Write-Host "Would remove backup directory: $BackupDir"
  }
  return
}

# Remove owned files
foreach ($Entry in $ExistingOwned) {
  $Target = Join-Path $TargetHome $Entry
  if (Test-Path -LiteralPath $Target -PathType Leaf) {
    Remove-Item -LiteralPath $Target -Force
    Write-Host "[UNINSTALL] Removed: $Entry"
  } else {
    Write-Host "[UNINSTALL] Already gone: $Entry"
  }
}

# Remove ownership manifest
if (Test-Path -LiteralPath $OwnershipManifest) {
  Remove-Item -LiteralPath $OwnershipManifest -Force
  Write-Host "[UNINSTALL] Removed ownership manifest"
}

# Remove backup directory
if (-not $KeepBackups -and (Test-Path -LiteralPath $BackupDir)) {
  Remove-Item -LiteralPath $BackupDir -Recurse -Force
  Write-Host "[UNINSTALL] Removed backup directory"
}

# Clean up empty agent directory if nothing remains
$AgentDir = Join-Path $TargetHome "agents"
if ((Test-Path -LiteralPath $AgentDir) -and @(Get-ChildItem -LiteralPath $AgentDir -Force).Count -eq 0) {
  Remove-Item -LiteralPath $AgentDir -Force
  Write-Host "[UNINSTALL] Removed empty agents directory"
}

Write-Host "`nOpenCode adapter uninstalled from: $TargetHome"
Write-Host "Files removed: $($ExistingOwned.Count)"
Write-Host "User-native content preserved."
