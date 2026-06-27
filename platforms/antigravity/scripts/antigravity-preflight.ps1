$ErrorActionPreference = "Stop"

$required = @(
  ".agents\AGENTS.md",
  ".agents\INTENT.md",
  ".agents\README.md",
  ".agents\rules\00-runtime-and-intent.md",
  ".agents\rules\00-universal-frontier-contract.md",
  ".agents\rules\01-agent-workflow-sop.md",
  ".agents\rules\02-code-quality-and-debt.md",
  ".agents\rules\03-context-and-tools.md",
  ".agents\rules\04-skills-and-5fedu.md",
  ".agents\rules\05-harness-mutation-gate.md",
  ".agents\rules\06-opus-emulation-contract.md",
  ".agents\rules\07-finish-to-completion.md",
  ".agents\rules\antigravity-overlay.md",
  ".agents\rules\platform-boundary.md",
  ".agents\workflows\5fedu-project.md",
  ".agents\workflows\researcher.md",
  ".agents\workflows\runtime-sync-audit.md"
)

$missing = @()
foreach ($item in $required) {
  if (-not (Test-Path -LiteralPath $item)) {
    $missing += $item
  }
}

if ($missing.Count -gt 0) {
  $message = "Antigravity harness missing: " + ($missing -join ", ") + ". Run agent-rules/scripts/sync-all-harness.sh then retry."
  [pscustomobject]@{
    injectSteps = @(
      @{
        ephemeralMessage = $message
      }
    )
  } | ConvertTo-Json -Depth 5
  exit 0
}

$message = @"
Opus-emulation harness ready. Read .agents/INTENT.md, .agents/AGENTS.md, .agents/rules/00-runtime-and-intent.md, .agents/rules/06-opus-emulation-contract.md first.
Default tier: MEDIUM. Final MEDIUM/HIGH must include Intent detected, Context loaded, Verification, Technical debt check, Status PASS/PARTIAL/BLOCKED.
5fedu: mapping first; /template before UI; production verify after domain gates.
Protected runtime — not cleanup artifacts.
"@

[pscustomobject]@{
  injectSteps = @(
    @{
      ephemeralMessage = $message
    }
  )
} | ConvertTo-Json -Depth 5
