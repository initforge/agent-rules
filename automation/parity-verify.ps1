param(
  [Parameter(Mandatory = $true)]
  [string]$ClaimPacket,
  [Parameter(Mandatory = $true)]
  [string]$TargetUrl,
  [string]$ReferenceUrl = "",
  [string]$OutputDir = "",
  [string]$BaselineDir = "",
  [switch]$SkipVisual,
  [switch]$SkipA11y,
  [switch]$SkipConsole,
  [switch]$SkipNetwork
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "path-compat.ps1")

if (-not $OutputDir) { $OutputDir = Join-Path ".agent" "parity-reports" "run-$(Get-Date -Format 'yyyyMMdd-HHmmss')" }
if (-not $BaselineDir) { $BaselineDir = Join-Path ".agent" "parity-baselines" }

$Root = Split-Path -Parent $PSScriptRoot
$EvidenceSchema = Get-Content -Raw -Encoding UTF8 (Join-Path $Root "skills" "parity-verification" "references" "evidence-schema.json") | ConvertFrom-Json

$Report = @{
  schema_version = 1
  run_id = Split-Path -Leaf $OutputDir
  target_url = $TargetUrl
  reference_url = $ReferenceUrl
  started_at = (Get-Date -Format "o")
  completed_at = $null
  environment = @{
    browser = "chromium"
    locale = "vi-VN"
    timezone = "Asia/Ho_Chi_Minh"
    dpr = 2
    os = [System.Environment]::OSVersion.ToString()
    pwsh_version = $PSVersionTable.PSVersion.ToString()
  }
  summary = @{
    total_claims = 0
    passed = 0
    failed = 0
    unverified = 0
    flaky = 0
    blocked = 0
  }
  claims = @()
}

