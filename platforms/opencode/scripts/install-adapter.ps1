param(
  [switch]$Global,
  [switch]$WhatIf,
  [switch]$DryRun,
  [switch]$SkipDoctor,
  [string]$Root = (Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)))
)

# Install the OpenCode adapter.
# Default: project-local (.opencode/ in project root).
# --Global: install to ~/.config/opencode/.

$ErrorActionPreference = "Stop"

$AdapterNamespace = "initforge"
$OwnedFileName = "agent-rules-owned.json"
$BackupDirName = "agent-rules-backups"

# Resolve target home
$ProjectRoot = if ($env:INITFORGE_PROJECT_ROOT) { $env:INITFORGE_PROJECT_ROOT } else { (Get-Location).Path }
if ($Global) {
  $UserHome = if ($env:USERPROFILE) { $env:USERPROFILE } elseif ($env:HOME) { $env:HOME } else { throw "Cannot resolve user home" }
  $TargetHome = Join-Path $UserHome ".config\opencode"
} else {
  $TargetHome = Join-Path $ProjectRoot ".opencode"
}

$AgentDir = Join-Path $TargetHome "agents"
$SkillDir = Join-Path $TargetHome "skills"
$OwnershipManifest = Join-Path $TargetHome $OwnedFileName
$BackupDir = Join-Path $TargetHome $BackupDirName
$SourceAgents = Join-Path $Root "platforms\opencode\agents"

function Write-Diagnostic {
  param([string]$Message, [string]$Level = "INFO")
  if ($WhatIf -or $DryRun) {
    Write-Host "[$Level][DryRun] $Message"
  } else {
    Write-Host "[$Level] $Message"
  }
}

function Read-OwnershipManifest {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) { return @() }
  try {
    $Raw = Get-Content -Raw -LiteralPath $Path | ConvertFrom-Json
    return @($Raw | ForEach-Object { [string]$_ })
  } catch { return @() }
}

function Write-OwnershipManifest {
  param([string]$Path, [string[]]$Entries)
  $Entries | ConvertTo-Json | Set-Content -Encoding UTF8 -LiteralPath $Path
}

function Backup-File {
  param([string]$Path, [string]$BackupRoot)
  if (-not (Test-Path -LiteralPath $Path)) { return }
  $Relative = $Path.Substring($TargetHome.Length + 1) -replace '\\', '-'
  $BackupPath = Join-Path $BackupRoot "$Relative.backup"
  $BackupRootDir = Split-Path -Parent $BackupPath
  New-Item -ItemType Directory -Force -Path $BackupRootDir | Out-Null
  Copy-Item -LiteralPath $Path -Destination $BackupPath -Force
  Write-Diagnostic "Backed up $Path -> $BackupPath" -Level "BACKUP"
}

# --- Owned files ---
$OwnedFiles = @()
# Agent files (without README.md)
Get-ChildItem -LiteralPath $SourceAgents -File -Filter "*.md" | Where-Object { $_.Name -ne "README.md" } | ForEach-Object {
  $OwnedFiles += @{
    Source = $_.FullName
    TargetRelative = "agents/$($_.Name)"
  }
}

# --- Pre-install checks ---
$ExistingOwned = Read-OwnershipManifest -Path $OwnershipManifest

# Check for unowned file collisions
$Collisions = @()
foreach ($File in $OwnedFiles) {
  $Target = Join-Path $TargetHome $File.TargetRelative
  if ((-not (Test-Path -LiteralPath $Target)) -or ($ExistingOwned -contains $File.TargetRelative)) { continue }
  $Collisions += $File.TargetRelative
}

if ($Collisions.Count -gt 0) {
  $Msg = "Unowned file(s) already exist in target: $($Collisions -join ', '). Use --force to overwrite or move them manually."
  if ($WhatIf -or $DryRun) {
    Write-Diagnostic $Msg -Level "CONFLICT"
  } else {
    throw $Msg
  }
}

