$ErrorActionPreference = "Stop"

$required = @(
  ".agents\AGENTS.md",
  ".agents\INTENT.md",
  ".agents\README.md",
  ".agents\rules\00-hard-activation-contract.md",
  ".agents\rules\00-antigravity-runtime-intent.md",
  ".agents\rules\01-intent-contract.md",
  ".agents\rules\10-fast-context.md",
  ".agents\rules\prompt-intent-router.md",
  ".agents\rules\quality-gates.md",
  ".agents\rules\technical-debt-control.md",
  ".agents\rules\clean-code.md",
  ".agents\workflows\5fedu-project.md",
  ".agents\workflows\codex-research.md",
  ".agents\workflows\runtime-sync-audit.md"
)

$missing = @()
foreach ($item in $required) {
  if (-not (Test-Path -LiteralPath $item)) {
    $missing += $item
  }
}

if ($missing.Count -gt 0) {
  $message = "Antigravity hard activation missing: " + ($missing -join ", ") + ". Do not proceed as PASS until these guard files are restored."
  [pscustomobject]@{
    injectSteps = @(
      @{
        ephemeralMessage = $message
      }
    )
  } | ConvertTo-Json -Depth 5
  exit 0
}

$message = "Antigravity hard activation ready. Read .agents/INTENT.md, .agents/AGENTS.md and .agents/rules/00-hard-activation-contract.md first. Final must include Status: PASS/PARTIAL/BLOCKED. For 5fedu: mapping first; template/golden reference before UI edits; production verify after context/domain gates; include Technical debt check. These guard files are protected runtime context, not cleanup artifacts."

[pscustomobject]@{
  injectSteps = @(
    @{
      ephemeralMessage = $message
    }
  )
} | ConvertTo-Json -Depth 5
