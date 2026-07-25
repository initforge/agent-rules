param([switch]$KeepFixtures)
$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "path-compat.ps1")

$Root = Split-Path -Parent $PSScriptRoot
$SchemaPath = Join-Path $Root "profiles\5fedu\projects\5fedu\parity\schemas\source-lock.schema.yaml"
$TestRoot = Join-Path $env:TEMP "5fedu-source-lock-test"
$PassCount = 0
$FailCount = 0

function Assert-Equal {
  param([string]$Label, [object]$Expected, [object]$Actual)
  if ($Expected -ne $Actual) {
    Write-Host "FAIL: $Label" -ForegroundColor Red
    Write-Host "  Expected: $Expected"
    Write-Host "  Actual:   $Actual"
    $script:FailCount++
  } else {
    Write-Host "PASS: $Label" -ForegroundColor Green
    $script:PassCount++
  }
}

function Assert-True {
  param([string]$Label, [bool]$Condition)
  Assert-Equal -Label $Label -Expected $true -Actual $Condition
}

function Assert-Cmd {
  param([string]$Label, [scriptblock]$ScriptBlock, [int]$ExpectedExit = 0)
  $ExitCode = 0
  $Output = ""
  try {
    $Output = & $ScriptBlock 2>&1
    $ExitCode = $LASTEXITCODE
  } catch {
    $ExitCode = 1
    $Output = $_.ToString()
  }
  if ($ExpectedExit -eq -1) {
    # Any exit is OK (informational)
    Write-Host "INFO: $Label (exit $ExitCode)"
    $script:PassCount++
  } else {
    Assert-Equal -Label $Label -Expected $ExpectedExit -Actual $ExitCode
  }
}

function Write-TestHeader {
  param([string]$Name)
  Write-Host ""
  Write-Host "=== $Name ===" -ForegroundColor Cyan
}

# Clean up any previous test artifacts
if (Test-Path $TestRoot) { Remove-Item -LiteralPath $TestRoot -Recurse -Force }
New-Item -ItemType Directory -Force -Path $TestRoot | Out-Null