# --- Diff preview ---
if ($DryRun) {
  Write-Host "`n=== OpenCode Adapter Install (Dry Run) ==="
  Write-Host "Target: $TargetHome"
  Write-Host "Mode: $(if ($Global) { 'Global' } else { 'Project-local' })"
  Write-Host "`nFiles to install:"
  foreach ($File in $OwnedFiles) {
    $Target = Join-Path $TargetHome $File.TargetRelative
    $Exists = Test-Path -LiteralPath $Target
    $Action = if ($Exists) { "UPDATE" } else { "CREATE" }
    Write-Host "  $Action $($File.TargetRelative)"
    if ($Exists) {
      $OldHash = (Get-FileHash -LiteralPath $Target -Algorithm SHA256).Hash
      $NewHash = (Get-FileHash -LiteralPath $File.Source -Algorithm SHA256).Hash
      if ($OldHash -ne $NewHash) {
        Write-Host "         hash changed (will update)"
      } else {
        Write-Host "         hash unchanged (will skip)"
      }
    }
  }
  Write-Host "`nPreviously owned files to remove: $($ExistingOwned.Count)"
  foreach ($OldEntry in $ExistingOwned) {
    $StillOwned = $OwnedFiles | Where-Object { $_.TargetRelative -eq $OldEntry }
    if (-not $StillOwned) {
      Write-Host "  REMOVE $OldEntry"
    }
  }
  Write-Host "`nDry run complete. Pass -WhatIf for safe execution without output."
  return
}

if ($WhatIf) {
  Write-Host "`n=== OpenCode Adapter Install (WhatIf) ==="
  Write-Host "Target: $TargetHome"
  Write-Host "Would install $($OwnedFiles.Count) files."
  Write-Host "Would remove $($ExistingOwned.Count) stale owned files."
  Write-Host "Would create ownership manifest at $OwnershipManifest"
  return
}

# --- Install ---
New-Item -ItemType Directory -Force -Path $AgentDir | Out-Null
New-Item -ItemType Directory -Force -Path $SkillDir | Out-Null
New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null

# Backup existing owned files before overwriting
foreach ($OldEntry in $ExistingOwned) {
  $OldPath = Join-Path $TargetHome $OldEntry
  if (Test-Path -LiteralPath $OldPath) {
    Backup-File -Path $OldPath -BackupRoot $BackupDir
  }
}

# Remove previously owned files that are no longer in the set
foreach ($OldEntry in $ExistingOwned) {
  $StillOwned = $OwnedFiles | Where-Object { $_.TargetRelative -eq $OldEntry }
  if (-not $StillOwned) {
    $OldPath = Join-Path $TargetHome $OldEntry
    if (Test-Path -LiteralPath $OldPath -PathType Leaf) {
      Remove-Item -LiteralPath $OldPath -Force
      Write-Diagnostic "Removed stale: $OldEntry"
    }
  }
}

# Install files
$InstalledEntries = @()
foreach ($File in $OwnedFiles) {
  $Target = Join-Path $TargetHome $File.TargetRelative
  $TargetDir = Split-Path -Parent $Target
  New-Item -ItemType Directory -Force -Path $TargetDir | Out-Null
  Copy-Item -LiteralPath $File.Source -Destination $Target -Force
  Write-Diagnostic "Installed: $($File.TargetRelative)"
  $InstalledEntries += $File.TargetRelative
}

# Write ownership manifest
Write-OwnershipManifest -Path $OwnershipManifest -Entries $InstalledEntries
Write-Diagnostic "Wrote ownership manifest: $OwnershipManifest ($($InstalledEntries.Count) entries)"

# --- Doctor ---
if (-not $SkipDoctor) {
  $DoctorScript = Join-Path $PSScriptRoot "doctor.ps1"
  if (Test-Path -LiteralPath $DoctorScript) {
    Write-Diagnostic "Running doctor..."
    & $DoctorScript -Root $Root -OpenCodeHome $TargetHome -WhatIf:$WhatIf
  }
}

Write-Host "`nOpenCode adapter installed at: $TargetHome"
Write-Host "Mode: $(if ($Global) { 'Global' } else { 'Project-local' })"
Write-Host "Files: $($InstalledEntries.Count)"
Write-Host "Namespace: $AdapterNamespace"
