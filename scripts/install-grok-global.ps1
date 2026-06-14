# Cài harness global Grok CLI từ codex master (mirror — không grok/ riêng)
$ErrorActionPreference = "Stop"

$Root = Split-Path $PSScriptRoot -Parent
$GrokHome = if ($env:GROK_HOME) { $env:GROK_HOME } else { Join-Path $env:USERPROFILE ".grok" }
$RulesDest = Join-Path $GrokHome ".grok\rules"
$SkillsDest = Join-Path $GrokHome "skills"

$SyncSh = Join-Path $Root "scripts\sync-all-harness.sh"
if (Get-Command bash -ErrorAction SilentlyContinue) {
    & bash $SyncSh | Out-Null
}

New-Item -ItemType Directory -Force -Path $RulesDest, $SkillsDest | Out-Null
Copy-Item -Path (Join-Path $Root "codex\rules\*") -Destination $RulesDest -Recurse -Force
Copy-Item -Path (Join-Path $Root "codex\skills\*") -Destination $SkillsDest -Recurse -Force

$RuleCount = (Get-ChildItem $RulesDest -Filter "*.md").Count
$SkillCount = (Get-ChildItem $SkillsDest -Recurse -Filter "SKILL.md").Count

Write-Host "Installed global Grok mirror (from codex master):"
Write-Host "  rules:  $RulesDest ($RuleCount files)"
Write-Host "  skills: $SkillsDest ($SkillCount skills)"
Write-Host ""
Write-Host "Next: NEW Grok session -> grok inspect"