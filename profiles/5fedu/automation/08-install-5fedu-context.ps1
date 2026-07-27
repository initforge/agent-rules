param(
  [Parameter(Mandatory=$true)][string]$ProjectRoot,
  [ValidateSet("default","tah-app","nostime")][string]$Profile = "default",
  [switch]$SkipPrompts,
  [switch]$Force,
  [switch]$UpdatePointersOnly
)
$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$Utf8NoBom = [System.Text.UTF8Encoding]::new($false)
$RepoRoot = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))
$ProfileRoot = Join-Path $RepoRoot "profiles/5fedu"
$ManagedRoots = @("README.md", "rules", "behaviors", "module-mapping")
$TransactionPattern = '^\.5fedu\.(stage|backup|failed)-([a-f0-9]{32})$'
$TransactionRegex = [regex]::new(
  $TransactionPattern,
  [System.Text.RegularExpressions.RegexOptions]::CultureInvariant
)

function Test-IsReparsePoint {
  param([Parameter(Mandatory=$true)][string]$LiteralPath)
  if (-not (Test-Path -LiteralPath $LiteralPath)) { return $false }
  $Item = Get-Item -LiteralPath $LiteralPath -Force
  return [bool]($Item.Attributes -band [System.IO.FileAttributes]::ReparsePoint)
}

function Assert-TrustedSingleLinkLeaf {
  param([Parameter(Mandatory=$true)][string]$LiteralPath)
  if (-not (Test-Path -LiteralPath $LiteralPath)) { return }
  if (-not (Test-Path -LiteralPath $LiteralPath -PathType Leaf)) {
    throw "Expected a regular file leaf: $LiteralPath"
  }
  $Item = Get-Item -LiteralPath $LiteralPath -Force
  if (Test-IsReparsePoint -LiteralPath $LiteralPath) {
    throw "Symbolic-link/reparse leaf is forbidden: $LiteralPath"
  }
  $LinkTypeProperty = $Item.PSObject.Properties["LinkType"]
  if ($LinkTypeProperty -and [string]$Item.LinkType -eq "HardLink") {
    throw "Hardlinked file leaf is forbidden: $LiteralPath"
  }

  $UnixStatProperty = $Item.PSObject.Properties["UnixStat"]
  if ($UnixStatProperty -and $null -ne $Item.UnixStat) {
    $CountProperty = $Item.UnixStat.PSObject.Properties["HardlinkCount"]
    if (-not $CountProperty) {
      throw "Hardlink count metadata is unavailable; refusing file mutation: $LiteralPath"
    }
    $LinkCount = [int64]$Item.UnixStat.HardlinkCount
    if ($LinkCount -ne 1) {
      throw "File leaf has $LinkCount hardlinks; refusing outside-inode mutation: $LiteralPath"
    }
    return
  }

  if ([System.IO.Path]::DirectorySeparatorChar -eq '\' -and $LinkTypeProperty) {
    # Windows PowerShell's FileSystem provider owns NTFS hardlink classification.
    return
  }
  throw "Trusted hardlink metadata is unavailable; refusing file mutation: $LiteralPath"
}

function Assert-TrustedTreeLeaves {
  param([Parameter(Mandatory=$true)][string]$LiteralPath)
  if (-not (Test-Path -LiteralPath $LiteralPath)) { return }
  Assert-NoReparsePathComponents -LiteralPath $LiteralPath
  $Item = Get-Item -LiteralPath $LiteralPath -Force
  if (-not $Item.PSIsContainer) {
    Assert-TrustedSingleLinkLeaf -LiteralPath $LiteralPath
    return
  }
  Get-ChildItem -LiteralPath $LiteralPath -Force -Recurse -File | ForEach-Object {
    Assert-TrustedSingleLinkLeaf -LiteralPath $_.FullName
  }
}

