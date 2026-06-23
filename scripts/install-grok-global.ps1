# Cài harness global Grok CLI từ codex master (mirror — không grok/ riêng)
$ErrorActionPreference = "Stop"

$Root = Split-Path $PSScriptRoot -Parent
$GrokHome = if ($env:GROK_HOME) { $env:GROK_HOME } else { Join-Path $env:USERPROFILE ".grok" }
$RulesDest = Join-Path $GrokHome ".grok\rules"
$SkillsDest = Join-Path $GrokHome "skills"

# Skip bash sync on Windows to prevent WSL relay errors
# Harness sync is already done by the caller script

New-Item -ItemType Directory -Force -Path $RulesDest, $SkillsDest | Out-Null

# Clean up destination before copy to prevent stale files
if (Test-Path $RulesDest) { Remove-Item -Recurse -Force -LiteralPath $RulesDest; New-Item -ItemType Directory -Force -Path $RulesDest | Out-Null }
if (Test-Path $SkillsDest) { Remove-Item -Recurse -Force -LiteralPath $SkillsDest; New-Item -ItemType Directory -Force -Path $SkillsDest | Out-Null }

Copy-Item -Path (Join-Path $Root "rules\*") -Destination $RulesDest -Recurse -Force
Copy-Item -Path (Join-Path $Root "skills\*") -Destination $SkillsDest -Recurse -Force

$overlaySrc = Join-Path $Root "platforms\grok\rules\grok-overlay.md"
if (Test-Path $overlaySrc) {
    Copy-Item -LiteralPath $overlaySrc -Destination (Join-Path $RulesDest "grok-overlay.md") -Force
}

$RuleCount = (Get-ChildItem $RulesDest -Filter "*.md").Count
$SkillCount = (Get-ChildItem $SkillsDest -Recurse -Filter "SKILL.md").Count

Write-Host "Installed global Grok mirror (from codex master):"
Write-Host "  rules:  $RulesDest ($RuleCount files)"
Write-Host "  skills: $SkillsDest ($SkillCount skills)"
Write-Host ""
Write-Host "Next: NEW Grok session -> grok inspect"