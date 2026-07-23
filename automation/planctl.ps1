# Public entrypoint for planctl.
#
# Keep this file deliberately small: callers use this stable path while the
# implementation can be divided without changing every platform integration.
[CmdletBinding()]
param(
  [ValidateSet("validate", "compile", "admit", "adopt", "init", "status", "focus", "start", "implemented", "verify", "verify-batch", "evidence", "block", "recover", "complete", "finalize", "handoff", "revise", "gate", "report")]
  [string]$Action = "validate",
  [string]$Root = (Split-Path -Parent $PSScriptRoot),
  [string]$PlanPath = "",
  [string]$PlanId = "",
  [string]$AdmissionPath = "",
  [ValidateSet("", "continuous", "phase")][string]$ExecutionMode = "",
  [ValidateSet("", "implementation-first", "incremental")][string]$VerificationStrategy = "",
  [ValidateSet("", "phase", "executor")][string]$HandoffMode = "",
  [string]$SessionId = "",
  [string]$Phase = "",
  [string]$LeaseId = "",
  [string]$SliceId = "",
  [string]$LedgerPath = "",
  [string]$AcId = "",
  [string]$Evidence = "",
  [string]$Command = "",
  [string]$Expected = "",
  [string]$ReceiptPath = "",
  [string]$Reason = "",
  [string]$OutputPath = "",
  [switch]$Strict,
  [switch]$Quiet
)

$ErrorActionPreference = 'Stop'
$legacyEntrypoint = Join-Path $PSScriptRoot 'planctl.legacy.ps1'

if (-not (Test-Path -LiteralPath $legacyEntrypoint -PathType Leaf)) {
    throw "Missing planctl implementation: $legacyEntrypoint"
}

& $legacyEntrypoint @PSBoundParameters
exit $LASTEXITCODE