function Assert-NoReparsePathComponents {
  param([Parameter(Mandatory=$true)][string]$LiteralPath)
  $FullPath = [System.IO.Path]::GetFullPath($LiteralPath)
  $PathRoot = [System.IO.Path]::GetPathRoot($FullPath)
  $Remainder = $FullPath.Substring($PathRoot.Length)
  $Current = $PathRoot
  foreach ($Part in @($Remainder -split '[\\/]' | Where-Object { $_ })) {
    $Current = Join-Path $Current $Part
    if (-not (Test-Path -LiteralPath $Current)) { break }
    if (Test-IsReparsePoint -LiteralPath $Current) {
      throw "Symbolic-link/reparse ancestor is forbidden: $Current"
    }
  }
}

function Assert-NoReparsePoints {
  param([Parameter(Mandatory=$true)][string]$LiteralPath)
  if (-not (Test-Path -LiteralPath $LiteralPath)) { return }
  Assert-NoReparsePathComponents -LiteralPath $LiteralPath
  if ((Get-Item -LiteralPath $LiteralPath -Force).PSIsContainer) {
    Get-ChildItem -LiteralPath $LiteralPath -Force -Recurse | ForEach-Object {
      if ($_.Attributes -band [System.IO.FileAttributes]::ReparsePoint) {
        throw "Symbolic links and reparse points are forbidden: $($_.FullName)"
      }
    }
  }
}

function Get-PathComparison {
  if ([System.IO.Path]::DirectorySeparatorChar -eq '\') {
    return [System.StringComparison]::OrdinalIgnoreCase
  }
  return [System.StringComparison]::Ordinal
}

function Assert-ChildPath {
  param(
    [Parameter(Mandatory=$true)][string]$Parent,
    [Parameter(Mandatory=$true)][string]$Candidate
  )
  $ParentFull = [System.IO.Path]::GetFullPath($Parent).TrimEnd(
    [System.IO.Path]::DirectorySeparatorChar,
    [System.IO.Path]::AltDirectorySeparatorChar
  )
  $CandidateFull = [System.IO.Path]::GetFullPath($Candidate)
  $Prefix = $ParentFull + [System.IO.Path]::DirectorySeparatorChar
  if (-not $CandidateFull.StartsWith($Prefix, (Get-PathComparison))) {
    throw "Path escapes its allowed root: $CandidateFull"
  }
}

