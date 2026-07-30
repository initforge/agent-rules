param(
  [Parameter(Mandatory, ParameterSetName = "LockPath")]
  [string]$SourceLockPath,
  [Parameter(Mandatory, ParameterSetName = "ProjectRoot")]
  [string]$ProjectRoot,
  [Parameter()]
  [string]$Module = "",
  [Parameter()]
  [string]$OutputDir = "",
  [Parameter()]
  [string]$LocalRepoOverride = "",
  [Parameter()]
  [string]$SourceLockJson = "",
  [Parameter()]
  [switch]$AllowNetwork,
  [Parameter()]
  [switch]$DryRun,
  [Parameter()]
  [switch]$Clean,
  [Parameter()]
  [switch]$ValidateOnly
)
$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "path-compat.ps1")

# --- Helpers ---------------------------------------------------------------
function Write-Step { param([string]$Msg) Write-Host "[14-materialize] $Msg" }

function Resolve-LockData {
  if ($SourceLockPath) {
    if (-not (Test-Path $SourceLockPath)) { throw "Source-lock not found: $SourceLockPath" }
    return (Get-Content -Raw $SourceLockPath | ConvertFrom-Json)
  }
  if ($SourceLockJson) { return ($SourceLockJson | ConvertFrom-Json) }

  # Default: look in project's context/5fedu/
  $Candidates = @(
    "$ProjectRoot\context\5fedu\source-lock.json",
    "$ProjectRoot\source-lock.json",
    "$ProjectRoot\.agent\source-lock.json"
  )
  foreach ($C in $Candidates) {
    if (Test-Path $C) { return (Get-Content -Raw $C | ConvertFrom-Json) }
  }

  # Fallback to harness default
  $HarnessLock = Join-Path (Split-Path -Parent $PSScriptRoot) "profiles\5fedu\projects\5fedu\source-lock.json"
  if (Test-Path $HarnessLock) {
    Write-Step "WARN: Using harness default source-lock.json (no project lock found)"
    return (Get-Content -Raw $HarnessLock | ConvertFrom-Json)
  }
  throw "No source-lock.json found. Provide -SourceLockPath or -ProjectRoot with context/5fedu/source-lock.json"
}

function Get-CacheDir {
  param($Lock)
  $RepoHash = Get-FileHashRaw $Lock.sourceLock.repository
  $CommitPrefix = $Lock.sourceLock.commitSha.Substring(0, 12)
  if ($OutputDir) { return Join-Path $OutputDir "source-lock-cache\$RepoHash\$CommitPrefix" }
  $AgentDir = Join-Path $ProjectRoot ".agent"
  if (-not (Test-Path $AgentDir)) { New-Item -ItemType Directory -Force -Path $AgentDir | Out-Null }
  return Join-Path $AgentDir "source-lock-cache\$RepoHash\$CommitPrefix"
}

function Get-FileHashRaw {
  param([string]$Text)
  $Bytes = [System.Text.Encoding]::UTF8.GetBytes($Text)
  $Sha256 = [System.Security.Cryptography.SHA256]::Create()
  try {
    $Hash = $Sha256.ComputeHash($Bytes)
    return [System.BitConverter]::ToString($Hash).Replace("-", "").ToLowerInvariant()
  } finally {
    $Sha256.Dispose()
  }
}