try {
  # =====================================================================
  Write-TestHeader "1. Schema validation"
  # =====================================================================

  $SchemaContent = Get-Content -Raw $SchemaPath
  try {
    $Schema = $SchemaContent | ConvertFrom-Json
    Assert-True "Schema parses as valid JSON" ($Schema -ne $null)
  } catch {
    Assert-True "Schema parses as valid JSON" $false
  }

  # =====================================================================
  Write-TestHeader "2. Source-lock JSON contract"
  # =====================================================================

  $HarnessLock = Join-Path $Root "profiles\5fedu\projects\5fedu\source-lock.json"
  $LockExists = Test-Path $HarnessLock
  Assert-True "Harness source-lock.json exists" $LockExists

  if ($LockExists) {
    try {
      $Lock = Get-Content -Raw $HarnessLock | ConvertFrom-Json
      Assert-True "Lock has version field" ($Lock.version -eq 1)
      Assert-True "Lock has sourceLock field" ($null -ne $Lock.sourceLock)
      Assert-True "Lock has repository" ($Lock.sourceLock.repository -ne "")
      Assert-True "Lock has commitSha (may be placeholder)" ($Lock.sourceLock.commitSha -ne "")
      Assert-True "Lock has templatePath" ($Lock.sourceLock.templatePath -ne "")
      Assert-True "Lock has integrity" ($null -ne $Lock.sourceLock.integrity)
      Assert-True "Lock has integrity.algorithm" ($Lock.sourceLock.integrity.algorithm -in @("sha256", "sha512"))
      Assert-True "Lock has moduleIndex" ($null -ne $Lock.sourceLock.moduleIndex)
    } catch {
      Assert-True "Lock parses as valid JSON" $false
    }
  }

  # =====================================================================
  Write-TestHeader "3. Module inventory"
  # =====================================================================

  $InventoryPath = Join-Path $Root "profiles\5fedu\projects\5fedu\domains\references\module-inventory.yaml"
  $InventoryExists = Test-Path $InventoryPath
  Assert-True "Module inventory file exists" $InventoryExists

  if ($InventoryExists) {
    $InventoryContent = Get-Content -Raw $InventoryPath
    Assert-True "Module inventory has modules section" ($InventoryContent -match "modules:")
    Assert-True "Module inventory has nhan-vien" ($InventoryContent -match "nhan-vien:")
    Assert-True "Module inventory has shared-components" ($InventoryContent -match "shared-components:")
  }

  # =====================================================================
  Write-TestHeader "4. Template integrity computation"
  # =====================================================================

  # Create a minimal fixture git repo for integrity testing
  $FixtureDir = Join-Path $TestRoot "fixture-repo"
  New-Item -ItemType Directory -Force -Path $FixtureDir | Out-Null

  # Init repo
  & git -C $FixtureDir init --initial-branch main 2>&1 | Out-Null
  & git -C $FixtureDir config user.email "test@test.com" 2>&1 | Out-Null
  & git -C $FixtureDir config user.name "Test" 2>&1 | Out-Null

  # Create template structure
  $TemplateDir = Join-Path $FixtureDir "template"
  New-Item -ItemType Directory -Force -Path "$TemplateDir\shared" | Out-Null
  New-Item -ItemType Directory -Force -Path "$TemplateDir\features\module-a" | Out-Null
  Set-Content -Path "$TemplateDir\index.tsx" -Value "export const App = () => null;"
  Set-Content -Path "$TemplateDir\shared\Toolbar.tsx" -Value "export const Toolbar = () => null;"
  Set-Content -Path "$TemplateDir\features\module-a\index.tsx" -Value "export const ModuleA = () => null;"

  & git -C $FixtureDir add -A 2>&1 | Out-Null
  & git -C $FixtureDir commit -m "Initial fixture" 2>&1 | Out-Null
  $CommitSha = (& git -C $FixtureDir rev-parse HEAD).Trim()

  Assert-True "Fixture commit SHA is 40-char" ($CommitSha -match '^[a-f0-9]{40}$')

  # Compute tree hash
  $TreeHash = & git -C $FixtureDir ls-tree -r $CommitSha template
  $IntegrityHash = & {
    $Bytes = [System.Text.Encoding]::UTF8.GetBytes(($TreeHash -join "`n"))
    $Hash = [System.Security.Cryptography.SHA256]::HashData($Bytes)
    return [System.BitConverter]::ToString($Hash).Replace("-", "").ToLowerInvariant()
  }
  Assert-True "Tree hash is non-empty" ($IntegrityHash -ne "")

  # =====================================================================
  Write-TestHeader "5. Materialization script (dry-run)"
  # =====================================================================

  $DrRunResult = & {
    $env:TempProject = $TestRoot
    & (Join-Path $PSScriptRoot "14-materialize-template-source.ps1") `
      -SourceLockJson "{`"version`":1,`"sourceLock`":{`"repository`":`"https://example.com/repo.git`",`"commitSha`":`"$CommitSha`",`"templatePath`":`".`",`"integrity`":{`"algorithm`":`"sha256`",`"hash`":`"$IntegrityHash`"}}}" `
      -ProjectRoot $TestRoot `
      -DryRun 2>&1
    $ec = $LASTEXITCODE
    if ($ec -ne 0) { throw "Dry-run failed: $ec" }
  } 2>&1
  if ($LASTEXITCODE -eq 0) {
    Assert-True "Materialization dry-run succeeds" $true
  } else {
    Assert-True "Materialization dry-run succeeds" $false
  }

  # =====================================================================
  Write-TestHeader "6. Materialization from local repo"
  # =====================================================================

  $LocalMaterializeResult = & {
    & (Join-Path $PSScriptRoot "14-materialize-template-source.ps1") `
      -SourceLockJson "{`"version`":1,`"sourceLock`":{`"repository`":`"https://example.com/repo.git`",`"commitSha`":`"$CommitSha`",`"templatePath`":`"template`",`"integrity`":{`"algorithm`":`"sha256`",`"hash`":`"$IntegrityHash`"}}}" `
      -ProjectRoot $TestRoot `
      -LocalRepoOverride $FixtureDir 2>&1
    $ec = $LASTEXITCODE
    if ($ec -ne 0) { throw "Local materialize failed: $ec" }
    Write-Host "OUTPUT: $_"
  } 2>&1
  if ($LASTEXITCODE -eq 0) {
    Assert-True "Materialization from local repo succeeds" $true
  } else {
    Write-Host "  (may fail if git fetch on detached is restricted - this is expected on some platforms)"
    Assert-True "Materialization from local repo succeeds" $false
  }

  # =====================================================================
  Write-TestHeader "7. Cache isolation"
  # =====================================================================

  # Check that cache is inside .agent directory
  $AgentDir = Join-Path $TestRoot ".agent"
  $CacheExists = (Test-Path $AgentDir) -and ((Get-ChildItem $AgentDir -Recurse -Directory | Where-Object { $_.Name -eq "source-lock-cache" }).Count -gt 0)
  Assert-True "Cache is isolated in .agent/source-lock-cache" $CacheExists

  # =====================================================================
  Write-TestHeader "8. Doctor check"
  # =====================================================================

  # Export lock to file for doctor
  $LockForDoctor = @{
    version = 1
    sourceLock = @{
      repository = "https://example.com/repo.git"
      commitSha = $CommitSha
      templatePath = "template"
      integrity = @{
        algorithm = "sha256"
        hash = $IntegrityHash
      }
      verificationState = "verified"
      lastVerified = (Get-Date -Format 'yyyy-MM-ddTHH:mm:ss')
    }
  } | ConvertTo-Json -Depth 5
  $DoctorLockPath = Join-Path $TestRoot "test-source-lock.json"
  Set-Content -Path $DoctorLockPath -Value $LockForDoctor

  $DoctorResult = & {
    & (Join-Path $PSScriptRoot "doctor-5fedu-source-lock.ps1") -ProjectRoot $TestRoot -SourceLockPath $DoctorLockPath 2>&1
    $ec = $LASTEXITCODE
    if ($ec -eq 0) { Write-Host "Doctor PASS" }
    else { Write-Host "Doctor FAIL (exit $ec)" }
  } 2>&1
  if ($LASTEXITCODE -eq 0) {
    Assert-True "Doctor check passes with valid lock" $true
  } else {
    Assert-True "Doctor check passes with valid lock" $false
  }

  # =====================================================================
  Write-TestHeader "9. Source-lock guide document"
  # =====================================================================

  $GuidePath = Join-Path $Root "profiles\5fedu\projects\5fedu\source-lock-guide.md"
  Assert-True "Source-lock guide exists" (Test-Path $GuidePath)

  if (Test-Path $GuidePath) {
    $GuideContent = Get-Content -Raw $GuidePath
    Assert-True "Guide describes materialization flow" ($GuideContent -match "Materialization flow")
    Assert-True "Guide describes context-saving behavior" ($GuideContent -match "Context-saving")
    Assert-True "Guide describes security" ($GuideContent -match "Security")
    Assert-True "Guide describes commands" ($GuideContent -match "Commands")
  }

  # =====================================================================
  Write-TestHeader "10. Module inventory has minimum modules"
  # =====================================================================

  if ($InventoryExists) {
    $RequiredModules = @("nhan-vien", "phong-ban", "chuc-vu", "phan-quyen", "thong-tin-cong-ty", "shared-components", "shared-hooks", "lib-utils")
    $FoundModules = @()
    foreach ($Mod in $RequiredModules) {
      if ($InventoryContent -match "$($Mod):") { $FoundModules += $Mod }
    }
    $AllPresent = ($FoundModules.Count -eq $RequiredModules.Count)
    Assert-True "All required modules present in inventory" $AllPresent
    if (-not $AllPresent) {
      Write-Host "  Missing: $($RequiredModules | Where-Object { $_ -notin $FoundModules } | ForEach-Object { "$_ " })"
    }
  }

  # =====================================================================
  Write-TestHeader "11. source-lock.json commitSha is placeholder (not real)"
  # =====================================================================

  if ($LockExists) {
    $Lock = Get-Content -Raw $HarnessLock | ConvertFrom-Json
    $IsPlaceholder = ($Lock.sourceLock.commitSha -eq "0000000000000000000000000000000000000000")
    Assert-True "Default source-lock commitSha is placeholder zeros" $IsPlaceholder
  }

  # =====================================================================
  Write-TestHeader "12. Schema file path matches conventions"
  # =====================================================================

  Assert-True "Schema at correct path (profiles/5fedu/projects/)" $SchemaOk

  # =====================================================================
  Write-TestHeader "13. Empty hash detection in doctor"
  # =====================================================================

  $EmptyHash = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
  $LockWithEmptyHash = @{
    version = 1
    sourceLock = @{
      repository = "https://example.com/repo.git"
      commitSha = $CommitSha
      templatePath = "."
      integrity = @{
        algorithm = "sha256"
        hash = $EmptyHash
      }
      verificationState = "unverified"
    }
  } | ConvertTo-Json -Depth 5
  $EmptyLockPath = Join-Path $TestRoot "empty-hash-lock.json"
  Set-Content -Path $EmptyLockPath -Value $LockWithEmptyHash

  $EmptyDoctorResult = & {
    & (Join-Path $PSScriptRoot "doctor-5fedu-source-lock.ps1") -ProjectRoot $TestRoot -SourceLockPath $EmptyLockPath -Quiet 2>&1
    $ec = $LASTEXITCODE
    if ($ec -ne 0) { Write-Host "Doctor correctly detected empty hash (exit $ec)" }
    else { Write-Host "Doctor did not detect empty hash" }
  } 2>&1

  Assert-True "Doctor detects empty integrity hash" ($LASTEXITCODE -ne 0)

} finally {
  # Clean up test artifacts unless KeepFixtures
  if (-not $KeepFixtures -and (Test-Path $TestRoot)) {
    Remove-Item -LiteralPath $TestRoot -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host ""
    Write-Host "Test fixtures cleaned: $TestRoot"
  }
}

# Summary
Write-Host ""
Write-Host "==============================" -ForegroundColor Cyan
Write-Host "  RESULTS: $PassCount passed, $FailCount failed" -ForegroundColor $(if ($FailCount -eq 0) { "Green" } else { "Red" })
Write-Host "==============================" -ForegroundColor Cyan

if ($FailCount -gt 0) { exit 1 }
exit 0