function Get-RelativeFilePath {
  param(
    [Parameter(Mandatory=$true)][string]$Root,
    [Parameter(Mandatory=$true)][string]$File
  )
  $RootFull = [System.IO.Path]::GetFullPath($Root).TrimEnd(
    [System.IO.Path]::DirectorySeparatorChar,
    [System.IO.Path]::AltDirectorySeparatorChar
  )
  $FileFull = [System.IO.Path]::GetFullPath($File)
  Assert-ChildPath -Parent $RootFull -Candidate $FileFull
  return $FileFull.Substring($RootFull.Length + 1).Replace('\', '/')
}

function Get-ManagedFileMap {
  param([Parameter(Mandatory=$true)][string]$Root)
  $Map = @{}
  foreach ($ManagedRoot in $ManagedRoots) {
    $Path = Join-Path $Root $ManagedRoot
    if (-not (Test-Path -LiteralPath $Path)) {
      throw "Missing canonical 5fedu path: $Path"
    }
    Assert-NoReparsePoints -LiteralPath $Path
    $Item = Get-Item -LiteralPath $Path -Force
    $Files = if ($Item.PSIsContainer) {
      @(Get-ChildItem -LiteralPath $Path -Force -Recurse -File)
    } else {
      @($Item)
    }
    foreach ($File in $Files) {
      Assert-TrustedSingleLinkLeaf -LiteralPath $File.FullName
      $Relative = Get-RelativeFilePath -Root $Root -File $File.FullName
      if ($Relative -match '(^|/)\.\.?(/|$)') {
        throw "Traversal segment in managed path: $Relative"
      }
      $Map[$Relative] = (Get-FileHash -LiteralPath $File.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    }
  }
  return $Map
}

function Assert-LeanPackShape {
  param(
    [Parameter(Mandatory=$true)][hashtable]$Expected,
    [Parameter(Mandatory=$true)][string]$CandidateRoot
  )
  if (-not (Test-Path -LiteralPath $CandidateRoot -PathType Container)) {
    throw "Lean pack is not a directory: $CandidateRoot"
  }
  Assert-NoReparsePoints -LiteralPath $CandidateRoot
  Assert-TrustedTreeLeaves -LiteralPath $CandidateRoot
  $Actual = Get-ManagedFileMap -Root $CandidateRoot
  if ($Actual.Count -ne $Expected.Count) {
    throw "Lean pack file count mismatch: expected $($Expected.Count), got $($Actual.Count)"
  }
  foreach ($Relative in $Expected.Keys) {
    if (-not $Actual.ContainsKey($Relative)) {
      throw "Lean pack file missing: $Relative"
    }
  }
  $AllowedTopLevel = @($ManagedRoots + @("project-local"))
  Get-ChildItem -LiteralPath $CandidateRoot -Force | ForEach-Object {
    if ($AllowedTopLevel -notcontains $_.Name) {
      throw "Unexpected top-level path in lean 5fedu pack: $($_.Name)"
    }
  }
}

function Assert-ManagedPackMatches {
  param(
    [Parameter(Mandatory=$true)][hashtable]$Expected,
    [Parameter(Mandatory=$true)][string]$CandidateRoot
  )
  Assert-LeanPackShape -Expected $Expected -CandidateRoot $CandidateRoot
  $Actual = Get-ManagedFileMap -Root $CandidateRoot
  foreach ($Relative in $Expected.Keys) {
    if ($Actual[$Relative] -ne $Expected[$Relative]) {
      throw "Managed file hash mismatch: $Relative"
    }
  }
}

function Copy-ManagedPack {
  param(
    [Parameter(Mandatory=$true)][string]$Source,
    [Parameter(Mandatory=$true)][string]$Destination
  )
  foreach ($ManagedRoot in $ManagedRoots) {
    $SourcePath = Join-Path $Source $ManagedRoot
    $DestinationPath = Join-Path $Destination $ManagedRoot
    $Item = Get-Item -LiteralPath $SourcePath -Force
    if ($Item.PSIsContainer) {
      New-Item -ItemType Directory -Path $DestinationPath -Force | Out-Null
      Get-ChildItem -LiteralPath $SourcePath -Force | ForEach-Object {
        Copy-Item -LiteralPath $_.FullName -Destination $DestinationPath -Recurse -Force
      }
    } else {
      Copy-Item -LiteralPath $SourcePath -Destination $DestinationPath -Force
    }
  }
}

function Remove-TransactionPath {
  param(
    [Parameter(Mandatory=$true)][string]$ContextRoot,
    [Parameter(Mandatory=$true)][string]$LiteralPath
  )
  Assert-ChildPath -Parent $ContextRoot -Candidate $LiteralPath
  $Name = Split-Path -Leaf $LiteralPath
  if (-not $TransactionRegex.IsMatch($Name)) {
    throw "Refusing to remove a non-transaction path: $LiteralPath"
  }
  if (Test-Path -LiteralPath $LiteralPath) {
    Assert-NoReparsePoints -LiteralPath $LiteralPath
    Assert-TrustedTreeLeaves -LiteralPath $LiteralPath
    Remove-Item -LiteralPath $LiteralPath -Recurse -Force
  }
}

function Get-ProjectLocalState {
  param([Parameter(Mandatory=$true)][string]$PackRoot)
  $ProjectLocal = Join-Path $PackRoot "project-local"
  if (-not (Test-Path -LiteralPath $ProjectLocal)) { return "<absent>" }
  Assert-NoReparsePoints -LiteralPath $ProjectLocal
  Assert-TrustedTreeLeaves -LiteralPath $ProjectLocal
  $Rows = [System.Collections.ArrayList]::new()
  $OwnerItems = @(
    Get-Item -LiteralPath $ProjectLocal -Force
    Get-ChildItem -LiteralPath $ProjectLocal -Force -Recurse |
      Sort-Object FullName
  )
  foreach ($Item in $OwnerItems) {
    $Relative = if ($Item.FullName -eq (Get-Item -LiteralPath $ProjectLocal -Force).FullName) {
      "."
    } else {
      Get-RelativeFilePath -Root $ProjectLocal -File $Item.FullName
    }
    $Kind = if ($Item.PSIsContainer) { "directory" } else { "file" }
    $Mode = if ($Item.PSObject.Properties.Name -contains "UnixMode") {
      [string]$Item.UnixMode
    } else {
      [string][int]$Item.Attributes
    }
    $Hash = if ($Item.PSIsContainer) {
      "-"
    } else {
      (Get-FileHash -LiteralPath $Item.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    }
    $null = $Rows.Add("$Kind|$Relative|$Mode|$Hash")
  }
  return ($Rows -join "`n")
}

function Resolve-StaleTransactions {
  param(
    [Parameter(Mandatory=$true)][string]$ContextRoot,
    [Parameter(Mandatory=$true)][string]$Target,
    [Parameter(Mandatory=$true)][hashtable]$Expected
  )
  if (Test-Path -LiteralPath $Target) {
    Assert-NoReparsePoints -LiteralPath $Target
    Assert-TrustedTreeLeaves -LiteralPath $Target
  }
  $Stages = [System.Collections.ArrayList]::new()
  $Backups = [System.Collections.ArrayList]::new()
  $Failed = [System.Collections.ArrayList]::new()
  if (Test-Path -LiteralPath $ContextRoot) {
    foreach ($Entry in Get-ChildItem -LiteralPath $ContextRoot -Force) {
      $TransactionMatch = $TransactionRegex.Match($Entry.Name)
      if (-not $TransactionMatch.Success) { continue }
      if (-not $Entry.PSIsContainer) {
        throw "Corrupt transaction residue is not a directory: $($Entry.FullName)"
      }
      Assert-NoReparsePoints -LiteralPath $Entry.FullName
      Assert-TrustedTreeLeaves -LiteralPath $Entry.FullName
      switch ($TransactionMatch.Groups[1].Value) {
        "stage" { $null = $Stages.Add($Entry.FullName) }
        "backup" { $null = $Backups.Add($Entry.FullName) }
        "failed" { $null = $Failed.Add($Entry.FullName) }
      }
    }
  }

  if ($Failed.Count -gt 0) {
    throw "Ambiguous failed transaction residue requires manual recovery: $($Failed -join ', ')"
  }
  if ($Backups.Count -gt 1) {
    throw "Multiple 5fedu backups found; refusing to choose or delete owner state."
  }
  if ($Backups.Count -eq 1) {
    if (Test-Path -LiteralPath $Target) {
      throw "Target and stale backup both exist; transaction state is ambiguous."
    }
    $Backup = [string]$Backups[0]
    Assert-LeanPackShape -Expected $Expected -CandidateRoot $Backup
    Assert-TrustedTreeLeaves -LiteralPath $Backup
    Move-Item -LiteralPath $Backup -Destination $Target
    Write-Host "Recovered interrupted 5fedu backup without copying owner state: $Target"
  }

  if ($Stages.Count -gt 0) {
    if (-not (Test-Path -LiteralPath $Target -PathType Container)) {
      throw "Stale stage exists without a recoverable target; refusing to discard it."
    }
    foreach ($Stage in $Stages) {
      Assert-ManagedPackMatches -Expected $Expected -CandidateRoot ([string]$Stage)
      $StageOwnerState = Get-ProjectLocalState -PackRoot ([string]$Stage)
      $TargetOwnerState = Get-ProjectLocalState -PackRoot $Target
      if ($StageOwnerState -ne $TargetOwnerState) {
        throw "Stale stage contains different project-local owner state; refusing cleanup."
      }
    }
    foreach ($Stage in $Stages) {
      Remove-TransactionPath -ContextRoot $ContextRoot -LiteralPath ([string]$Stage)
    }
  }
}

function Get-PointerText {
  return @"
# 5fedu project context

Canonical context: ``context/5fedu/README.md``.
Activation policy: ``context/5fedu/behaviors/activation.md``.
Load only the matching file under ``context/5fedu/rules/`` or
``context/5fedu/module-mapping/``.

Project-owned facts may live in ``context/5fedu/project-local/`` and are
preserved by managed updates. Global skills are provided by the installed
harness and are not copied into project context.
"@
}

function New-PointerPlan {
  param(
    [Parameter(Mandatory=$true)][string]$Project,
    [Parameter(Mandatory=$true)][byte[]]$StagedBytes
  )
  $Specifications = @(
    @{ Directory = (Join-Path $Project ".agents"); AlwaysWrite = $true },
    @{ Directory = (Join-Path $Project ".codex"); AlwaysWrite = $true },
    @{ Directory = $Project; AlwaysWrite = $false }
  )
  $Plan = [System.Collections.ArrayList]::new()
  foreach ($Specification in $Specifications) {
    $Directory = [string]$Specification.Directory
    $Destination = Join-Path $Directory "AGENTS.md"
    Assert-ChildPath -Parent $Project -Candidate $Destination
    Assert-NoReparsePathComponents -LiteralPath $Directory
    Assert-NoReparsePathComponents -LiteralPath $Destination
    if ((Test-Path -LiteralPath $Directory) -and
        -not (Test-Path -LiteralPath $Directory -PathType Container)) {
      throw "Pointer parent is not a directory: $Directory"
    }
    if ((Test-Path -LiteralPath $Destination) -and
        -not (Test-Path -LiteralPath $Destination -PathType Leaf)) {
      throw "Pointer destination is not a regular file: $Destination"
    }
    $Existed = Test-Path -LiteralPath $Destination -PathType Leaf
    if ($Existed) {
      Assert-TrustedSingleLinkLeaf -LiteralPath $Destination
    }
    $PriorBytes = if ($Existed) {
      [System.IO.File]::ReadAllBytes($Destination)
    } else {
      [byte[]]@()
    }
    $null = $Plan.Add([pscustomobject]@{
      Directory = $Directory
      Destination = $Destination
      DirectoryExisted = (Test-Path -LiteralPath $Directory -PathType Container)
      Existed = $Existed
      PriorBytes = $PriorBytes
      StagedBytes = $StagedBytes
      ShouldWrite = ([bool]$Specification.AlwaysWrite -or -not $Existed)
      Applied = $false
    })
  }
  return $Plan.ToArray()
}

function Test-ByteArraysEqual {
  param([byte[]]$Left, [byte[]]$Right)
  if ($Left.Length -ne $Right.Length) { return $false }
  for ($Index = 0; $Index -lt $Left.Length; $Index++) {
    if ($Left[$Index] -ne $Right[$Index]) { return $false }
  }
  return $true
}

function Assert-PointerSnapshotCurrent {
  param([Parameter(Mandatory=$true)]$Entry)
  Assert-NoReparsePathComponents -LiteralPath $Entry.Directory
  Assert-NoReparsePathComponents -LiteralPath $Entry.Destination
  $ExistsNow = Test-Path -LiteralPath $Entry.Destination -PathType Leaf
  if ($Entry.Existed -ne $ExistsNow) {
    throw "Pointer changed after preflight: $($Entry.Destination)"
  }
  if ($Entry.Existed) {
    Assert-TrustedSingleLinkLeaf -LiteralPath $Entry.Destination
    $CurrentBytes = [System.IO.File]::ReadAllBytes($Entry.Destination)
    if (-not (Test-ByteArraysEqual -Left $CurrentBytes -Right $Entry.PriorBytes)) {
      throw "Pointer bytes changed after preflight: $($Entry.Destination)"
    }
  }
}

function Apply-PointerPlan {
  param([Parameter(Mandatory=$true)][object[]]$Plan)
  $AppliedCount = 0
  foreach ($Entry in $Plan) {
    if (-not $Entry.ShouldWrite) { continue }
    Assert-PointerSnapshotCurrent -Entry $Entry
    if (-not (Test-Path -LiteralPath $Entry.Directory)) {
      New-Item -ItemType Directory -Path $Entry.Directory | Out-Null
    }
    Assert-NoReparsePathComponents -LiteralPath $Entry.Directory
    [System.IO.File]::WriteAllBytes($Entry.Destination, $Entry.StagedBytes)
    $Entry.Applied = $true
    $AppliedCount++
    if ($env:HARNESS_5FEDU_INSTALL_FAILPOINT -eq "after-first-pointer" -and $AppliedCount -eq 1) {
      throw "Injected installer failure: after-first-pointer"
    }
  }
  if ($env:HARNESS_5FEDU_INSTALL_FAILPOINT -eq "after-pointers") {
    throw "Injected installer failure: after-pointers"
  }
}

function Restore-PointerPlan {
  param([Parameter(Mandatory=$true)][object[]]$Plan)
  for ($Index = $Plan.Count - 1; $Index -ge 0; $Index--) {
    $Entry = $Plan[$Index]
    if (-not $Entry.Applied) { continue }
    Assert-NoReparsePathComponents -LiteralPath $Entry.Directory
    Assert-NoReparsePathComponents -LiteralPath $Entry.Destination
    if ($Entry.Existed) {
      Assert-TrustedSingleLinkLeaf -LiteralPath $Entry.Destination
      [System.IO.File]::WriteAllBytes($Entry.Destination, $Entry.PriorBytes)
    } elseif (Test-Path -LiteralPath $Entry.Destination) {
      Assert-TrustedSingleLinkLeaf -LiteralPath $Entry.Destination
      Remove-Item -LiteralPath $Entry.Destination -Force
    }
    $Entry.Applied = $false
    if (-not $Entry.DirectoryExisted -and (Test-Path -LiteralPath $Entry.Directory -PathType Container)) {
      if (@(Get-ChildItem -LiteralPath $Entry.Directory -Force).Count -eq 0) {
        Remove-Item -LiteralPath $Entry.Directory -Force
      }
    }
  }
}

if (($ProjectRoot -split '[\\/]') -contains '..') {
  throw "ProjectRoot must not contain traversal segments."
}
$ExplicitProject = [System.IO.Path]::GetFullPath($ProjectRoot)
Assert-NoReparsePathComponents -LiteralPath $ExplicitProject
if (-not (Test-Path -LiteralPath $ExplicitProject -PathType Container)) {
  throw "ProjectRoot does not exist or is not a directory: $ExplicitProject"
}
$Project = (Resolve-Path -LiteralPath $ExplicitProject).Path
$ExplicitNormalized = $ExplicitProject.TrimEnd('\', '/')
$ResolvedNormalized = ([System.IO.Path]::GetFullPath($Project)).TrimEnd('\', '/')
if (-not $ExplicitNormalized.Equals($ResolvedNormalized, (Get-PathComparison))) {
  throw "Resolved ProjectRoot differs from the explicit physical root."
}

$ContextRoot = Join-Path $Project "context"
$Target = Join-Path $ContextRoot "5fedu"
Assert-ChildPath -Parent $Project -Candidate $ContextRoot
Assert-ChildPath -Parent $Project -Candidate $Target
Assert-NoReparsePathComponents -LiteralPath $ContextRoot
Assert-NoReparsePathComponents -LiteralPath $Target

$ExpectedMap = Get-ManagedFileMap -Root $ProfileRoot
$TransactionId = [guid]::NewGuid().ToString("N").ToLowerInvariant()
$PointerBytes = $Utf8NoBom.GetBytes((Get-PointerText))
$PointerPlan = @(New-PointerPlan -Project $Project -StagedBytes $PointerBytes)

if (-not (Test-Path -LiteralPath $ContextRoot)) {
  New-Item -ItemType Directory -Path $ContextRoot | Out-Null
}
Resolve-StaleTransactions -ContextRoot $ContextRoot -Target $Target -Expected $ExpectedMap
if (Test-Path -LiteralPath $Target) {
  Assert-NoReparsePoints -LiteralPath $Target
  Assert-TrustedTreeLeaves -LiteralPath $Target
}

if ($UpdatePointersOnly) {
  Assert-ManagedPackMatches -Expected $ExpectedMap -CandidateRoot $Target
  try {
    Apply-PointerPlan -Plan $PointerPlan
  } catch {
    $Failure = $_
    Restore-PointerPlan -Plan $PointerPlan
    throw $Failure
  }
  Write-Host "Updated lean 5fedu pointers: $Target"
  exit 0
}

if ((Test-Path -LiteralPath $Target) -and -not $Force) {
  throw "Context already exists: $Target. Use -Force for a managed atomic update."
}

if (-not $SkipPrompts) {
  Write-Host "5fedu lean context install:"
  Write-Host "  Project : $Project"
  Write-Host "  Profile : $Profile (routing metadata only; the managed pack is canonical)"
  Write-Host "  Update  : $([bool](Test-Path -LiteralPath $Target))"
  $Confirm = Read-Host "Proceed? (y/N)"
  if ($Confirm -notmatch '^[yY]') { throw "Install cancelled." }
}

$Stage = Join-Path $ContextRoot ".5fedu.stage-$TransactionId"
$Backup = Join-Path $ContextRoot ".5fedu.backup-$TransactionId"
$Failed = Join-Path $ContextRoot ".5fedu.failed-$TransactionId"
$BackupCreated = $false
$Swapped = $false

try {
  New-Item -ItemType Directory -Path $Stage | Out-Null
  Copy-ManagedPack -Source $ProfileRoot -Destination $Stage

  $ExistingProjectLocal = Join-Path $Target "project-local"
  if (Test-Path -LiteralPath $ExistingProjectLocal) {
    Assert-NoReparsePoints -LiteralPath $ExistingProjectLocal
    Assert-TrustedTreeLeaves -LiteralPath $ExistingProjectLocal
    Copy-Item -LiteralPath $ExistingProjectLocal -Destination (Join-Path $Stage "project-local") -Recurse
  }

  Assert-ManagedPackMatches -Expected $ExpectedMap -CandidateRoot $Stage
  if ($env:HARNESS_5FEDU_INSTALL_FAILPOINT -eq "before-swap") {
    throw "Injected installer failure: before-swap"
  }

  if (Test-Path -LiteralPath $Target) {
    Assert-TrustedTreeLeaves -LiteralPath $Target
    Move-Item -LiteralPath $Target -Destination $Backup
    $BackupCreated = $true
  }
  if ($env:HARNESS_5FEDU_INSTALL_FAILPOINT -eq "after-backup") {
    throw "Injected installer failure: after-backup"
  }

  Assert-TrustedTreeLeaves -LiteralPath $Stage
  Move-Item -LiteralPath $Stage -Destination $Target
  $Swapped = $true
  if ($env:HARNESS_5FEDU_INSTALL_FAILPOINT -eq "after-swap") {
    throw "Injected installer failure: after-swap"
  }

  Assert-ManagedPackMatches -Expected $ExpectedMap -CandidateRoot $Target
  Apply-PointerPlan -Plan $PointerPlan

  if ($BackupCreated) {
    Remove-TransactionPath -ContextRoot $ContextRoot -LiteralPath $Backup
    $BackupCreated = $false
  }
} catch {
  $Failure = $_
  $PointerRestoreFailure = $null
  try {
    Restore-PointerPlan -Plan $PointerPlan
  } catch {
    $PointerRestoreFailure = $_
  }
  if ($Swapped -and (Test-Path -LiteralPath $Target)) {
    Assert-TrustedTreeLeaves -LiteralPath $Target
    Move-Item -LiteralPath $Target -Destination $Failed
    $Swapped = $false
  }
  if ($BackupCreated -and (Test-Path -LiteralPath $Backup)) {
    Assert-TrustedTreeLeaves -LiteralPath $Backup
    Move-Item -LiteralPath $Backup -Destination $Target
    $BackupCreated = $false
  }
  Remove-TransactionPath -ContextRoot $ContextRoot -LiteralPath $Stage
  Remove-TransactionPath -ContextRoot $ContextRoot -LiteralPath $Failed
  if ($PointerRestoreFailure) {
    throw "Installer failed and pointer rollback also failed: $($PointerRestoreFailure.Exception.Message)"
  }
  throw $Failure
} finally {
  Remove-TransactionPath -ContextRoot $ContextRoot -LiteralPath $Stage
}

Write-Host "Installed lean 5fedu context atomically: $Target"
Write-Host "Managed roots: $($ManagedRoots -join ', ')"
Write-Host "Project-local content was preserved; global skills remain harness-owned."
