param(
  [string]$RulesDir = (Join-Path (Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))) ".agents\rules")
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $RulesDir)) {
  throw "Rules directory not found: $RulesDir"
}

$active = @(
  "00-runtime-and-intent.md",
  "01-agent-workflow-sop.md",
  "02-code-quality-and-debt.md",
  "03-context-and-tools.md",
  "04-skills-and-5fedu.md",
  "05-harness-mutation-gate.md",
  "06-opus-emulation-contract.md",
  "antigravity-overlay.md",
  "platform-boundary.md"
)

$legacy = @(
  "00-hard-activation-contract.md",
  "00-antigravity-runtime-intent.md",
  "01-intent-contract.md",
  "10-fast-context.md",
  "prompt-intent-router.md",
  "quality-gates.md",
  "core.md",
  "planning.md",
  "execution.md",
  "clean-code.md",
  "technical-debt-control.md",
  "codex-overlay.md"
)

foreach ($name in $legacy) {
  $path = Join-Path $RulesDir $name
  if (Test-Path -LiteralPath $path) {
    Remove-Item -LiteralPath $path -Force
    Write-Host "Removed legacy: $name"
  }
}

foreach ($name in $active) {
  $path = Join-Path $RulesDir $name
  if (-not (Test-Path -LiteralPath $path)) {
    Write-Warning "Missing active rule: $name (run grok/scripts/sync-all-harness.sh)"
    continue
  }

  $content = Get-Content -LiteralPath $path -Raw -Encoding UTF8
  if ($content -match '(?ms)^---\s*\r?\n.*?alwaysApply:\s*true') {
    Write-Host "OK (already alwaysApply): $name"
    continue
  }

  if ($content.StartsWith("---")) {
    $content = [regex]::new('(?ms)^---\s*\r?\n').Replace($content, "---`nalwaysApply: true`n", 1)
  } else {
    $content = "---`nalwaysApply: true`n---`n`n" + $content
  }

  Set-Content -LiteralPath $path -Value $content -Encoding UTF8 -NoNewline
  Write-Host "Patched alwaysApply: $name"
}

Write-Host "Frontmatter pass complete for $RulesDir"