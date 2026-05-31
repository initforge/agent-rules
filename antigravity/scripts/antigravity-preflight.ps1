$ErrorActionPreference = "Stop"

$required = @(
  ".agents\rules\00-codex-runtime-intent.md",
  ".agents\rules\01-intent-contract.md",
  ".agents\rules\10-fast-context.md",
  ".agents\workflows\5fedu-project.md",
  ".agents\workflows\codex-research.md",
  ".agents\workflows\runtime-sync-audit.md"
)

$missing = @()
foreach ($path in $required) {
  if (-not (Test-Path $path)) {
    $missing += $path
  }
}

if ($missing.Count -gt 0) {
  $message = "Antigravity adapter missing files: " + ($missing -join ", ")
  [pscustomobject]@{
    injectSteps = @(
      @{
        ephemeralMessage = $message
      }
    )
  } | ConvertTo-Json -Depth 5
  exit 0
}

[pscustomobject]@{
  injectSteps = @(
    @{
      ephemeralMessage = "Antigravity adapter ready. Use /5fedu-project, /codex-research, or /runtime-sync-audit when the request matches."
    }
  )
} | ConvertTo-Json -Depth 5
