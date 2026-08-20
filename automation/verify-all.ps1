# verify-all.ps1 - canonical all-checks runner for npm run verify:all
# FAIL closed: any missing suite is a non-zero exit.
# No browser/native claims when unavailable; returns nonzero on any failure.
param(
  [switch]$SkipBuild,
  [switch]$SkipPython,
  [switch]$SkipPS1,
  [switch]$SelfCheckOnly
)

$ErrorActionPreference = "Continue"
$script:FAILED = $false
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

# -- Machine-readable report paths -----------------------------------------------
$REPORT_FILE = Join-Path $Root "vitest-verify-report.json"
$REPORT_CLEAN = Join-Path $Root "vitest-verify-report.clean.json"
function Run-Step {
  param([string]$Label, [scriptblock]$Block)
  Write-Host ""
  Write-Host ("=== {0} ===" -f $Label) -ForegroundColor Cyan
  $sw = [Diagnostics.Stopwatch]::StartNew()
  try {
    $result = & $Block 2>&1
    $sw.Stop()
    if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) {
      Write-Host ("[{0}] FAILED (exit {1}, {2}ms)" -f $Label, $LASTEXITCODE, $sw.ElapsedMilliseconds) -ForegroundColor Red
      $script:FAILED = $true
    } else {
      Write-Host ("[{0}] OK ({1}ms)" -f $Label, $sw.ElapsedMilliseconds) -ForegroundColor Green
    }
    if ($result) { $result | Out-String | Write-Host }
  } catch {
    $sw.Stop()
    Write-Host ("[{0}] CRASHED: {1} ({2}ms)" -f $Label, $_.Exception.Message, $sw.ElapsedMilliseconds) -ForegroundColor Red
    $script:FAILED = $true
  }
}

