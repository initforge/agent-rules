$ErrorActionPreference = "Stop"

$ROOT = Split-Path -Parent $PSScriptRoot
$ANT_AGENTS = Join-Path $ROOT "platforms\antigravity\.agents"
$LIVE_AGENTS = Join-Path $ROOT ".agents"

Write-Host "== Run Harness Sync (Windows) =="
Write-Host "Syncing from rules/skills/workflows to Antigravity and Live .agents..."

# 1. Ensure target directories exist
New-Item -ItemType Directory -Force -Path "$ANT_AGENTS\rules", "$ANT_AGENTS\skills", "$ANT_AGENTS\workflows" | Out-Null
New-Item -ItemType Directory -Force -Path "$LIVE_AGENTS\rules", "$LIVE_AGENTS\skills", "$LIVE_AGENTS\workflows" | Out-Null

# 2. Sync rules (excluding codex-specific rules)
Write-Host "Syncing rules..."
Get-ChildItem -Path "$ANT_AGENTS\rules" -File | ForEach-Object {
    if ($_.Name -ne "antigravity-overlay.md") {
        Remove-Item -Force -LiteralPath $_.FullName
    }
}
$skipRules = @("00-codex-runtime-intent.md", "default.rules")
Get-ChildItem -Path "$ROOT\rules" -File -Filter "*.md" | ForEach-Object {
    if ($skipRules -contains $_.Name) { return }
    Copy-Item -LiteralPath $_.FullName -Destination "$ANT_AGENTS\rules\$($_.Name)" -Force
}

# 3. Refresh YAML frontmatter
$fmScript = "$ROOT\platforms\antigravity\scripts\add-rules-frontmatter.ps1"
if (Test-Path $fmScript) {
    Write-Host "Refreshing rules frontmatter..."
    & $fmScript -RulesDir "$ANT_AGENTS\rules"
}

# 4. Sync skills (excluding _archive)
Write-Host "Syncing skills..."
if (Test-Path "$ANT_AGENTS\skills") {
    Remove-Item -Recurse -Force -LiteralPath "$ANT_AGENTS\skills"
    New-Item -ItemType Directory -Force -Path "$ANT_AGENTS\skills" | Out-Null
}
Get-ChildItem -Path "$ROOT\skills" -Directory | ForEach-Object {
    if ($_.Name -eq "_archive") { return }
    Copy-Item -LiteralPath $_.FullName -Destination "$ANT_AGENTS\skills\$($_.Name)" -Recurse -Force
}

# 5. Sync workflows
Write-Host "Syncing workflows..."
if (Test-Path "$ANT_AGENTS\workflows") {
    Remove-Item -Recurse -Force -LiteralPath "$ANT_AGENTS\workflows"
    New-Item -ItemType Directory -Force -Path "$ANT_AGENTS\workflows" | Out-Null
}
if (Test-Path "$ROOT\workflows") {
    Get-ChildItem -Path "$ROOT\workflows" -File -Filter "*.md" | ForEach-Object {
        Copy-Item -LiteralPath $_.FullName -Destination "$ANT_AGENTS\workflows\$($_.Name)" -Force
    }
}

# 6. Copy from Antigravity master to .agents live
Write-Host "Syncing to live .agents..."
if (Test-Path "$LIVE_AGENTS\rules") { Remove-Item -Recurse -Force -LiteralPath "$LIVE_AGENTS\rules" }
if (Test-Path "$LIVE_AGENTS\skills") { Remove-Item -Recurse -Force -LiteralPath "$LIVE_AGENTS\skills" }
if (Test-Path "$LIVE_AGENTS\workflows") { Remove-Item -Recurse -Force -LiteralPath "$LIVE_AGENTS\workflows" }

New-Item -ItemType Directory -Force -Path "$LIVE_AGENTS\rules", "$LIVE_AGENTS\skills", "$LIVE_AGENTS\workflows" | Out-Null

Copy-Item -LiteralPath "$ANT_AGENTS\rules" -Destination "$LIVE_AGENTS" -Recurse -Force
Copy-Item -LiteralPath "$ANT_AGENTS\skills" -Destination "$LIVE_AGENTS" -Recurse -Force
Copy-Item -LiteralPath "$ANT_AGENTS\workflows" -Destination "$LIVE_AGENTS" -Recurse -Force

$entryFiles = @("AGENTS.md", "INTENT.md", "README.md")
foreach ($f in $entryFiles) {
    $srcFile = Join-Path $ANT_AGENTS $f
    if (Test-Path $srcFile) {
        Copy-Item -LiteralPath $srcFile -Destination (Join-Path $LIVE_AGENTS $f) -Force
    }
}

Write-Host "Harness sync completed."
Write-Host ""

# 7. Install global runtimes
Write-Host "== Installing Global Runtimes =="
& (Join-Path $PSScriptRoot "install-codex-global.ps1")
Write-Host ""
& (Join-Path $PSScriptRoot "install-grok-global.ps1")
Write-Host ""
& (Join-Path $ROOT "platforms\antigravity\scripts\install-antigravity-global.ps1")
Write-Host ""

Write-Host "ALL GLOBAL HARNESS INSTALLATION COMPLETED."
