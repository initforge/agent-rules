[CmdletBinding()]
param([string]$Root = "")

$ErrorActionPreference = "Stop"
if (-not $Root) { $Root = Split-Path -Parent $PSScriptRoot }
$planctl = Join-Path $Root "automation\planctl.ps1"
$fixture = Join-Path $Root "automation\fixtures\plan-semantic-proof.md"
$work = Join-Path $Root ".agent\plan-proof-tests"
$state = Join-Path $Root ".agent\plans\fixture-semantic-proof-20260721"

function Invoke-Result {
  param([hashtable]$Arguments)
  $prior = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try { $output = (& $planctl @Arguments *>&1 | Out-String); $code = $LASTEXITCODE }
  catch { $output = ($_ | Out-String); $code = 1 }
  $ErrorActionPreference = $prior
  return [pscustomobject]@{ Code = $code; Output = $output }
}

function Assert-Fails {
  param([hashtable]$Arguments, [string]$Pattern)
  $result = Invoke-Result $Arguments
  if ($result.Code -eq 0 -or $result.Output -notmatch $Pattern) {
    throw "Expected failure '$Pattern'; code=$($result.Code); output=$($result.Output)"
  }
}

function Get-NormalizedHash {
  param([string]$Value)
  $bytes = [Text.Encoding]::UTF8.GetBytes((($Value -replace "\s+", " ").Trim()))
  return (([Security.Cryptography.SHA256]::Create().ComputeHash($bytes) | ForEach-Object { $_.ToString("x2") }) -join "")
}

if (Test-Path -LiteralPath $work) { Remove-Item -LiteralPath $work -Recurse -Force }
if (Test-Path -LiteralPath $state) { Remove-Item -LiteralPath $state -Recurse -Force }
New-Item -ItemType Directory -Path $work -Force | Out-Null

$body = [IO.File]::ReadAllText($fixture, [Text.Encoding]::UTF8)
$cases = @(
  @{ Name = "echo.md"; Body = $body.Replace('powershell -NoProfile -Command "if ((2 + 2) -ne 4) { exit 1 }"', 'powershell -NoProfile -Command "Write-Output PASS"'); Pattern = "tautological-verify-command" },
  @{ Name = "missing-dimension.md"; Body = $body.Replace('static-change.outcome, static-change.regression', 'static-change.outcome'); Pattern = "uncovered-proof-dimension" },
  @{ Name = "build-outcome.md"; Body = $body.Replace('kind=unit-test', 'kind=build'); Pattern = "build-as-outcome-proof" },
  @{ Name = "untyped.md"; Body = $body.Replace('expected: exit=0', 'expected: PASS'); Pattern = "untyped-expected-matcher" }
)
foreach ($case in $cases) {
  $path = Join-Path $work $case.Name
  [IO.File]::WriteAllText($path, $case.Body, [Text.Encoding]::UTF8)
  Assert-Fails @{ Action = "validate"; Root = $Root; PlanPath = $path } $case.Pattern
}

$duplicateHash = Get-NormalizedHash "same source requirement"
$sourceItems = @(
  [pscustomobject]@{ id = "S001"; ordinal = 1; sha256 = $duplicateHash },
  [pscustomobject]@{ id = "S002"; ordinal = 2; sha256 = $duplicateHash; duplicate_of = "S001" }
)
$admission = [ordered]@{
  version = 2; admission_id = "semantic-duplicate-admission"; session_id = "semantic-proof-test"; execution_mode = "continuous"
  source_items = $sourceItems
  source_set_hash = Get-NormalizedHash (($sourceItems | ForEach-Object { "$($_.id):$($_.sha256)" }) -join "|")
}
$admissionPath = Join-Path $work "duplicate-admission.json"
[IO.File]::WriteAllText($admissionPath, ($admission | ConvertTo-Json -Depth 8), [Text.Encoding]::UTF8)
$coverage = @"
## Source coverage

- S001 -> D1 | @sha256:$duplicateHash
- S002 -> DUPLICATE_OF(S001) | @sha256:$duplicateHash