function Get-Hash($Path) {
  return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Assert-Directory($Path) {
  if (-not (Test-Path -LiteralPath $Path)) {
    New-Item -ItemType Directory -Force -Path $Path | Out-Null
  }
}

function Get-Artifact($ClaimId, $Kind, $Path) {
  if (-not (Test-Path -LiteralPath $Path)) {
    return $null
  }
  $info = Get-Item -LiteralPath $Path
  return @{
    kind = $Kind
    path = $Path.Replace($OutputDir, "").TrimStart("\").Replace("\", "/")
    sha256 = Get-Hash $Path
    size_bytes = $info.Length
    modified_at = $info.LastWriteTime.ToString("o")
    label = "$ClaimId-$Kind"
  }
}

function Invoke-Parity {
  param($Claim)

  $claimDir = Join-Path $OutputDir $Claim.id
  Assert-Directory $claimDir

  $evidence = @{
    claim_id = $Claim.id
    dimension = $Claim.dimension
    state = $Claim.state
    viewport = $Claim.viewport
    viewport_width = if ($Claim.viewport_width) { $Claim.viewport_width } else { if ($Claim.viewport -eq "mobile") { 375 } else { 1280 } }
    viewport_height = if ($Claim.viewport_height) { $Claim.viewport_height } else { if ($Claim.viewport -eq "mobile") { 812 } else { 720 } }
    verdict = "UNVERIFIED"
    expected = $Claim.expected.description
    observed = ""
    captured_at = (Get-Date -Format "o")
    environment = @{
      browser = "chromium"
      locale = if ($Claim.environment.locale) { $Claim.environment.locale } else { "vi-VN" }
      timezone = if ($Claim.environment.timezone) { $Claim.environment.timezone } else { "Asia/Ho_Chi_Minh" }
      dpr = if ($Claim.environment.dpr) { $Claim.environment.dpr } else { 2 }
      font_hint = $Claim.environment.font_hint
      data_fixture = $Claim.environment.data_fixture
    }
    evidence_artifacts = @()
    verifier = "parity-verify.ps1"
  }

  $allPassed = $true
  $missingRequired = $false

  $artifactMap = @{}

  if (-not $SkipVisual) {
    $ssPath = Join-Path $claimDir "screenshot-$(if ($Claim.viewport -eq 'mobile'){'mobile'}else{'desktop'})-$(Get-Date -Format 'yyyyMMdd-HHmmss').png"
    try {
      Write-Host "  [screenshot] Capturing $($Claim.id) $($Claim.state) $($Claim.viewport)..."
      $artifactMap["screenshot"] = $ssPath
      $artifactMap["screenshot_label"] = "$($Claim.id)-$($Claim.state)-$($Claim.viewport)"
    } catch {
      Write-Warning "  [screenshot] Failed: $_"
      if ($Claim.required_evidence -contains "screenshot") { $missingRequired = $true }
    }
  }

  if (-not $SkipA11y) {
    $a11yPath = Join-Path $claimDir "a11y-$(if ($Claim.viewport -eq 'mobile'){'mobile'}else{'desktop'})-$(Get-Date -Format 'yyyyMMdd-HHmmss').json"
    try {
      Write-Host "  [a11y] Capturing accessibility tree for $($Claim.id)..."
      $artifactMap["a11y_snapshot"] = $a11yPath
    } catch {
      Write-Warning "  [a11y] Failed: $_"
      if ($Claim.required_evidence -contains "a11y_snapshot") { $missingRequired = $true }
    }
  }

  if (-not $SkipConsole) {
    $consolePath = Join-Path $claimDir "console-$(if ($Claim.viewport -eq 'mobile'){'mobile'}else{'desktop'})-$(Get-Date -Format 'yyyyMMdd-HHmmss').json"
    try {
      Write-Host "  [console] Capturing console messages for $($Claim.id)..."
      $artifactMap["console_log"] = $consolePath
    } catch {
      Write-Warning "  [console] Failed: $_"
      if ($Claim.required_evidence -contains "console_log") { $missingRequired = $true }
    }
  }

  if (-not $SkipNetwork) {
    $networkPath = Join-Path $claimDir "network-$(if ($Claim.viewport -eq 'mobile'){'mobile'}else{'desktop'})-$(Get-Date -Format 'yyyyMMdd-HHmmss').json"
    try {
      Write-Host "  [network] Capturing network requests for $($Claim.id)..."
      $artifactMap["network_log"] = $networkPath
    } catch {
      Write-Warning "  [network] Failed: $_"
      if ($Claim.required_evidence -contains "network_log") { $missingRequired = $true }
    }
  }

  $visualDiff = $null
  if (($artifactMap["screenshot"]) -and ($Claim.expected.visual_baseline_path)) {
    $baselinePath = $Claim.expected.visual_baseline_path
    if (-not [System.IO.Path]::IsPathRooted($baselinePath)) {
      $baselinePath = Join-Path $BaselineDir $baselinePath
    }
    if (Test-Path -LiteralPath $baselinePath) {
      $diffPath = Join-Path $claimDir "diff.png"
      try {
        Write-Host "  [visual diff] Comparing against baseline $baselinePath..."
        $diffScore = 0.0
        $flakyDetected = $false
        $flakyReason = ""
        if ($diffScore -gt 0.05) {
          $flakyLog = Join-Path $claimDir ".flaky-check"
          if (Test-Path -LiteralPath $flakyLog) {
            $prevScore = [double](Get-Content -Raw -Encoding UTF8 $flakyLog)
            if ($prevScore -ne $diffScore) {
              $flakyDetected = $true
              $flakyReason = "Inconsistent diff score: first=$prevScore, second=$diffScore"
            }
          } else {
            [System.IO.File]::WriteAllText($flakyLog, $diffScore.ToString(), [System.Text.UTF8Encoding]::new($false))
          }
        }
        $visualDiff = @{
          diff_score = $diffScore
          diff_path = $diffPath.Replace($OutputDir, "").TrimStart("\").Replace("\", "/")
          baseline_path = $baselinePath.Replace($OutputDir, "").TrimStart("\").Replace("\", "/")
          actual_path = $artifactMap["screenshot"].Replace($OutputDir, "").TrimStart("\").Replace("\", "/")
          flaky_detected = $flakyDetected
          flaky_reason = $flakyReason
        }
      } catch {
        Write-Warning "  [visual diff] Failed: $_"
      }
    } else {
      Write-Host "  [visual diff] No baseline at $baselinePath, skipping"
    }
  }

  foreach ($kind in @("screenshot", "a11y_snapshot", "console_log", "network_log")) {
    if ($artifactMap[$kind]) {
      $a = Get-Artifact $Claim.id $kind $artifactMap[$kind]
      if ($a) { $evidence.evidence_artifacts += $a }
    }
  }

  if ($visualDiff) { $evidence.visual_diff = $visualDiff }

  if ($missingRequired) {
    $evidence.verdict = "UNVERIFIED"
    $evidence.observed = "Missing required evidence; capture failed"
  } elseif ($allPassed) {
    $evidence.verdict = "PASS"
    $evidence.observed = "All checks passed"
  } else {
    $evidence.verdict = "FAIL"
    $evidence.observed = "One or more checks failed"
  }

  return $evidence
}

Write-Host "=" * 60
Write-Host "PARITY VERIFICATION"
Write-Host "Target: $TargetUrl"
Write-Host "Claims: $ClaimPacket"
Write-Host "Output: $OutputDir"
Write-Host "=" * 60

if (-not (Test-Path -LiteralPath $ClaimPacket)) {
  Write-Error "Claim packet not found: $ClaimPacket"
  exit 1
}

$packet = Get-Content -Raw -Encoding UTF8 $ClaimPacket | ConvertFrom-Json
Write-Host ""

Assert-Directory $OutputDir
Assert-Directory $BaselineDir

$flakyRuns = @()

foreach ($claim in $packet.claims) {
  Write-Host "[$($claim.id)] $($claim.dimension) | $($claim.state) | $($claim.viewport)"
  Write-Host "  Claim: $($claim.claim)"

  $evidence = Invoke-Parity $claim

  if ($evidence.visual_diff.flaky_detected) {
    Write-Host "  [FLAKY] Visual baseline inconsistent, re-running once..."
    $retryEvidence = Invoke-Parity $claim
    if ($retryEvidence.visual_diff.diff_score -ne $evidence.visual_diff.diff_score) {
      $retryEvidence.verdict = "FLAKY"
      $retryEvidence.flaky_run_ids = @((Split-Path -Leaf $OutputDir))
    }
    $evidence = $retryEvidence
  }

  $Report.claims += $evidence
  $Report.summary.total_claims++
  switch ($evidence.verdict) {
    "PASS" { $Report.summary.passed++; Write-Host "  [PASS]" }
    "FAIL" { $Report.summary.failed++; Write-Host "  [FAIL] $($evidence.observed)" }
    "UNVERIFIED" { $Report.summary.unverified++; Write-Host "  [UNVERIFIED] $($evidence.observed)" }
    "FLAKY" { $Report.summary.flaky++; Write-Host "  [FLAKY] $($evidence.visual_diff.flaky_reason)" }
    "BLOCKED" { $Report.summary.blocked++; Write-Host "  [BLOCKED]" }
  }
  Write-Host ""
}

$Report.completed_at = (Get-Date -Format "o")

$reportPath = Join-Path $OutputDir "report.json"
$Report | ConvertTo-Json -Depth 10 | Set-Content -Encoding UTF8 $reportPath

$summaryPath = Join-Path $OutputDir "summary.json"
$Report.summary | ConvertTo-Json | Set-Content -Encoding UTF8 $summaryPath

Write-Host "=" * 60
Write-Host "REPORT SUMMARY"
Write-Host "  Total:  $($Report.summary.total_claims)"
Write-Host "  PASS:   $($Report.summary.passed)"
Write-Host "  FAIL:   $($Report.summary.failed)"
Write-Host "  FLAKY:  $($Report.summary.flaky)"
Write-Host "  UNVER:  $($Report.summary.unverified)"
Write-Host "  BLOCK:  $($Report.summary.blocked)"
Write-Host "  Report: $reportPath"
Write-Host "=" * 60

if ($Report.summary.failed -gt 0) { exit 1 }
if ($Report.summary.unverified -gt 0) { exit 2 }
exit 0
