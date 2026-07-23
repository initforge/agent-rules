[CmdletBinding()]
param([string]$Root = "")
$ErrorActionPreference = "Stop"
if (-not $Root) { $Root = Split-Path -Parent $PSScriptRoot }
. (Join-Path $PSScriptRoot "path-compat.ps1")
$planctl = Join-Path $Root "automation\planctl.ps1"
$valid = Join-Path $Root "automation\fixtures\plan-valid.md"
$invalid = Join-Path $Root "automation\fixtures\plan-invalid.md"
$lifecycle = Join-Path $Root "automation\fixtures\plan-lifecycle.md"

function Get-NormalizedHash {
  param([string]$Value)
  $normalized = (($Value -replace "\s+", " ").Trim())
  $bytes = [Text.Encoding]::UTF8.GetBytes($normalized)
  return (([Security.Cryptography.SHA256]::Create().ComputeHash($bytes) | ForEach-Object { $_.ToString("x2") }) -join "")
}

function Invoke-PlanctlResult {
  param([hashtable]$Arguments)
  $prior = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    $output = (& $planctl @Arguments *>&1 | Out-String)
    $code = $LASTEXITCODE
  } catch {
    $output = ($_ | Out-String)
    $code = 1
  }
  $ErrorActionPreference = $prior
  return [pscustomobject]@{ Code = $code; Output = $output }
}

function Assert-Fails {
  param([hashtable]$Arguments, [string]$Pattern)
  $result = Invoke-PlanctlResult $Arguments
  if ($result.Code -eq 0 -or ($Pattern -and $result.Output -notmatch $Pattern)) {
    throw "Expected planctl failure matching '$Pattern'; code=$($result.Code); output=$($result.Output)"
  }
}

& $planctl -Action validate -Root $Root -PlanPath $valid | Out-Host
if ($LASTEXITCODE -ne 0) { throw "Valid fixture unexpectedly failed" }

& $planctl -Action init -Root $Root -PlanPath $valid | Out-Host
if ($LASTEXITCODE -ne 0) { throw "Valid fixture state init unexpectedly failed" }
& $planctl -Action handoff -Root $Root -PlanPath $valid -Phase P1 | Out-Host
& $planctl -Action handoff -Root $Root -PlanPath $valid -HandoffMode executor | Out-Host
if ($LASTEXITCODE -ne 0) { throw "Handoff generation unexpectedly failed" }
& $planctl -Action report -Root $Root -PlanPath $valid | Out-Host
if ($LASTEXITCODE -ne 0) { throw "Report generation unexpectedly failed" }
$fixtureState = Join-Path $Root ".agent\plans\fixture-valid-20260718"
if (-not (Test-Path (Join-Path $fixtureState "EXECUTOR-HANDOFF.md"))) { throw "Executor handoff was not generated" }
if ((Get-Content (Join-Path $fixtureState "EXECUTOR-HANDOFF.md") -Raw) -notmatch "Role: executor") { throw "Executor handoff role is missing" }
$fixtureReport = Join-Path $fixtureState "REPORT.md"
if (-not (Test-Path $fixtureReport) -or (Get-Content -Raw -Encoding UTF8 $fixtureReport) -match "<mark>") { throw "Plain report renderer regression" }
& $planctl -Action validate -Root $Root -PlanPath $invalid -Quiet | Out-Null
if ($LASTEXITCODE -eq 0) { throw "Invalid fixture unexpectedly passed" }

