$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$RepoRoot = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))
$ProfileRoot = Join-Path $RepoRoot "profiles/5fedu"
$Installer = Join-Path $PSScriptRoot "08-install-5fedu-context.ps1"
$ManagedRoots = @("README.md", "rules", "behaviors", "module-mapping")
$TestRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("harness-5fedu-lean-" + [guid]::NewGuid().ToString("N"))
$Assertions = 0

function Assert-True {
  param([string]$Name, [bool]$Condition)
  if (-not $Condition) { throw "ASSERT FAIL: $Name" }
  $script:Assertions++
}

function Assert-Throws {
  param([string]$Name, [scriptblock]$Action)
  $Threw = $false
  try { & $Action } catch { $Threw = $true }
  Assert-True -Name $Name -Condition $Threw
}

function Get-RelativePathCompat {
  param([string]$Root, [string]$File)
  $RootFull = [System.IO.Path]::GetFullPath($Root).TrimEnd(
    [System.IO.Path]::DirectorySeparatorChar,
    [System.IO.Path]::AltDirectorySeparatorChar
  )
  $FileFull = [System.IO.Path]::GetFullPath($File)
  return $FileFull.Substring($RootFull.Length + 1).Replace('\', '/')
}

function Get-ManagedFileHashes {
  param([string]$Root)
  $Result = @{}
  foreach ($ManagedRoot in $ManagedRoots) {
    $Path = Join-Path $Root $ManagedRoot
    $Item = Get-Item -LiteralPath $Path -Force
    $Files = if ($Item.PSIsContainer) {
      @(Get-ChildItem -LiteralPath $Path -Force -Recurse -File)
    } else {
      @($Item)
    }
    foreach ($File in $Files) {
      $Relative = Get-RelativePathCompat -Root $Root -File $File.FullName
      $Result[$Relative] = (Get-FileHash -LiteralPath $File.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    }
  }
  return $Result
}

function Get-TreeFingerprint {
  param([string]$Root)
  $Rows = @(
    Get-ChildItem -LiteralPath $Root -Force -Recurse -File |
      Sort-Object FullName |
      ForEach-Object {
        $Relative = Get-RelativePathCompat -Root $Root -File $_.FullName
        $Hash = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
        "$Relative=$Hash"
      }
  )
  $Bytes = [System.Text.Encoding]::UTF8.GetBytes(($Rows -join "`n"))
  $Hasher = [System.Security.Cryptography.SHA256]::Create()
  try {
    return ([System.BitConverter]::ToString($Hasher.ComputeHash($Bytes))).Replace("-", "").ToLowerInvariant()
  } finally {
    $Hasher.Dispose()
  }
}

function Assert-InstalledPack {
  param([string]$Target, [hashtable]$Expected)
  $Actual = Get-ManagedFileHashes -Root $Target
  Assert-True "managed file count matches canonical pack" ($Actual.Count -eq $Expected.Count)
  foreach ($Relative in $Expected.Keys) {
    Assert-True "managed file exists: $Relative" $Actual.ContainsKey($Relative)
    Assert-True "managed file hash matches: $Relative" ($Actual[$Relative] -eq $Expected[$Relative])
  }
  $AllowedTop = @($ManagedRoots + @("project-local"))
  foreach ($Entry in Get-ChildItem -LiteralPath $Target -Force) {
    Assert-True "only lean top-level path installed: $($Entry.Name)" ($AllowedTop -contains $Entry.Name)
  }
}

function Get-TransactionResidue {
  param([string]$ContextRoot)
  if (-not (Test-Path -LiteralPath $ContextRoot)) { return @() }
  $ExactTransaction = [regex]::new(
    '^\.5fedu\.(stage|backup|failed)-[a-f0-9]{32}$',
    [System.Text.RegularExpressions.RegexOptions]::CultureInvariant
  )
  return @(
    Get-ChildItem -LiteralPath $ContextRoot -Force |
      Where-Object { $ExactTransaction.IsMatch($_.Name) }
  )
}

function Assert-FileBytes {
  param([string]$Name, [string]$Path, [byte[]]$Expected)
  Assert-True "$Name exists" (Test-Path -LiteralPath $Path -PathType Leaf)
  $Actual = [System.IO.File]::ReadAllBytes($Path)
  Assert-True "$Name length is preserved" ($Actual.Length -eq $Expected.Length)
  if ($Actual.Length -eq $Expected.Length) {
    for ($Index = 0; $Index -lt $Actual.Length; $Index++) {
      if ($Actual[$Index] -ne $Expected[$Index]) {
        throw "ASSERT FAIL: $Name bytes differ at offset $Index"
      }
    }
    $script:Assertions++
  }
}

function Try-NewHardLink {
  param([string]$Path, [string]$Target)
  try {
    New-Item -ItemType HardLink -Path $Path -Target $Target -ErrorAction Stop | Out-Null
    return $true
  } catch {
    Write-Host "[SKIP] Hardlink fixture unavailable on this host: $($_.Exception.Message)"
    return $false
  }
}

function Get-LinkSnapshot {
  param([string]$Path)
  $Item = Get-Item -LiteralPath $Path -Force
  $UnixStatProperty = $Item.PSObject.Properties["UnixStat"]
  if ($UnixStatProperty -and $null -ne $Item.UnixStat -and
      $Item.UnixStat.PSObject.Properties["HardlinkCount"]) {
    return [pscustomobject]@{
      Kind = "unix"
      Signature = "$($Item.UnixStat.DeviceId):$($Item.UnixStat.Inode):$($Item.UnixStat.HardlinkCount)"
    }
  }
  $LinkTypeProperty = $Item.PSObject.Properties["LinkType"]
  if ($LinkTypeProperty) {
    return [pscustomobject]@{
      Kind = "provider"
      Signature = [string]$Item.LinkType
    }
  }
  return [pscustomobject]@{
    Kind = "untrusted"
    Signature = "untrusted"
  }
}

function Assert-LinkSnapshot {
  param([string]$Name, [string]$Path, $Expected)
  $Actual = Get-LinkSnapshot -Path $Path
  Assert-True "$Name metadata kind is stable" ($Actual.Kind -eq $Expected.Kind)
  Assert-True "$Name inode/link-count relation is stable" ($Actual.Signature -eq $Expected.Signature)
}

$PriorFailpoint = $env:HARNESS_5FEDU_INSTALL_FAILPOINT
try {
  New-Item -ItemType Directory -Path $TestRoot | Out-Null
  $Project = Join-Path $TestRoot "Dự án thử nghiệm có khoảng trắng"
  New-Item -ItemType Directory -Path $Project | Out-Null
  $Expected = Get-ManagedFileHashes -Root $ProfileRoot

  & $Installer -ProjectRoot $Project -SkipPrompts
  $Target = Join-Path $Project "context/5fedu"
  Assert-InstalledPack -Target $Target -Expected $Expected
  Assert-True "fresh install has no transaction residue" (@(Get-TransactionResidue (Join-Path $Project "context")).Count -eq 0)

  $PointerFiles = @(
    (Join-Path $Project "AGENTS.md"),
    (Join-Path $Project ".agents/AGENTS.md"),
    (Join-Path $Project ".codex/AGENTS.md")
  )
  foreach ($Pointer in $PointerFiles) {
    $PointerBody = Get-Content -LiteralPath $Pointer -Raw -Encoding UTF8
    Assert-True "pointer targets lean README: $Pointer" $PointerBody.Contains("context/5fedu/README.md")
    Assert-True "pointer contains no legacy projects path: $Pointer" (-not $PointerBody.Contains("profiles/5fedu/projects"))
    Assert-True "pointer contains no known-repos path: $Pointer" (-not $PointerBody.Contains("known-repos"))
  }

  $ProjectLocal = Join-Path $Target "project-local"
  New-Item -ItemType Directory -Path $ProjectLocal | Out-Null
  $OwnerFile = Join-Path $ProjectLocal "quyết-định owner.txt"
  [System.IO.File]::WriteAllText($OwnerFile, "preserve-me")
  New-Item -ItemType Directory -Path (Join-Path $Target "projects/archive") -Force | Out-Null
  [System.IO.File]::WriteAllText((Join-Path $Target "projects/archive/legacy.md"), "must disappear")
  [System.IO.File]::WriteAllText((Join-Path $Target "README.md"), "stale managed content")

  & $Installer -ProjectRoot $Project -SkipPrompts -Force
  Assert-InstalledPack -Target $Target -Expected $Expected
  Assert-True "project-local survives update" ((Get-Content -LiteralPath $OwnerFile -Raw) -eq "preserve-me")
  Assert-True "legacy project tree is not retained" (-not (Test-Path -LiteralPath (Join-Path $Target "projects")))

  foreach ($Failpoint in @("after-backup", "after-swap")) {
    $BeforeFailure = Get-TreeFingerprint -Root $Target
    $env:HARNESS_5FEDU_INSTALL_FAILPOINT = $Failpoint
    Assert-Throws "injected $Failpoint failure is surfaced" {
      & $Installer -ProjectRoot $Project -SkipPrompts -Force
    }
    Remove-Item Env:HARNESS_5FEDU_INSTALL_FAILPOINT -ErrorAction SilentlyContinue
    $AfterFailure = Get-TreeFingerprint -Root $Target
    Assert-True "$Failpoint restores exact pre-update tree" ($AfterFailure -eq $BeforeFailure)
    Assert-True "$Failpoint leaves no transaction residue" (@(Get-TransactionResidue (Join-Path $Project "context")).Count -eq 0)
  }

  $ContextRoot = Join-Path $Project "context"
  $CanCheckUnixMode = (
    [System.IO.Path]::DirectorySeparatorChar -ne '\' -and
    $null -ne [System.IO.File].GetMethod("GetUnixFileMode", [type[]]@([string])) -and
    $null -ne [System.IO.File].GetMethod("SetUnixFileMode", [type[]]@([string], [System.IO.UnixFileMode]))
  )
  if ($CanCheckUnixMode) {
    $OwnerMode = (
      [System.IO.UnixFileMode]::UserRead -bor
      [System.IO.UnixFileMode]::UserWrite
    )
    [System.IO.File]::SetUnixFileMode($OwnerFile, $OwnerMode)
  }
  $BeforeCrash = Get-TreeFingerprint -Root $Target
  $OwnerModeBefore = if ($CanCheckUnixMode) {
    [int][System.IO.File]::GetUnixFileMode($OwnerFile)
  } else {
    $null
  }
  $CrashBackup = Join-Path $ContextRoot (".5fedu.backup-" + [guid]::NewGuid().ToString("N"))
  Move-Item -LiteralPath $Target -Destination $CrashBackup
  & $Installer -ProjectRoot $Project -SkipPrompts -UpdatePointersOnly
  Assert-True "single valid crash backup is recovered" (Test-Path -LiteralPath $Target -PathType Container)
  Assert-True "recovery preserves exact owner tree" ((Get-TreeFingerprint -Root $Target) -eq $BeforeCrash)
  Assert-True "recovered backup sibling is consumed by rename" (-not (Test-Path -LiteralPath $CrashBackup))
  if ($CanCheckUnixMode) {
    Assert-True "recovery preserves owner file mode" (
      [int][System.IO.File]::GetUnixFileMode($OwnerFile) -eq $OwnerModeBefore
    )
  }

  $StaleStage = Join-Path $ContextRoot (".5fedu.stage-" + [guid]::NewGuid().ToString("N"))
  Copy-Item -LiteralPath $Target -Destination $StaleStage -Recurse
  & $Installer -ProjectRoot $Project -SkipPrompts -UpdatePointersOnly
  Assert-True "validated stale stage is cleaned only with live target" (-not (Test-Path -LiteralPath $StaleStage))

  $DivergentStage = Join-Path $ContextRoot (".5fedu.stage-" + [guid]::NewGuid().ToString("N"))
  Copy-Item -LiteralPath $Target -Destination $DivergentStage -Recurse
  [System.IO.File]::WriteAllText(
    (Join-Path $DivergentStage "project-local/stage-only-owner.txt"),
    "do-not-discard"
  )
  Assert-Throws "stale stage with divergent owner state fails closed" {
    & $Installer -ProjectRoot $Project -SkipPrompts -UpdatePointersOnly
  }
  Assert-True "divergent owner stage remains for manual recovery" (
    Test-Path -LiteralPath (Join-Path $DivergentStage "project-local/stage-only-owner.txt")
  )
  Assert-True "live owner state is untouched by divergent stage" (
    (Get-Content -LiteralPath $OwnerFile -Raw) -eq "preserve-me"
  )
  Remove-Item -LiteralPath $DivergentStage -Recurse -Force

  $OwnerNearMatch = Join-Path $ContextRoot ".5fedu.backup-owner"
  New-Item -ItemType Directory -Path $OwnerNearMatch | Out-Null
  $OwnerNearMatchFile = Join-Path $OwnerNearMatch "owner.txt"
  [System.IO.File]::WriteAllText($OwnerNearMatchFile, "owner-backup-must-survive")
  & $Installer -ProjectRoot $Project -SkipPrompts -UpdatePointersOnly
  Assert-True "near-match owner backup is never scanned or discarded" (
    (Get-Content -LiteralPath $OwnerNearMatchFile -Raw) -eq "owner-backup-must-survive"
  )

  $OwnerTransactionNames = @(
    (".5fedu.stage-" + ("A" * 32)),
    (".5fedu.BACKUP-" + ("a" * 32)),
    (".5fedu.failed-" + ("F" * 32)),
    (".5fedu.Stage-" + ("a" * 32)),
    (".5fedu.backup-" + ("a" * 31)),
    (".5fedu.backup-" + ("a" * 32) + "-owner")
  )
  foreach ($OwnerTransactionName in $OwnerTransactionNames) {
    [System.IO.File]::WriteAllText(
      (Join-Path $ContextRoot $OwnerTransactionName),
      "case-sensitive-owner-state:$OwnerTransactionName"
    )
  }
  & $Installer -ProjectRoot $Project -SkipPrompts -UpdatePointersOnly
  foreach ($OwnerTransactionName in $OwnerTransactionNames) {
    $OwnerTransactionPath = Join-Path $ContextRoot $OwnerTransactionName
    Assert-True "case/near-match owner file is preserved: $OwnerTransactionName" (
      (Get-Content -LiteralPath $OwnerTransactionPath -Raw) -eq
      "case-sensitive-owner-state:$OwnerTransactionName"
    )
  }
  Assert-True "case/near-match owner names are not canonical residue" (
    @(Get-TransactionResidue $ContextRoot).Count -eq 0
  )

  $AmbiguousBackup = Join-Path $ContextRoot (".5fedu.backup-" + [guid]::NewGuid().ToString("N"))
  Copy-Item -LiteralPath $Target -Destination $AmbiguousBackup -Recurse
  $AmbiguousTargetFingerprint = Get-TreeFingerprint -Root $Target
  $AmbiguousBackupFingerprint = Get-TreeFingerprint -Root $AmbiguousBackup
  Assert-Throws "target plus backup fails closed" {
    & $Installer -ProjectRoot $Project -SkipPrompts -UpdatePointersOnly
  }
  Assert-True "ambiguous target is untouched" ((Get-TreeFingerprint -Root $Target) -eq $AmbiguousTargetFingerprint)
  Assert-True "ambiguous backup is untouched" ((Get-TreeFingerprint -Root $AmbiguousBackup) -eq $AmbiguousBackupFingerprint)
  Remove-Item -LiteralPath $AmbiguousBackup -Recurse -Force

  $BackupOne = Join-Path $ContextRoot (".5fedu.backup-" + [guid]::NewGuid().ToString("N"))
  $BackupTwo = Join-Path $ContextRoot (".5fedu.backup-" + [guid]::NewGuid().ToString("N"))
  Move-Item -LiteralPath $Target -Destination $BackupOne
  Copy-Item -LiteralPath $BackupOne -Destination $BackupTwo -Recurse
  Assert-Throws "multiple backups fail closed without choosing" {
    & $Installer -ProjectRoot $Project -SkipPrompts -UpdatePointersOnly
  }
  Assert-True "first owner backup remains after ambiguous recovery" (Test-Path -LiteralPath $BackupOne)
  Assert-True "second owner backup remains after ambiguous recovery" (Test-Path -LiteralPath $BackupTwo)
  Move-Item -LiteralPath $BackupOne -Destination $Target
  Remove-Item -LiteralPath $BackupTwo -Recurse -Force

  $CorruptBackup = Join-Path $ContextRoot (".5fedu.backup-" + [guid]::NewGuid().ToString("N"))
  Move-Item -LiteralPath $Target -Destination $CorruptBackup
  New-Item -ItemType Directory -Path (Join-Path $CorruptBackup "archive") | Out-Null
  [System.IO.File]::WriteAllText((Join-Path $CorruptBackup "archive/evidence.md"), "corrupt")
  Assert-Throws "corrupt single backup fails closed" {
    & $Installer -ProjectRoot $Project -SkipPrompts -UpdatePointersOnly
  }
  Assert-True "corrupt backup remains for owner recovery" (Test-Path -LiteralPath $CorruptBackup)
  Assert-True "corrupt backup is not promoted" (-not (Test-Path -LiteralPath $Target))
  Remove-Item -LiteralPath (Join-Path $CorruptBackup "archive") -Recurse -Force
  Move-Item -LiteralPath $CorruptBackup -Destination $Target

  $PointerSentinel = [System.Text.Encoding]::UTF8.GetBytes("owner pointer bytes — giữ nguyên")
  foreach ($Pointer in $PointerFiles) {
    [System.IO.File]::WriteAllBytes($Pointer, $PointerSentinel)
  }
  foreach ($Failpoint in @("after-first-pointer", "after-pointers")) {
    $BeforePointerFailure = Get-TreeFingerprint -Root $Target
    $env:HARNESS_5FEDU_INSTALL_FAILPOINT = $Failpoint
    Assert-Throws "$Failpoint is surfaced" {
      & $Installer -ProjectRoot $Project -SkipPrompts -Force
    }
    Remove-Item Env:HARNESS_5FEDU_INSTALL_FAILPOINT -ErrorAction SilentlyContinue
    foreach ($Pointer in $PointerFiles) {
      Assert-FileBytes -Name "$Failpoint prior pointer" -Path $Pointer -Expected $PointerSentinel
    }
    Assert-True "$Failpoint restores context transaction" (
      (Get-TreeFingerprint -Root $Target) -eq $BeforePointerFailure
    )
    Assert-True "$Failpoint leaves no exact transaction residue" (
      @(Get-TransactionResidue $ContextRoot).Count -eq 0
    )
  }

  $MissingPointerProject = Join-Path $TestRoot "missing-pointer-state"
  New-Item -ItemType Directory -Path $MissingPointerProject | Out-Null
  $env:HARNESS_5FEDU_INSTALL_FAILPOINT = "after-first-pointer"
  Assert-Throws "failure restores pointer nonexistence" {
    & $Installer -ProjectRoot $MissingPointerProject -SkipPrompts
  }
  Remove-Item Env:HARNESS_5FEDU_INSTALL_FAILPOINT -ErrorAction SilentlyContinue
  foreach ($RelativePointer in @("AGENTS.md", ".agents/AGENTS.md", ".codex/AGENTS.md")) {
    Assert-True "missing pointer remains absent: $RelativePointer" (
      -not (Test-Path -LiteralPath (Join-Path $MissingPointerProject $RelativePointer))
    )
  }
  foreach ($RelativeDirectory in @(".agents", ".codex")) {
    Assert-True "pointer parent nonexistence is restored: $RelativeDirectory" (
      -not (Test-Path -LiteralPath (Join-Path $MissingPointerProject $RelativeDirectory))
    )
  }
  Assert-True "failed fresh pointer transaction restores target nonexistence" (
    -not (Test-Path -LiteralPath (Join-Path $MissingPointerProject "context/5fedu"))
  )

  foreach ($PointerCase in @(
    @{ Name = "agents"; Relative = ".agents/AGENTS.md" },
    @{ Name = "codex"; Relative = ".codex/AGENTS.md" },
    @{ Name = "root"; Relative = "AGENTS.md" }
  )) {
    $HardlinkProject = Join-Path $TestRoot ("hardlink-pointer-" + $PointerCase.Name)
    $HardlinkOutside = Join-Path $TestRoot ("outside-hardlink-" + $PointerCase.Name + ".txt")
    $HardlinkDestination = Join-Path $HardlinkProject $PointerCase.Relative
    New-Item -ItemType Directory -Path (Split-Path -Parent $HardlinkDestination) -Force | Out-Null
    $HardlinkBytes = [System.Text.Encoding]::UTF8.GetBytes(
      "outside inode must not change — $($PointerCase.Name)"
    )
    [System.IO.File]::WriteAllBytes($HardlinkOutside, $HardlinkBytes)
    if (Try-NewHardLink -Path $HardlinkDestination -Target $HardlinkOutside) {
      Assert-Throws "pointer hardlink fails closed: $($PointerCase.Name)" {
        & $Installer -ProjectRoot $HardlinkProject -SkipPrompts
      }
      Assert-FileBytes -Name "outside hardlink inode: $($PointerCase.Name)" -Path $HardlinkOutside -Expected $HardlinkBytes
      Assert-FileBytes -Name "pointer hardlink leaf: $($PointerCase.Name)" -Path $HardlinkDestination -Expected $HardlinkBytes
      Assert-True "hardlink preflight precedes context mutation: $($PointerCase.Name)" (
        -not (Test-Path -LiteralPath (Join-Path $HardlinkProject "context/5fedu"))
      )
    }
  }

  $ManagedHardlinkOutside = Join-Path $TestRoot "outside-managed-readme.md"
  $ManagedReadme = Join-Path $Target "README.md"
  $CanonicalReadme = Join-Path $ProfileRoot "README.md"
  $ManagedReadmeBytes = [System.IO.File]::ReadAllBytes($CanonicalReadme)
  [System.IO.File]::WriteAllBytes($ManagedHardlinkOutside, $ManagedReadmeBytes)
  Remove-Item -LiteralPath $ManagedReadme -Force
  if (Try-NewHardLink -Path $ManagedReadme -Target $ManagedHardlinkOutside) {
    $ManagedTreeBefore = Get-TreeFingerprint -Root $Target
    $ManagedLeafBefore = Get-LinkSnapshot -Path $ManagedReadme
    $ManagedOutsideBefore = Get-LinkSnapshot -Path $ManagedHardlinkOutside
    Assert-Throws "Force existing managed hardlink fails before target mutation" {
      & $Installer -ProjectRoot $Project -SkipPrompts -Force
    }
    Assert-FileBytes -Name "outside managed inode" -Path $ManagedHardlinkOutside -Expected $ManagedReadmeBytes
    Assert-FileBytes -Name "managed hardlink leaf" -Path $ManagedReadme -Expected $ManagedReadmeBytes
    Assert-LinkSnapshot -Name "outside managed inode" -Path $ManagedHardlinkOutside -Expected $ManagedOutsideBefore
    Assert-LinkSnapshot -Name "managed hardlink leaf" -Path $ManagedReadme -Expected $ManagedLeafBefore
    Assert-True "Force managed hardlink leaves target tree byte-identical" (
      (Get-TreeFingerprint -Root $Target) -eq $ManagedTreeBefore
    )
    Assert-True "Force managed hardlink creates no canonical transaction residue" (
      @(Get-TransactionResidue $ContextRoot).Count -eq 0
    )
    Remove-Item -LiteralPath $ManagedReadme -Force
  }
  Copy-Item -LiteralPath $CanonicalReadme -Destination $ManagedReadme

  $OwnerHardlinkOutside = Join-Path $TestRoot "outside-project-local-owner.txt"
  $OwnerBytes = [System.Text.Encoding]::UTF8.GetBytes("preserve-me")
  [System.IO.File]::WriteAllBytes($OwnerHardlinkOutside, $OwnerBytes)
  if ($CanCheckUnixMode) {
    [System.IO.File]::SetUnixFileMode(
      $OwnerHardlinkOutside,
      [System.IO.File]::GetUnixFileMode($OwnerFile)
    )
  }
  Remove-Item -LiteralPath $OwnerFile -Force
  if (Try-NewHardLink -Path $OwnerFile -Target $OwnerHardlinkOutside) {
    $OwnerTreeBefore = Get-TreeFingerprint -Root $Target
    $OwnerLeafBefore = Get-LinkSnapshot -Path $OwnerFile
    $OwnerOutsideBefore = Get-LinkSnapshot -Path $OwnerHardlinkOutside
    Assert-Throws "Force project-local owner hardlink fails before stage creation" {
      & $Installer -ProjectRoot $Project -SkipPrompts -Force
    }
    Assert-FileBytes -Name "outside project-local inode" -Path $OwnerHardlinkOutside -Expected $OwnerBytes
    Assert-FileBytes -Name "project-local hardlink leaf" -Path $OwnerFile -Expected $OwnerBytes
    Assert-LinkSnapshot -Name "outside project-local inode" -Path $OwnerHardlinkOutside -Expected $OwnerOutsideBefore
    Assert-LinkSnapshot -Name "project-local hardlink leaf" -Path $OwnerFile -Expected $OwnerLeafBefore
    Assert-True "Force project-local hardlink leaves target tree byte-identical" (
      (Get-TreeFingerprint -Root $Target) -eq $OwnerTreeBefore
    )
    Assert-True "Force project-local hardlink leaves no transaction tree" (
      @(Get-TransactionResidue $ContextRoot).Count -eq 0
    )
    Remove-Item -LiteralPath $OwnerFile -Force
  }
  [System.IO.File]::WriteAllBytes($OwnerFile, $OwnerBytes)
  if ($CanCheckUnixMode) {
    [System.IO.File]::SetUnixFileMode($OwnerFile, [System.IO.UnixFileMode]$OwnerModeBefore)
  }

  $StageHardlink = Join-Path $ContextRoot (".5fedu.stage-" + [guid]::NewGuid().ToString("N"))
  Copy-Item -LiteralPath $Target -Destination $StageHardlink -Recurse
  $StageOwner = Join-Path $StageHardlink "project-local/quyết-định owner.txt"
  $StageHardlinkOutside = Join-Path $TestRoot "outside-stage-owner.txt"
  [System.IO.File]::WriteAllBytes($StageHardlinkOutside, $OwnerBytes)
  if ($CanCheckUnixMode) {
    [System.IO.File]::SetUnixFileMode(
      $StageHardlinkOutside,
      [System.IO.File]::GetUnixFileMode($OwnerFile)
    )
  }
  Remove-Item -LiteralPath $StageOwner -Force
  if (Try-NewHardLink -Path $StageOwner -Target $StageHardlinkOutside) {
    $StageTreeBefore = Get-TreeFingerprint -Root $StageHardlink
    $LiveTreeBeforeStageFailure = Get-TreeFingerprint -Root $Target
    $StageLeafBefore = Get-LinkSnapshot -Path $StageOwner
    $StageOutsideBefore = Get-LinkSnapshot -Path $StageHardlinkOutside
    Assert-Throws "equal-byte/mode stale-stage project-local hardlink fails closed" {
      & $Installer -ProjectRoot $Project -SkipPrompts -UpdatePointersOnly
    }
    Assert-True "hardlinked stale stage remains byte-identical" (
      (Get-TreeFingerprint -Root $StageHardlink) -eq $StageTreeBefore
    )
    Assert-True "hardlinked stale stage leaves live target byte-identical" (
      (Get-TreeFingerprint -Root $Target) -eq $LiveTreeBeforeStageFailure
    )
    Assert-FileBytes -Name "outside stale-stage inode" -Path $StageHardlinkOutside -Expected $OwnerBytes
    Assert-FileBytes -Name "stale-stage hardlink leaf" -Path $StageOwner -Expected $OwnerBytes
    Assert-LinkSnapshot -Name "outside stale-stage inode" -Path $StageHardlinkOutside -Expected $StageOutsideBefore
    Assert-LinkSnapshot -Name "stale-stage hardlink leaf" -Path $StageOwner -Expected $StageLeafBefore
  }
  Remove-Item -LiteralPath $StageHardlink -Recurse -Force

  $BackupHardlink = Join-Path $ContextRoot (".5fedu.backup-" + [guid]::NewGuid().ToString("N"))
  Move-Item -LiteralPath $Target -Destination $BackupHardlink
  $BackupOwner = Join-Path $BackupHardlink "project-local/quyết-định owner.txt"
  $BackupHardlinkOutside = Join-Path $TestRoot "outside-backup-owner.txt"
  [System.IO.File]::WriteAllBytes($BackupHardlinkOutside, $OwnerBytes)
  if ($CanCheckUnixMode) {
    [System.IO.File]::SetUnixFileMode(
      $BackupHardlinkOutside,
      [System.IO.File]::GetUnixFileMode($BackupOwner)
    )
  }
  Remove-Item -LiteralPath $BackupOwner -Force
  if (Try-NewHardLink -Path $BackupOwner -Target $BackupHardlinkOutside) {
    $BackupTreeBefore = Get-TreeFingerprint -Root $BackupHardlink
    $BackupLeafBefore = Get-LinkSnapshot -Path $BackupOwner
    $BackupOutsideBefore = Get-LinkSnapshot -Path $BackupHardlinkOutside
    Assert-Throws "backup project-local hardlink blocks recovery before rename" {
      & $Installer -ProjectRoot $Project -SkipPrompts -UpdatePointersOnly
    }
    Assert-True "hardlinked backup remains at original transaction path" (
      Test-Path -LiteralPath $BackupHardlink -PathType Container
    )
    Assert-True "hardlinked backup is never promoted to target" (-not (Test-Path -LiteralPath $Target))
    Assert-True "hardlinked backup tree remains byte-identical" (
      (Get-TreeFingerprint -Root $BackupHardlink) -eq $BackupTreeBefore
    )
    Assert-FileBytes -Name "outside backup inode" -Path $BackupHardlinkOutside -Expected $OwnerBytes
    Assert-FileBytes -Name "backup hardlink leaf" -Path $BackupOwner -Expected $OwnerBytes
    Assert-LinkSnapshot -Name "outside backup inode" -Path $BackupHardlinkOutside -Expected $BackupOutsideBefore
    Assert-LinkSnapshot -Name "backup hardlink leaf" -Path $BackupOwner -Expected $BackupLeafBefore
    Remove-Item -LiteralPath $BackupOwner -Force
  }
  [System.IO.File]::WriteAllBytes($BackupOwner, $OwnerBytes)
  if ($CanCheckUnixMode) {
    [System.IO.File]::SetUnixFileMode($BackupOwner, [System.IO.UnixFileMode]$OwnerModeBefore)
  }
  Move-Item -LiteralPath $BackupHardlink -Destination $Target

  $FailedHardlink = Join-Path $ContextRoot (".5fedu.failed-" + [guid]::NewGuid().ToString("N"))
  Copy-Item -LiteralPath $Target -Destination $FailedHardlink -Recurse
  $FailedOwner = Join-Path $FailedHardlink "project-local/quyết-định owner.txt"
  $FailedHardlinkOutside = Join-Path $TestRoot "outside-failed-owner.txt"
  [System.IO.File]::WriteAllBytes($FailedHardlinkOutside, $OwnerBytes)
  Remove-Item -LiteralPath $FailedOwner -Force
  if (Try-NewHardLink -Path $FailedOwner -Target $FailedHardlinkOutside) {
    $FailedTreeBefore = Get-TreeFingerprint -Root $FailedHardlink
    $TargetBeforeFailedResidue = Get-TreeFingerprint -Root $Target
    $FailedLeafBefore = Get-LinkSnapshot -Path $FailedOwner
    $FailedOutsideBefore = Get-LinkSnapshot -Path $FailedHardlinkOutside
    Assert-Throws "failed transaction hardlink fails closed before ambiguity handling" {
      & $Installer -ProjectRoot $Project -SkipPrompts -UpdatePointersOnly
    }
    Assert-True "failed hardlink transaction remains byte-identical" (
      (Get-TreeFingerprint -Root $FailedHardlink) -eq $FailedTreeBefore
    )
    Assert-True "failed hardlink residue leaves live target byte-identical" (
      (Get-TreeFingerprint -Root $Target) -eq $TargetBeforeFailedResidue
    )
    Assert-FileBytes -Name "outside failed inode" -Path $FailedHardlinkOutside -Expected $OwnerBytes
    Assert-FileBytes -Name "failed hardlink leaf" -Path $FailedOwner -Expected $OwnerBytes
    Assert-LinkSnapshot -Name "outside failed inode" -Path $FailedHardlinkOutside -Expected $FailedOutsideBefore
    Assert-LinkSnapshot -Name "failed hardlink leaf" -Path $FailedOwner -Expected $FailedLeafBefore
  }
  Remove-Item -LiteralPath $FailedHardlink -Recurse -Force

  & $Installer -ProjectRoot $Project -SkipPrompts -UpdatePointersOnly
  & $Installer -ProjectRoot $Project -SkipPrompts -Force
  Assert-InstalledPack -Target $Target -Expected $Expected
  Assert-True "normal single-link path remains transaction-clean" (
    @(Get-TransactionResidue $ContextRoot).Count -eq 0
  )

  $TraversalTarget = Join-Path $TestRoot "outside-project"
  New-Item -ItemType Directory -Path $TraversalTarget | Out-Null
  $TraversalInput = Join-Path $Project "../outside-project"
  Assert-Throws "ProjectRoot traversal is rejected" {
    & $Installer -ProjectRoot $TraversalInput -SkipPrompts
  }

  $SymlinkProject = Join-Path $TestRoot "symlink-target-project"
  $OutsideContext = Join-Path $TestRoot "outside-context"
  New-Item -ItemType Directory -Path (Join-Path $SymlinkProject "context") -Force | Out-Null
  New-Item -ItemType Directory -Path $OutsideContext | Out-Null
  $SymlinkCreated = $false
  try {
    New-Item -ItemType SymbolicLink -Path (Join-Path $SymlinkProject "context/5fedu") -Target $OutsideContext -ErrorAction Stop | Out-Null
    $SymlinkCreated = $true
  } catch {
    Write-Host "[SKIP] Symlink rejection fixture unavailable on this host: $($_.Exception.Message)"
  }
  if ($SymlinkCreated) {
    Assert-Throws "symlink target escaping project is rejected" {
      & $Installer -ProjectRoot $SymlinkProject -SkipPrompts
    }
    Assert-True "outside symlink target remains untouched" (@(Get-ChildItem -LiteralPath $OutsideContext -Force).Count -eq 0)
  }

  $PointerSymlinkProject = Join-Path $TestRoot "pointer-symlink-project"
  $OutsidePointer = Join-Path $TestRoot "outside-pointer"
  New-Item -ItemType Directory -Path $PointerSymlinkProject | Out-Null
  New-Item -ItemType Directory -Path $OutsidePointer | Out-Null
  $PointerSymlinkCreated = $false
  try {
    New-Item -ItemType SymbolicLink -Path (Join-Path $PointerSymlinkProject ".agents") -Target $OutsidePointer -ErrorAction Stop | Out-Null
    $PointerSymlinkCreated = $true
  } catch {
    Write-Host "[SKIP] Pointer symlink fixture unavailable on this host: $($_.Exception.Message)"
  }
  if ($PointerSymlinkCreated) {
    Assert-Throws "pointer directory symlink is rejected and transaction rolls back" {
      & $Installer -ProjectRoot $PointerSymlinkProject -SkipPrompts
    }
    Assert-True "failed fresh install leaves no managed target" (-not (Test-Path -LiteralPath (Join-Path $PointerSymlinkProject "context/5fedu")))
    Assert-True "outside pointer directory remains untouched" (@(Get-ChildItem -LiteralPath $OutsidePointer -Force).Count -eq 0)
  }

  $LatePointerSymlinkProject = Join-Path $TestRoot "late-pointer-symlink-project"
  $LateOutsidePointer = Join-Path $TestRoot "late-outside-pointer"
  New-Item -ItemType Directory -Path (Join-Path $LatePointerSymlinkProject ".agents") -Force | Out-Null
  $LateSentinel = Join-Path $LatePointerSymlinkProject ".agents/AGENTS.md"
  [System.IO.File]::WriteAllText($LateSentinel, "must-not-be-overwritten")
  New-Item -ItemType Directory -Path $LateOutsidePointer | Out-Null
  $LatePointerSymlinkCreated = $false
  try {
    New-Item -ItemType SymbolicLink -Path (Join-Path $LatePointerSymlinkProject ".codex") -Target $LateOutsidePointer -ErrorAction Stop | Out-Null
    $LatePointerSymlinkCreated = $true
  } catch {
    Write-Host "[SKIP] Late pointer symlink fixture unavailable on this host: $($_.Exception.Message)"
  }
  if ($LatePointerSymlinkCreated) {
    Assert-Throws "all pointer destinations preflight before first write" {
      & $Installer -ProjectRoot $LatePointerSymlinkProject -SkipPrompts
    }
    Assert-True "earlier pointer remains byte-identical after later preflight failure" (
      (Get-Content -LiteralPath $LateSentinel -Raw) -eq "must-not-be-overwritten"
    )
    Assert-True "pointer preflight fails before context swap" (
      -not (Test-Path -LiteralPath (Join-Path $LatePointerSymlinkProject "context/5fedu"))
    )
  }

  $AliasRealRoot = Join-Path $TestRoot "alias-real-root"
  $AliasProject = Join-Path $AliasRealRoot "project"
  $AliasParent = Join-Path $TestRoot "alias-parent"
  New-Item -ItemType Directory -Path $AliasProject -Force | Out-Null
  $AliasCreated = $false
  try {
    New-Item -ItemType SymbolicLink -Path $AliasParent -Target $AliasRealRoot -ErrorAction Stop | Out-Null
    $AliasCreated = $true
  } catch {
    Write-Host "[SKIP] Ancestor symlink fixture unavailable on this host: $($_.Exception.Message)"
  }
  if ($AliasCreated) {
    Assert-Throws "ProjectRoot with a symlink ancestor is rejected" {
      & $Installer -ProjectRoot (Join-Path $AliasParent "project") -SkipPrompts
    }
    Assert-True "physical project behind alias remains untouched" (
      -not (Test-Path -LiteralPath (Join-Path $AliasProject "context/5fedu"))
    )
  }

  Write-Host "5fedu lean installer regression PASS ($Assertions assertions)"
  exit 0
} finally {
  if ($null -eq $PriorFailpoint) {
    Remove-Item Env:HARNESS_5FEDU_INSTALL_FAILPOINT -ErrorAction SilentlyContinue
  } else {
    $env:HARNESS_5FEDU_INSTALL_FAILPOINT = $PriorFailpoint
  }
  if (Test-Path -LiteralPath $TestRoot) {
    Remove-Item -LiteralPath $TestRoot -Recurse -Force
  }
}
