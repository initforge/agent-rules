$ErrorActionPreference = "Stop"

$ROOT = Split-Path -Parent $PSScriptRoot
$CODEX_HOME = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $env:USERPROFILE ".codex" }
$RULES_DEST = Join-Path $CODEX_HOME "rules"
$SKILLS_DEST = Join-Path $CODEX_HOME "skills"
$SCRIPTS_DEST = Join-Path $CODEX_HOME "scripts"
$HOOKS_DEST = Join-Path $CODEX_HOME "hooks"

Write-Host "== Installing Codex Global Customizations (Windows) =="
Write-Host "Codex home: $CODEX_HOME"
Write-Host ""

# 1. Ensure target directories exist
New-Item -ItemType Directory -Force -Path $RULES_DEST | Out-Null
New-Item -ItemType Directory -Force -Path $SKILLS_DEST | Out-Null
New-Item -ItemType Directory -Force -Path $SCRIPTS_DEST | Out-Null
New-Item -ItemType Directory -Force -Path $HOOKS_DEST | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $CODEX_HOME "skill-state\e2e-cache") | Out-Null

# 2. Sync rules
Write-Host "Syncing rules to global Codex..."
Get-ChildItem -Path $RULES_DEST -File | ForEach-Object {
    Remove-Item -Force -LiteralPath $_.FullName
}
Get-ChildItem -Path "$ROOT\rules" -File -Filter "*.md" | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination "$RULES_DEST\$($_.Name)" -Force
}
$overlaySrc = "$ROOT\platforms\codex\rules\codex-overlay.md"
if (Test-Path $overlaySrc) {
    Copy-Item -LiteralPath $overlaySrc -Destination "$RULES_DEST\codex-overlay.md" -Force
    Write-Host "  [OK] Synced codex-overlay.md"
}

# 3. Sync skills (excluding _archive, .system, codex-research legacy)
Write-Host "Syncing skills to global Codex..."
if (Test-Path $SKILLS_DEST) {
    Remove-Item -Recurse -Force -LiteralPath $SKILLS_DEST
    New-Item -ItemType Directory -Force -Path $SKILLS_DEST | Out-Null
}
$skipSkills = @("_archive", ".system", "codex-research")
Get-ChildItem -Path "$ROOT\skills" -Directory | ForEach-Object {
    if ($skipSkills -contains $_.Name) { return }
    Copy-Item -LiteralPath $_.FullName -Destination "$SKILLS_DEST\$($_.Name)" -Recurse -Force
}

# 4. Copy scripts
Write-Host "Copying skill gate scripts..."
$gatePy = "$ROOT\scripts\grok-skill-gate.py"
$gateSh = "$ROOT\scripts\grok-skill-gate.sh"
if (Test-Path $gatePy) {
    Copy-Item -LiteralPath $gatePy -Destination "$SCRIPTS_DEST\skill-gate.py" -Force
}
if (Test-Path $gateSh) {
    Copy-Item -LiteralPath $gateSh -Destination "$SCRIPTS_DEST\skill-gate.sh" -Force
}

# 5. Process hook config
Write-Host "Processing hook configuration..."
$orchestratorSrc = "$ROOT\platforms\codex\hooks\skill-orchestrator.json"
if (Test-Path $orchestratorSrc) {
    $jsonContent = Get-Content -Raw -Path $orchestratorSrc
    $unixCodexHome = $CODEX_HOME.Replace("\", "/")
    $jsonContent = $jsonContent.Replace('${CODEX_HOME}', $unixCodexHome)
    Set-Content -Path "$HOOKS_DEST\skill-orchestrator.json" -Value $jsonContent -Force
    Write-Host "  [OK] Generated skill-orchestrator.json"
}

$RuleCount = (Get-ChildItem $RULES_DEST -Filter "*.md").Count
$SkillCount = (Get-ChildItem $SKILLS_DEST -Recurse -Filter "SKILL.md").Count

Write-Host ""
Write-Host "Codex global installation complete."
Write-Host "  rules:  $RULES_DEST ($RuleCount files)"
Write-Host "  skills: $SKILLS_DEST ($SkillCount skills)"
Write-Host "=========================================="