"@
$duplicatePlan = Join-Path $work "duplicate-plan.md"
$duplicateBody = $body.Replace("## Context routing", $coverage + "## Context routing")
[IO.File]::WriteAllText($duplicatePlan, $duplicateBody, [Text.Encoding]::UTF8)
$duplicateValid = Invoke-Result @{ Action = "validate"; Root = $Root; PlanPath = $duplicatePlan; AdmissionPath = $admissionPath }
if ($duplicateValid.Code -ne 0) { throw "Explicit DUPLICATE_OF coverage failed: $($duplicateValid.Output)" }
$duplicateInvalid = Join-Path $work "duplicate-invalid.md"
[IO.File]::WriteAllText($duplicateInvalid, $duplicateBody.Replace("DUPLICATE_OF(S001)", "CONTEXT"), [Text.Encoding]::UTF8)
Assert-Fails @{ Action = "validate"; Root = $Root; PlanPath = $duplicateInvalid; AdmissionPath = $admissionPath } "duplicate-source"

$valid = Invoke-Result @{ Action = "validate"; Root = $Root; PlanPath = $fixture }
if ($valid.Code -ne 0) { throw "Semantic proof fixture failed validation: $($valid.Output)" }
$init = Invoke-Result @{ Action = "init"; Root = $Root; PlanPath = $fixture }
if ($init.Code -ne 0) { throw "Semantic proof fixture failed init: $($init.Output)" }
$start = Invoke-Result @{ Action = "start"; Root = $Root; PlanPath = $fixture; Phase = "P1" }
if ($start.Code -ne 0) { throw "Semantic proof fixture failed start: $($start.Output)" }
$leaseId = [string](Get-Content -Raw -Encoding UTF8 (Join-Path $state "state.json") | ConvertFrom-Json).lease_id
Assert-Fails @{ Action = "verify"; Root = $Root; PlanPath = $fixture; Phase = "P1"; LeaseId = $leaseId; AcId = "AC1"; Expected = "contains:PASS" } "does not match the phase contract"
$verify = Invoke-Result @{ Action = "verify"; Root = $Root; PlanPath = $fixture; Phase = "P1"; LeaseId = $leaseId; AcId = "AC1" }
if ($verify.Code -ne 0 -or $verify.Output -notmatch "VERIFY_PASS") { throw "Semantic receipt was not produced: $($verify.Output)" }

$receiptPath = Join-Path $state "receipts\P1\AC1.json"
$receipt = Get-Content -Raw -Encoding UTF8 -LiteralPath $receiptPath | ConvertFrom-Json
$receipt.command_hash = "0" * 64
[IO.File]::WriteAllText($receiptPath, ($receipt | ConvertTo-Json -Depth 12), [Text.Encoding]::UTF8)
$ledger = Join-Path $work "P1.md"
[IO.File]::WriteAllText($ledger, @"
Slice ID: P1
Scope IN: [D1]
Scope OUT: []

- [x] AC1 arithmetic assertion succeeds
  verify: powershell -NoProfile -Command "if ((2 + 2) -ne 4) { exit 1 }"
  evidence: receipt $receiptPath
"@, [Text.Encoding]::UTF8)
Assert-Fails @{ Action = "complete"; Root = $Root; PlanPath = $fixture; Phase = "P1"; LeaseId = $leaseId; LedgerPath = $ledger } "Missing verified receipt"

$verify = Invoke-Result @{ Action = "verify"; Root = $Root; PlanPath = $fixture; Phase = "P1"; LeaseId = $leaseId; AcId = "AC1" }
if ($verify.Code -ne 0) { throw "Fresh receipt regeneration failed: $($verify.Output)" }
$complete = Invoke-Result @{ Action = "complete"; Root = $Root; PlanPath = $fixture; Phase = "P1"; LeaseId = $leaseId; LedgerPath = $ledger }
if ($complete.Code -ne 0 -or $complete.Output -notmatch "SLICE_PASS") { throw "Semantic phase completion failed: $($complete.Output)" }
$final = Invoke-Result @{ Action = "finalize"; Root = $Root; PlanPath = $fixture }
if ($final.Code -ne 0 -or $final.Output -notmatch "PLAN_PASS") { throw "Semantic plan finalize failed: $($final.Output)" }

Remove-Item -LiteralPath $work -Recurse -Force
Remove-Item -LiteralPath $state -Recurse -Force
Write-Host "PASS: semantic proof profiles, anti-tautology and receipt integrity"