# -- Self-check: config exists + auto-discover all test files ----------------------
Run-Step "SELF: sanity-check" {
  $issues = @()

  # Config must exist
  $verifyConfig = Join-Path $Root "vitest.verify.config.ts"
  if (-not (Test-Path $verifyConfig)) { $issues += "missing vitest.verify.config.ts" }

  # Discover ALL *.test.ts and *.spec.ts files under $Root, excluding build/generated/node_modules dirs.
  # Normalize to relative paths from $Root with forward-slashes.
  $allFiles = Get-ChildItem -Path $Root -Recurse -Include "*.test.ts","*.spec.ts" |
    Where-Object { $_.FullName -notmatch '\\node_modules\\' -and
                    $_.FullName -notmatch '\\dist\\'       -and
                    $_.FullName -notmatch '\\generated\\' } |
    ForEach-Object {
      ($_.FullName.Replace($Root + '\', '').Replace('\', '/'))
    }

  if ($allFiles.Count -eq 0) {
    $issues += "no test files discovered"
  } else {
    Write-Host ("  discovered {0} test file(s)" -f $allFiles.Count) -ForegroundColor Green
  }

  if ($issues.Count -gt 0) {
    foreach ($i in $issues) { Write-Host ("  FAIL: {0}" -f $i) -ForegroundColor Red }
    throw ("self-check failed with {0} issue(s)" -f $issues.Count)
  }

  # Persist discovery list for vitest step
  $script:DISCOVERED_SUITES = $allFiles
  Write-Host "  configs and discovery OK"
}

# -- Self-check: Python detection returns valid command or honestly flags unavailable --
Run-Step "SELF: python detection" {
  $detected = $null
  foreach ($candidate in @("python3", "python")) {
    $cmd = Get-Command $candidate -ErrorAction SilentlyContinue
    if ($null -ne $cmd) {
      $null = & $candidate --version 2>&1
      if ($LASTEXITCODE -eq 0) { $detected = $candidate; break }
    }
  }
  if ($null -eq $detected) {
    Write-Host "  no working python/python3 found (honest)" -ForegroundColor Yellow
  } else {
    Write-Host ("  working Python: {0}" -f $detected) -ForegroundColor Green
  }
}

# -- Build ------------------------------------------------------------------------
if (-not $SkipBuild) {
  Run-Step "BUILD" {
    npm run build 2>&1
  }
} else {
  Write-Host "[BUILD] skipped" -ForegroundColor Yellow
}

# -- TypeScript type check ---------------------------------------------------------
Run-Step "CHECK: typecheck workspaces" {
  npm run check 2>&1
}

# -- .agent protocol ----------------------------------------------------------------
Run-Step "CHECK: .agent protocol" {
  node automation/validate-agent-dir.mjs 2>&1
}

# -- Python static checks -----------------------------------------------------------
if (-not $SkipPython) {
  $pyScripts = @(
    @{ path = "automation/check-internal-links.py";      label = "md-link-check" },
    @{ path = "scripts/verify-pinned-reqs.py";           label = "pinned-reqs" },
    @{ path = "automation/test-model-policy.py";         label = "model-policy" },
    @{ path = "automation/test-artifact-schemas.py";     label = "artifact-schemas" },
    @{ path = "automation/test-platform-contracts.py";   label = "platform-contracts" },
    @{ path = "automation/test-cross-language-manifests.py"; label = "cross-lang-manifests" },
    @{ path = "automation/test-platform-lifecycle.py";    label = "platform-lifecycle" },
    @{ path = "evals/conformance/routing.py";            label = "conformance-routing" },
    # Parity with run-python-tests.py — deterministic, no generated/ or build deps
    @{ path = "automation/test-installer-trust-boundary.py"; label = "installer-trust-boundary" },
    @{ path = "automation/test-installer-staging.py";     label = "installer-staging" },
    @{ path = "automation/validate-skill-catalog.py";     label = "skill-ownership-catalog" },
    @{ path = "automation/validate-skill-fabric.py";       label = "candidate-skill-fabric" },
    @{ path = "automation/validate-route-parity.py";       label = "typed-route-parity" },
    @{ path = "automation/test-select-verification.py";    label = "select-verification" },
    @{ path = "automation/test-parity-verification.py";    label = "parity-verification" }
  )

  $pythonCmd = $null
  # Try python3 then python; verify runtime works (broken shim returns 9009)
  foreach ($candidate in @("python3", "python")) {
    $cmd = Get-Command $candidate -ErrorAction SilentlyContinue
    if ($null -ne $cmd) {
      # ponytail: stderr may vary; accept any zero-exit --version output
      $null = & $candidate --version 2>&1
      if ($LASTEXITCODE -eq 0) { $pythonCmd = $candidate; break }
      Write-Host ("  [PYTHON] {0} found but non-functional (exit {1}) - skipping" -f $candidate, $LASTEXITCODE) -ForegroundColor Yellow
    }
  }

  if ($null -eq $pythonCmd) {
    Write-Host "[PYTHON] python/python3 unavailable - marking suite non-PASS" -ForegroundColor Red
    $script:FAILED = $true
  } else {
    foreach ($item in $pyScripts) {
      $fullPath = Join-Path $Root $item.path
      if (-not (Test-Path $fullPath)) {
        Write-Host ("  SKIP {0}: not found" -f $item.label) -ForegroundColor Yellow
        continue
      }
      $lbl = $item.label
      Run-Step ("CHECK: Python {0}" -f $lbl) {
        & $pythonCmd $fullPath 2>&1
      }
    }
  }
} else {
  Write-Host "[PYTHON] skipped" -ForegroundColor Yellow
}

# -- PowerShell static checks -------------------------------------------------------
if (-not $SkipPS1) {
  $pwScripts = @("validate-no-5fedu-leakage.ps1", "validate-tool-registry.ps1", "path-compat.ps1")
  foreach ($name in $pwScripts) {
    $fullPath = Join-Path (Join-Path $Root "automation") $name
    if (-not (Test-Path $fullPath)) {
      Write-Host ("  SKIP {0}: not found" -f $name) -ForegroundColor Yellow
      continue
    }
    $n = $name
    Run-Step ("CHECK: PS1 {0}" -f $n) {
      & $fullPath -Root $Root 2>&1
    }
  }
} else {
  Write-Host "[PS1] skipped" -ForegroundColor Yellow
}

# -- TypeScript test suites - serialized Vitest through governed launcher ----
# Remove stale report before running so stale data can't mask a missing run.
if (Test-Path $REPORT_FILE) { Remove-Item $REPORT_FILE -Force }

Run-Step "TEST: vitest serialized" {
  # Build the file list as positional args — vitest config already sets
  # maxWorkers=1, fileParallelism=false (single process, no parallelism).
  # The governed launcher enforces exclusive full-suite mode and one worker.
  $fileArgs = $script:DISCOVERED_SUITES | ForEach-Object { $_ }
  node automation/run-governed-vitest.mjs --project-root $Root --cwd $Root --mode full --timeout-ms 600000 -- run --config vitest.verify.config.ts $fileArgs 2>&1
}

# -- Parse Vitest JSON report + enforce suite contract -----------------------------
Run-Step "TEST: vitest report" {
  if (-not (Test-Path $REPORT_FILE)) {
    Write-Host "  FAIL: no report generated at $REPORT_FILE" -ForegroundColor Red
    throw "vitest-verify-report.json missing -- vitest may have crashed"
  }

  $jsonContent = Get-Content $REPORT_FILE -Raw -Encoding UTF8
  $report = $jsonContent | ConvertFrom-Json

  # Normalize vitest file paths to relative form matching discovery output.
  # Vitest v3 JSON reporter: .filePath may be empty when invoked with relative args;
  # .name holds the full path in that case. Prefer .filePath if populated.
  $reportedFiles = @($report.testResults | ForEach-Object {
    $raw = if ($_.filePath) { $_.filePath } else { $_.name }
    $raw.Replace($Root + '\', '').Replace('\', '/')
  })

  $discovered = $script:DISCOVERED_SUITES
  $discoveredSet = [System.Collections.Generic.HashSet[string]]::new([string[]]$discovered)
  $reportedSet   = [System.Collections.Generic.HashSet[string]]::new([string[]]$reportedFiles)

  $missing    = @($discovered    | Where-Object { -not $reportedSet.Contains($_) })
  $unreported = @($reportedFiles | Where-Object { -not $discoveredSet.Contains($_) })

  # Skipped suites: file has at least one test case with status "skipped".
  # Vitest v3 JSON reporter uses assertionResults[].status === 'skipped'.
  $skippedSuites = @()
  foreach ($result in $report.testResults) {
    $hasSkipped = $false
    foreach ($tc in $result.assertionResults) {
      if ($tc.status -eq "skipped") { $hasSkipped = $true; break }
    }
    if ($hasSkipped) {
      $raw = if ($result.filePath) { $result.filePath } else { $result.name }
      $skippedSuites += ($raw.Replace($Root + '\', '').Replace('\', '/'))
    }
  }

  # Machine-readable totals (console table)
  Write-Host ""
  Write-Host "=== VITEST TOTALS ===" -ForegroundColor Cyan
  Write-Host ("suites:         {0}" -f $report.testResults.Count)
  Write-Host ("tests:          {0}" -f $report.numTotalTests)
  Write-Host ("passed:         {0}" -f $report.numPassedTests)
  Write-Host ("failed:         {0}" -f $report.numFailedTests)
  Write-Host ("skipped:        {0}" -f $report.numPendingTests)
  Write-Host ("discovered:     {0}" -f $discovered.Count)
  Write-Host ("reported:       {0}" -f $reportedFiles.Count)
  Write-Host ("missing:        {0}" -f $missing.Count)
  Write-Host ("unreported:     {0}" -f $unreported.Count)
  Write-Host ("skipped-suites: {0}" -f $skippedSuites.Count)

  # Emit clean machine-readable summary (overwrites any stale file)
  $summary = @{
    suites        = $report.testResults.Count
    tests         = $report.numTotalTests
    passed        = $report.numPassedTests
    failed        = $report.numFailedTests
    skipped       = $report.numPendingTests
    discovered    = $discovered.Count
    reported      = $reportedFiles.Count
    missing       = $missing
    unreported    = $unreported
    skippedSuites = $skippedSuites
  }
  $summary | ConvertTo-Json -Compress | Set-Content -Path $REPORT_CLEAN -Encoding UTF8
  Write-Host ("machine-readable: {0}" -f $REPORT_CLEAN) -ForegroundColor Gray

  # Fail conditions
  $failReasons = @()
  if ($missing.Count -gt 0) {
    $failReasons += "missing suites (discovered but not reported):"
    foreach ($m in $missing) { $failReasons += "  MISSING: $m" }
  }
  if ($unreported.Count -gt 0) {
    $failReasons += "unreported suites (run but not discovered -- unexpected):"
    foreach ($u in $unreported) { $failReasons += "  UNREPORTED: $u" }
  }
  if ($skippedSuites.Count -gt 0) {
    $failReasons += "skipped suites detected:"
    foreach ($s in $skippedSuites) { $failReasons += "  SKIPPED: $s" }
  }
  if ($report.numFailedTests -gt 0) {
    $failReasons += "failing tests: $($report.numFailedTests)"
  }

  if ($failReasons.Count -gt 0) {
    Write-Host ""
    foreach ($r in $failReasons) { Write-Host ("  {0}" -f $r) -ForegroundColor Red }
    throw ("vitest report check failed: {0} issue(s)" -f $failReasons.Count)
  }
  Write-Host "  all suites reported, none skipped/failed"
}

# -- Workspace tests ----------------------------------------------------------------
Run-Step "TEST: workspaces" {
  npm run test --workspaces --if-present 2>&1
}

# -- Summary ------------------------------------------------------------------------
Write-Host ""
if ($script:FAILED) {
  Write-Host "verify:all FAILED" -ForegroundColor Red
  exit 1
} else {
  Write-Host "verify:all PASSED" -ForegroundColor Green
  exit 0
}
