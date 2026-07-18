[CmdletBinding()]
param([string]$Root = "")
$ErrorActionPreference = "Stop"
if (-not $Root) { $Root = Split-Path -Parent $PSScriptRoot }
. (Join-Path $PSScriptRoot "path-compat.ps1")
$planctl = Join-Path $Root "automation\planctl.ps1"
$valid = Join-Path $Root "automation\fixtures\plan-valid.md"
$invalid = Join-Path $Root "automation\fixtures\plan-invalid.md"

& $planctl -Action validate -Root $Root -PlanPath $valid | Out-Host
if ($LASTEXITCODE -ne 0) { throw "Valid fixture unexpectedly failed" }

& $planctl -Action init -Root $Root -PlanPath $valid | Out-Host
if ($LASTEXITCODE -ne 0) { throw "Valid fixture state init unexpectedly failed" }
& $planctl -Action handoff -Root $Root -PlanPath $valid -Phase P1 | Out-Host
if ($LASTEXITCODE -ne 0) { throw "Handoff generation unexpectedly failed" }
& $planctl -Action report -Root $Root -PlanPath $valid | Out-Host
if ($LASTEXITCODE -ne 0) { throw "Report generation unexpectedly failed" }
$fixtureState = Join-Path $Root ".agent\plans\fixture-valid-20260718"
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
Write-Host "PASS: planctl fixtures"