$tmpLedger = Join-Path $Root ".agent\test-ledger-planctl.md"
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $tmpLedger) | Out-Null
[IO.File]::WriteAllText($tmpLedger, @"
Slice ID: fixture
Scope IN: [automation]
Scope OUT: [runtime]

- [x] AC1 fixture proof
  verify: pwsh -NoProfile -Command "Write-Output PASS"
  evidence: PASS
"@, [Text.Encoding]::UTF8)
& (Join-Path $Root "automation\audit-slice-ledger.ps1") -Root $Root -LedgerPath $tmpLedger -Strict | Out-Host
if ($LASTEXITCODE -ne 0) { throw "Valid ledger unexpectedly failed" }
Remove-Item -LiteralPath $tmpLedger -Force
if (Test-Path $fixtureState) { Remove-Item -LiteralPath $fixtureState -Recurse -Force }

$lifecycleRoot = Join-Path $Root ".agent\planctl-lifecycle-tests"
$lifecycleState = Join-Path $Root ".agent\plans\fixture-lifecycle-20260721"
if (Test-Path $lifecycleRoot) { Remove-Item -LiteralPath $lifecycleRoot -Recurse -Force }
if (Test-Path $lifecycleState) { Remove-Item -LiteralPath $lifecycleState -Recurse -Force }
New-Item -ItemType Directory -Force -Path $lifecycleRoot | Out-Null
$admissionPath = Join-Path $lifecycleRoot "admission.json"
$sourceTexts = @("Implement phase one", "Implement phase two", "Preserve runtime mirrors", "Deploy production runtime")
$sourceItems = for ($i = 0; $i -lt $sourceTexts.Count; $i++) {
  [pscustomobject]@{ id = "S{0:D3}" -f ($i + 1); ordinal = $i + 1; sha256 = Get-NormalizedHash $sourceTexts[$i] }
}
$admission = [ordered]@{
  version = 1; admission_id = "fixture-admission-20260721"; session_id = "fixture-session"
  prompt_hash = Get-NormalizedHash "fixture mega plan"; execution_mode = "continuous"; source_items = @($sourceItems)
  source_set_hash = Get-NormalizedHash (($sourceItems | ForEach-Object { "$($_.id):$($_.sha256)" }) -join "|")
}
[IO.File]::WriteAllText($admissionPath, ($admission | ConvertTo-Json -Depth 8), [Text.Encoding]::UTF8)

$lifecycleBody = Get-Content -Raw -Encoding UTF8 $lifecycle
foreach ($source in $sourceItems) {
  $sourceText = $sourceTexts[[int]$source.ordinal - 1]
  $lifecycleBody = $lifecycleBody.Replace("| $sourceText", "| @sha256:$($source.sha256)")
}
$legacyLifecycle = Join-Path $lifecycleRoot "lifecycle-v1.md"
[IO.File]::WriteAllText($legacyLifecycle, $lifecycleBody, [Text.Encoding]::UTF8)

# Admission-backed execution is strict PAF schema v2.  Keep an explicit
# legacy fixture to prove v1 cannot be initialized, then run the lifecycle
# against a proof-bearing v2 plan.
Assert-Fails @{ Action = "init"; Root = $Root; PlanPath = $legacyLifecycle; AdmissionPath = $admissionPath; ExecutionMode = "continuous" } "paf-schema-v2-required"
$strictBody = $lifecycleBody -replace '(?m)^plan_id:', "schema_version: 2`r`nplan_id:"
  $runtimeCheck = 'Get-Date | Out-Null'
$strictBody = $strictBody.Replace('pwsh -NoProfile -Command "Write-Output P1"', $runtimeCheck)
$strictBody = $strictBody.Replace('pwsh -NoProfile -Command "Write-Output P2"', $runtimeCheck)
$strictBody = $strictBody.Replace('| expected: P1', '| expected: exit=0').Replace('| expected: P2', '| expected: exit=0')
$proofBlock = "proof_profiles: [static-change]`r`nproof_map:`r`n  - AC1 -> static-change.outcome,static-change.regression | kind=unit-test | env=local`r`n"
$strictBody = $strictBody -replace '(?m)^(verify_gate:)', "$proofBlock`$1"
$hashLifecycle = Join-Path $lifecycleRoot "lifecycle-hash.md"
[IO.File]::WriteAllText($hashLifecycle, $strictBody, [Text.Encoding]::UTF8)

& $planctl -Action init -Root $Root -PlanPath $hashLifecycle -AdmissionPath $admissionPath -ExecutionMode continuous | Out-Host
if ($LASTEXITCODE -ne 0) { throw "Lifecycle init failed" }
$statePath = Join-Path $lifecycleState "state.json"
$state = Get-Content -Raw -Encoding UTF8 $statePath | ConvertFrom-Json
if ($state.execution_mode -ne "continuous" -or $state.admission_id -ne $admission.admission_id -or @($state.phases).Count -ne 2) {
  throw "Lifecycle state did not preserve admission/continuous phase shape"
}

Assert-Fails @{ Action = "complete"; Root = $Root; PlanPath = $hashLifecycle; Phase = "P1" } "IMPLEMENTED and batch VERIFIED"
Assert-Fails @{ Action = "start"; Root = $Root; PlanPath = $hashLifecycle; Phase = "P2" } "incomplete dependencies"
& $planctl -Action start -Root $Root -PlanPath $hashLifecycle -Phase P1 | Out-Host
if ($LASTEXITCODE -ne 0) { throw "P1 start failed" }
$env:PLANCTL_LEASE_ID = [string]((Get-Content -Raw -Encoding UTF8 $statePath | ConvertFrom-Json).lease_id)
$implementedP1 = Invoke-PlanctlResult @{ Action = "implemented"; Root = $Root; PlanPath = $hashLifecycle; Phase = "P1"; LeaseId = $env:PLANCTL_LEASE_ID }
if ($implementedP1.Code -ne 0 -or $implementedP1.Output -notmatch "IMPLEMENTED:.*P1.*\(1/2\)") { throw "P1 implementation transition failed: $($implementedP1.Output)" }

$badLedger = Join-Path $lifecycleRoot "P1-bad.md"
[IO.File]::WriteAllText($badLedger, @"
Slice ID: P1
Scope IN: [D1]
Scope OUT: [P2]

- [x] AC1 unrelated proof
  verify: pwsh -NoProfile -Command "Write-Output P1"
  evidence: P1
"@, [Text.Encoding]::UTF8)
Assert-Fails @{ Action = "complete"; Root = $Root; PlanPath = $hashLifecycle; Phase = "P1"; LedgerPath = $badLedger } "IMPLEMENTED and batch VERIFIED"

$p1Ledger = Join-Path $lifecycleRoot "P1.md"
[IO.File]::WriteAllText($p1Ledger, @"
Slice ID: P1
Scope IN: [D1]
Scope OUT: [P2]

- [x] AC1 phase one proof
  verify: pwsh -NoProfile -Command "Write-Output P1"
  evidence: P1
"@, [Text.Encoding]::UTF8)
Assert-Fails @{ Action = "complete"; Root = $Root; PlanPath = $hashLifecycle; Phase = "P1"; LedgerPath = $p1Ledger } "batch VERIFIED"

& $planctl -Action start -Root $Root -PlanPath $hashLifecycle -Phase P2 | Out-Host
if ($LASTEXITCODE -ne 0) { throw "P2 start failed" }
$env:PLANCTL_LEASE_ID = [string]((Get-Content -Raw -Encoding UTF8 $statePath | ConvertFrom-Json).lease_id)
$p2Ledger = Join-Path $lifecycleRoot "P2.md"
[IO.File]::WriteAllText($p2Ledger, @"
Slice ID: P2
Scope IN: [D2]
Scope OUT: []

- [x] AC1 phase two proof
  verify: pwsh -NoProfile -Command "Write-Output P2"
  evidence: P2
"@, [Text.Encoding]::UTF8)
$implementedP2 = Invoke-PlanctlResult @{ Action = "implemented"; Root = $Root; PlanPath = $hashLifecycle; Phase = "P2"; LeaseId = $env:PLANCTL_LEASE_ID }
if ($implementedP2.Code -ne 0 -or $implementedP2.Output -notmatch "IMPLEMENTED:.*P2.*\(2/2\)") { throw "P2 implementation transition failed: $($implementedP2.Output)" }
$batch = Invoke-PlanctlResult @{ Action = "verify-batch"; Root = $Root; PlanPath = $hashLifecycle }
if ($batch.Code -ne 0 -or $batch.Output -notmatch "BATCH_VERIFY_PASS: phases=2") { throw "Consolidated verification failed: $($batch.Output)" }
$p1Complete = Invoke-PlanctlResult @{ Action = "complete"; Root = $Root; PlanPath = $hashLifecycle; Phase = "P1"; LedgerPath = $p1Ledger }
if ($p1Complete.Code -ne 0 -or $p1Complete.Output -notmatch "PHASE_VERIFIED:.*\(1/2\)" -or $p1Complete.Output -match "(?m)^PASS:") { throw "P1 completion was not continuous-safe: $($p1Complete.Output)" }
$p2Complete = Invoke-PlanctlResult @{ Action = "complete"; Root = $Root; PlanPath = $hashLifecycle; Phase = "P2"; LedgerPath = $p2Ledger }
if ($p2Complete.Code -ne 0 -or $p2Complete.Output -notmatch "PHASE_VERIFIED:.*\(2/2\)") { throw "P2 completion failed: $($p2Complete.Output)" }
$final = Invoke-PlanctlResult @{ Action = "finalize"; Root = $Root; PlanPath = $hashLifecycle }
if ($final.Code -ne 0 -or $final.Output -notmatch "(?m)^PLAN_PASS:" -or $final.Output -match "(?m)^PASS:") {
  throw "Finalize did not emit strict PLAN_PASS: $($final.Output)"
}

$missingSourcePlan = Join-Path $lifecycleRoot "missing-source.md"
[IO.File]::WriteAllText($missingSourcePlan, ($lifecycleBody -replace "(?m)^- S004 ->.*\r?\n", ""), [Text.Encoding]::UTF8)
Assert-Fails @{ Action = "validate"; Root = $Root; PlanPath = $missingSourcePlan; AdmissionPath = $admissionPath } "uncovered-source-item"
$unmappedPlan = Join-Path $lifecycleRoot "unmapped-deliverable.md"
[IO.File]::WriteAllText($unmappedPlan, ($lifecycleBody -replace "scope_lock: \[D2\]", "scope_lock: [D1]"), [Text.Encoding]::UTF8)
Assert-Fails @{ Action = "validate"; Root = $Root; PlanPath = $unmappedPlan; AdmissionPath = $admissionPath } "unmapped-deliverable"
$unknownPlan = Join-Path $lifecycleRoot "unknown-deliverable.md"
[IO.File]::WriteAllText($unknownPlan, ($lifecycleBody -replace "scope_lock: \[D2\]", "scope_lock: [D9]"), [Text.Encoding]::UTF8)
Assert-Fails @{ Action = "validate"; Root = $Root; PlanPath = $unknownPlan; AdmissionPath = $admissionPath } "unknown-deliverable"

# Schema-v2 semantic proof rejects self-emitting success signals.
$v2Plan = Join-Path $lifecycleRoot "v2-tautology.md"
$v2Body = $lifecycleBody -replace '(?m)^plan_id:', "schema_version: 2`r`nplan_id:"
$v2Body = $v2Body -replace '(?m)^(verify_gate:\s*)', "proof_profiles: [static-change]`r`nproof_map:`r`n  - AC1 -> static-change.outcome,static-change.regression | kind=unit-test | env=local | manifest=true`r`n`$1"
[IO.File]::WriteAllText($v2Plan, $v2Body, [Text.Encoding]::UTF8)
Assert-Fails @{ Action = "validate"; Root = $Root; PlanPath = $v2Plan } "tautological-verify-command"

$revisedPlan = Join-Path $lifecycleRoot "revised.md"
[IO.File]::WriteAllText($revisedPlan, ($strictBody -replace "AC1 phase one proof", "AC1 revised phase one proof"), [Text.Encoding]::UTF8)
& $planctl -Action init -Root $Root -PlanPath $revisedPlan -AdmissionPath $admissionPath -ExecutionMode continuous | Out-Host
if ($LASTEXITCODE -ne 0) { throw "Revised lifecycle init failed" }
$revisedState = Get-Content -Raw -Encoding UTF8 $statePath | ConvertFrom-Json
if (@($revisedState.phases | Where-Object status -ne "PENDING").Count -ne 0 -or $revisedState.status -eq "DONE") {
  throw "Plan/phase revision reused stale completion"
}

Remove-Item -LiteralPath $lifecycleRoot -Recurse -Force
Remove-Item -LiteralPath $lifecycleState -Recurse -Force
Write-Host "PASS: planctl fixtures"