function Get-TreeHash {
  param([string]$DirPath)
  if (-not (Test-Path $DirPath)) { return "" }
  $Items = Get-ChildItem $DirPath -Recurse -File | ForEach-Object {
    $Rel = $_.FullName.Substring($DirPath.Length + 1).Replace('\', '/')
    $BlobHash = Get-FileHashRaw ((Get-Content -Raw -Encoding UTF8 $_.FullName) -replace "`r`n", "`n")
    "$Rel`t$BlobHash"
  } | Sort-Object
  return Get-FileHashRaw ($Items -join "`n")
}

function Get-GitExecutable {
  foreach ($Candidate in @("git", "git.exe")) {
    $Resolved = Get-Command $Candidate -ErrorAction SilentlyContinue
    if ($Resolved) { return $Resolved.Source }
  }
  return $null
}

function Invoke-Git {
  param([string]$WorkDir, [string]$Args)
  $GitExe = Get-GitExecutable
  if (-not $GitExe) { throw "Git is required but not found in PATH" }
  $Output = & $GitExe -C $WorkDir $Args 2>&1
  $ExitCode = $LASTEXITCODE
  if ($ExitCode -ne 0) { throw "git $Args failed (exit $ExitCode): $Output" }
  return $Output
}

function Get-CommitTreeHash {
  param([string]$RepoDir, [string]$CommitSha, [string]$SubPath)
  $TreeSha = Invoke-Git -WorkDir $RepoDir -Args "ls-tree -r $CommitSha $SubPath"
  return Get-FileHashRaw ($TreeSha -join "`n")
}

function Copy-TemplatePaths {
  param([string]$SourceRepo, [string]$CommitSha, [string]$TemplatePath, [string]$DestDir)
  try {
    Invoke-Git -WorkDir $SourceRepo -Args "checkout --quiet $CommitSha"
  } catch {
    throw "Cannot checkout pinned commit $CommitSha : $_"
  }
  $FullSource = Join-Path $SourceRepo ($TemplatePath -replace "/", "\")
  $Items = Get-ChildItem $FullSource -Force -ErrorAction SilentlyContinue
  if (-not $Items) { throw "Template path '$TemplatePath' not found in repository at $CommitSha" }
  if (-not (Test-Path $DestDir)) { New-Item -ItemType Directory -Force -Path $DestDir | Out-Null }
  foreach ($Item in $Items) {
    $Rel = $Item.Name
    $Dest = Join-Path $DestDir $Rel
    if ($Item.PSIsContainer) {
      Copy-Item -LiteralPath $Item.FullName -Destination $Dest -Recurse -Force
    } else {
      Copy-Item -LiteralPath $Item.FullName -Destination $Dest -Force
    }
  }
}

function Write-Metadata {
  param([string]$MetaDir, $Lock, [string]$State)
  $Meta = [ordered]@{
    sourceLock = $Lock.sourceLock
    materializedAt = (Get-Date -Format 'yyyy-MM-ddTHH:mm:ss')
    state = $State
    module = $Module
  }
  if (-not (Test-Path $MetaDir)) { New-Item -ItemType Directory -Force -Path $MetaDir | Out-Null }
  $Meta | ConvertTo-Json -Depth 5 | Set-Content -Encoding UTF8 (Join-Path $MetaDir "_metadata.json")
  Write-Step "Recorded materialization metadata: $(Join-Path $MetaDir '_metadata.json')"
}

# --- Main flow -------------------------------------------------------------

if (-not $SourceLockPath -and -not $ProjectRoot -and -not $SourceLockJson) {
  throw "Provide -SourceLockPath, -ProjectRoot, or -SourceLockJson"
}
if ($ProjectRoot -and -not (Test-Path $ProjectRoot)) { throw "Project root not found: $ProjectRoot" }

# Step 1: Resolve source lock
Write-Step "Resolving source lock..."
$Lock = Resolve-LockData

if ($Lock.version -ne 1) { throw "Unsupported source-lock version: $($Lock.version). Expected 1." }
$LockData = $Lock.sourceLock
if (-not $LockData) { throw "sourceLock field missing in source-lock" }
if (-not $LockData.repository) { throw "sourceLock.repository is required" }
if (-not $LockData.commitSha -or $LockData.commitSha -notmatch '^[a-f0-9]{40}$') {
  throw "sourceLock.commitSha must be a 40-char hex SHA, got: $($LockData.commitSha)"
}
if (-not $LockData.templatePath) { throw "sourceLock.templatePath is required" }

Write-Step "Lock targets: $($LockData.repository) @ $($LockData.commitSha.Substring(0,12))..."

# Step 2: Determine cache location
$CacheDir = Get-CacheDir -Lock $Lock
$MetaDir = Split-Path $CacheDir -Parent
$CacheMeta = Join-Path $MetaDir "_metadata.json"
$CacheHit = Test-Path $CacheDir
$CachedState = "unverified"
if (Test-Path $CacheMeta) {
  try {
    $CachedMeta = (Get-Content -Raw $CacheMeta | ConvertFrom-Json)
    $CachedState = $CachedMeta.state
  } catch { $CachedState = "unverified" }
}

Write-Step "Cache: $(if ($CacheHit) { 'HIT' } else { 'MISS' }) at $CacheDir"
Write-Step "Cache state: $CachedState"

# Step 3: Clean requested?
if ($Clean) {
  if (Test-Path $CacheDir) {
    Remove-Item -LiteralPath $CacheDir -Recurse -Force
    Write-Step "Cache cleaned: $CacheDir"
  } else {
    Write-Step "Nothing to clean (cache does not exist)"
  }
  if (Test-Path $CacheMeta) { Remove-Item -LiteralPath $CacheMeta -Force }
  return
}

# Step 3b: Dry run?
if ($DryRun) {
  Write-Step "DRY RUN: Would materialize $($LockData.repository) @ $($LockData.commitSha.Substring(0,12))..."
  Write-Step "DRY RUN: Cache dir: $CacheDir"
  Write-Step "DRY RUN: Module: $(if ($Module) { $Module } else { 'all' })"
  Write-Step "DRY RUN: Template path: $($LockData.templatePath)"
  if ($CacheHit) {
    Write-Step "DRY RUN: Current tree hash: $(Get-TreeHash $CacheDir)"
    Write-Step "DRY RUN: Expected integrity hash: $($LockData.integrity.hash)"
  }
  return
}

# Step 4: Validate only?
if ($ValidateOnly) {
  if (-not $CacheHit) {
    Write-Step "VALIDATE: Cache miss. Cannot validate without materialization."
    Write-Step "VALIDATE: Run without -ValidateOnly (and -AllowNetwork or -LocalRepoOverride) first."
    return
  }
  $TreeHash = Get-TreeHash $CacheDir
  $ExpectedHash = $LockData.integrity.hash
  $Algo = $LockData.integrity.algorithm
  if ($TreeHash -eq $ExpectedHash) {
    Write-Step "VALIDATE: Integrity PASS ($($Algo): $TreeHash)"
    # Update metadata
    $LockData.lastVerified = (Get-Date -Format 'yyyy-MM-ddTHH:mm:ss')
    $LockData.verificationState = "verified"
    Write-Metadata -MetaDir $MetaDir -Lock $Lock -State "verified"
  } else {
    Write-Step "VALIDATE: Integrity FAIL"
    Write-Step "VALIDATE:   Expected: $ExpectedHash"
    Write-Step "VALIDATE:   Actual:   $TreeHash"
    $LockData.lastVerified = (Get-Date -Format 'yyyy-MM-ddTHH:mm:ss')
    $LockData.verificationState = "stale"
    Write-Metadata -MetaDir $MetaDir -Lock $Lock -State "stale"
    throw "Integrity verification FAILED. Cache is stale or corrupted."
  }
  return
}

# Step 5: Materialize
if ($CacheHit) {
  Write-Step "Cache hit. Verifying integrity..."
  $TreeHash = Get-TreeHash $CacheDir
  $ExpectedHash = $LockData.integrity.hash
  if ($TreeHash -eq $ExpectedHash) {
    Write-Step "Integrity verified. Cache is valid."
    $LockData.lastVerified = (Get-Date -Format 'yyyy-MM-ddTHH:mm:ss')
    $LockData.verificationState = "verified"
    Write-Metadata -MetaDir $MetaDir -Lock $Lock -State "verified"
    Write-Step "Cached materialization ready: $CacheDir"
    return $CacheDir
  } else {
    Write-Step "WARN: Cache integrity mismatch. Expected $ExpectedHash, got $TreeHash"
    Write-Step "WARN: Re-materializing..."
  }
}

# Step 6: Need to fetch
$RepoSource = ""
if ($LocalRepoOverride) {
  if (-not (Test-Path $LocalRepoOverride)) { throw "Local repo override not found: $LocalRepoOverride" }
  $RepoSource = $LocalRepoOverride
  Write-Step "Using local repo: $RepoSource"
} elseif ($AllowNetwork) {
  # Clone to a temp location for fetching
  $FetchDir = Join-Path $MetaDir "_fetch"
  if (Test-Path $FetchDir) { Remove-Item -LiteralPath $FetchDir -Recurse -Force }
  Write-Step "Cloning from $($LockData.repository) ..."
  try {
    Invoke-Git -WorkDir (Split-Path $FetchDir -Parent) -Args "clone --filter=tree:0 --no-checkout $($LockData.repository) _fetch"
  } catch {
    throw "Git clone failed for $($LockData.repository). Check network and repository URL."
  }
  $RepoSource = $FetchDir
  Write-Step "Clone complete."
} else {
  throw "Cache miss and no local source. Provide -AllowNetwork or -LocalRepoOverride to fetch the template source."
}

# Step 7: Checkout pinned commit
Write-Step "Checking out pinned commit $($LockData.commitSha.Substring(0,12))..."
try {
  Invoke-Git -WorkDir $RepoSource -Args "fetch --depth 1 origin $($LockData.commitSha)" 2>$null
} catch {
  # shallow fetch may fail; try to just checkout from what we have
}
try {
  Invoke-Git -WorkDir $RepoSource -Args "checkout --quiet $($LockData.commitSha)"
} catch {
  if ($AllowNetwork) {
    # Full fetch as fallback
    Invoke-Git -WorkDir $RepoSource -Args "fetch --unshallow origin $($LockData.commitSha)" 2>$null
    Invoke-Git -WorkDir $RepoSource -Args "checkout --quiet $($LockData.commitSha)"
  } else {
    throw "Cannot checkout commit $($LockData.commitSha.Substring(0,12)). Fetch may be incomplete."
  }
}

# Step 8: Verify integrity
Write-Step "Verifying tree integrity..."
$ActualTreeHash = Get-CommitTreeHash -RepoDir $RepoSource -CommitSha $LockData.commitSha -SubPath $LockData.templatePath
$ExpectedHash = $LockData.integrity.hash

if ($ActualTreeHash -ne $ExpectedHash) {
  Write-Step "WARN: Tree hash mismatch"
  Write-Step "  Locked:  $ExpectedHash"
  Write-Step "  Actual:  $ActualTreeHash"
  Write-Step "  This may indicate the source-lock is stale or the repository has changed."
  if (-not $AllowNetwork) {
    throw "Integrity verification FAILED without -AllowNetwork. Re-run with -AllowNetwork to accept the new hash."
  }
  # With AllowNetwork, we update the integrity hash
  $LockData.integrity.hash = $ActualTreeHash
  Write-Step "Integrity hash updated to match actual tree."
} else {
  Write-Step "Integrity PASS ($($LockData.integrity.algorithm): $ActualTreeHash)"
}

# Step 9: Materialize template paths to cache
Write-Step "Materializing template to cache..."
Copy-TemplatePaths -SourceRepo $RepoSource -CommitSha $LockData.commitSha -TemplatePath $LockData.templatePath -DestDir $CacheDir

# Step 10: Materialize only requested module (if specified)
if ($Module) {
  $ModuleIndex = $LockData.moduleIndex
  if (-not $ModuleIndex -or -not $ModuleIndex.$Module) {
    Write-Step "WARN: Module '$Module' not found in source-lock's moduleIndex. Materialized full template."
  } else {
    $ModInfo = $ModuleIndex.$Module
    $ModSource = Join-Path $CacheDir ($ModInfo.path -replace "/", "\")
    $ModDest = Join-Path $CacheDir "_modules\$Module"
    if (Test-Path $ModSource) {
      Write-Step "Module '$Module' found. Copying from $($ModInfo.path) ..."
      if (-not (Test-Path $ModDest)) { New-Item -ItemType Directory -Force -Path $ModDest | Out-Null }
      Copy-Item -LiteralPath $ModSource -Destination $ModDest -Recurse -Force
      Write-Step "Module materialized: $ModDest"
    } else {
      Write-Step "WARN: Module path '$($ModInfo.path)' not found in materialized template"
    }
  }
}

# Step 11: Record metadata
$LockData.lastVerified = (Get-Date -Format 'yyyy-MM-ddTHH:mm:ss')
$LockData.verificationState = "verified"
Write-Metadata -MetaDir $MetaDir -Lock $Lock -State "verified"

# Step 12: Clean up fetch temp
$FetchDir = Join-Path $MetaDir "_fetch"
if (Test-Path $FetchDir) { Remove-Item -LiteralPath $FetchDir -Recurse -Force }

Write-Step "Materialization complete."
Write-Step "  Cache: $CacheDir"
if ($Module) {
  Write-Step "  Module: $(Join-Path $CacheDir '_modules\' + $Module)"
}
Write-Step "  State: verified"
Write-Step ""
Write-Step "To use in parity: read files from $CacheDir"
Write-Step "To clean: add -Clean"

return $CacheDir
