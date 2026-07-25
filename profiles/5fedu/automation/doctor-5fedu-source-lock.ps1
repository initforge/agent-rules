param(
  [Parameter(Mandatory)]
  [string]$ProjectRoot,
  [Parameter()]
  [string]$SourceLockPath = "",
  [Parameter()]
  [switch]$Quiet
)
$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "path-compat.ps1")

$Problems = [System.Collections.Generic.List[string]]::new()
$Root = Split-Path -Parent $PSScriptRoot
$SchemaPath = Join-Path $Root "projects\5fedu\source-lock.schema.json"

function Write-Diag { param([string]$Msg) if (-not $Quiet) { Write-Host "[doctor-source-lock] $Msg" } }

# 1. Check schema exists
Write-Diag "Checking source-lock schema..."
$SchemaOk = Test-Path $SchemaPath
if (-not $SchemaOk) { $Problems.Add("Schema not found: $SchemaPath") }
Write-Diag "  Schema: $(if ($SchemaOk) { 'OK' } else { 'MISSING' })"

# 2. Resolve lock path
if (-not $SourceLockPath) {
  $Candidates = @(
    "$ProjectRoot\context\5fedu\source-lock.json",
    "$ProjectRoot\source-lock.json",
    "$ProjectRoot\.agent\source-lock.json",
    "$Root\projects\5fedu\source-lock.json"
  )
  foreach ($C in $Candidates) {
    if (Test-Path $C) { $SourceLockPath = $C; break }
  }
}
if (-not $SourceLockPath -or -not (Test-Path $SourceLockPath)) {
  $Problems.Add("No source-lock.json found. Checked: $($Candidates -join ', ')")
  if ($Problems.Count -gt 0) {
    $Problems | ForEach-Object { Write-Error $_ }
    exit 1
  }
  exit 0
}
Write-Diag "Source-lock: $SourceLockPath"

# 3. Validate JSON structure
$LockJson = Get-Content -Raw $SourceLockPath
try {
  $Lock = $LockJson | ConvertFrom-Json -AsHashtable
} catch {
  $Problems.Add("Invalid JSON in source-lock: $_")
  $Problems | ForEach-Object { Write-Error $_ }
  exit 1
}

if ($Lock.version -ne 1) { $Problems.Add("Source-lock version must be 1, got: $($Lock.version)") }

$LockData = $Lock.sourceLock
if (-not $LockData) { $Problems.Add("Missing sourceLock field") }
else {
  if (-not $LockData.repository) { $Problems.Add("Missing sourceLock.repository") }
  else { Write-Diag "  Repository: $($LockData.repository)" }

  if (-not $LockData.commitSha) { $Problems.Add("Missing sourceLock.commitSha") }
  elseif ($LockData.commitSha -notmatch '^[a-f0-9]{40}$') { $Problems.Add("Bad commitSha format: $($LockData.commitSha)") }
  else { Write-Diag "  Commit: $($LockData.commitSha.Substring(0,12))..." }

  if (-not $LockData.templatePath) { $Problems.Add("Missing sourceLock.templatePath") }
  else { Write-Diag "  Template path: $($LockData.templatePath)" }

  if (-not $LockData.integrity) { $Problems.Add("Missing sourceLock.integrity") }
  else {
    if (-not $LockData.integrity.algorithm) { $Problems.Add("Missing integrity.algorithm") }
    if (-not $LockData.integrity.hash) { $Problems.Add("Missing integrity.hash") }
    else {
      Write-Diag "  Integrity: $($LockData.integrity.algorithm) $($LockData.integrity.hash.Substring(0,16))..."
      if ($LockData.integrity.hash -eq 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855') {
        $Problems.Add("Integrity hash is empty SHA-256 (template not yet materialized)")
      }
    }
  }

  if ($LockData.verificationState -and @("verified","stale","unverified") -notcontains $LockData.verificationState) {
    $Problems.Add("Bad verificationState: $($LockData.verificationState). Expected verified/stale/unverified")
  }
  Write-Diag "  State: $($LockData.verificationState)"
  if ($LockData.lastVerified) { Write-Diag "  Last verified: $($LockData.lastVerified)" }
}

# 4. Check cache status
$RepoHash = Get-FileHashRaw $LockData.repository
$CommitPrefix = $LockData.commitSha.Substring(0, 12)
$CacheDir = Join-Path $ProjectRoot ".agent\source-lock-cache\$RepoHash\$CommitPrefix"
$CacheMeta = Join-Path (Split-Path $CacheDir -Parent) "_metadata.json"

if (-not (Test-Path $ProjectRoot)) {
  $Problems.Add("Project root not accessible: $ProjectRoot")
} else {
  $CacheExists = Test-Path $CacheDir
  $MetaExists = Test-Path $CacheMeta
  Write-Diag "  Cache: $(if ($CacheExists) { "EXISTS at $CacheDir" } else { "MISS (expected: $CacheDir)" })"
  Write-Diag "  Metadata: $(if ($MetaExists) { "EXISTS" } else { "MISSING" })"

  if ($MetaExists) {
    try {
      $Meta = Get-Content -Raw $CacheMeta | ConvertFrom-Json -AsHashtable
      Write-Diag "  Cached state: $($Meta.state) (materialized at $($Meta.materializedAt))"
      if ($Meta.state -eq "stale") {
        $Problems.Add("Cached materialization is stale. Run 14-materialize-template-source.ps1 -ProjectRoot '$ProjectRoot' -AllowNetwork")
      }
    } catch {
      $Problems.Add("Cache metadata corrupt: $CacheMeta")
    }
  }

  # Config check: git availability
  $GitExe = Get-Command git -ErrorAction SilentlyContinue
  if (-not $GitExe) { $Problems.Add("Git is not available in PATH. Required for materialization.") }
  else { Write-Diag "  Git: $(if ($GitExe) { $GitExe.Source } else { 'NOT FOUND' })" }
}

# 5. Check module inventory
$InventoryPath = Join-Path $Root "projects\5fedu\domains\references\module-inventory.yaml"
$InventoryOk = Test-Path $InventoryPath
if (-not $InventoryOk) { $Problems.Add("Module inventory not found: $InventoryPath") }
Write-Diag "  Module inventory: $(if ($InventoryOk) { 'OK' } else { 'MISSING' })"

# 6. Check pattern-inventory consistency
$PatternInventory = Join-Path $Root "projects\5fedu\domains\references\pattern-inventory.yaml"
$PatternOk = Test-Path $PatternInventory
if (-not $PatternOk) { $Problems.Add("Pattern inventory not found: $PatternInventory") }
Write-Diag "  Pattern inventory: $(if ($PatternOk) { 'OK' } else { 'MISSING' })"

# 7. Report
Write-Diag ""
if ($Problems.Count -gt 0) {
  Write-Diag "FOUND $($Problems.Count) PROBLEM(S):"
  $Problems | ForEach-Object { Write-Error "  $_" }
  exit 1
}

Write-Diag "SOURCE-LOCK HEALTH: PASS"
exit 0
