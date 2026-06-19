$ErrorActionPreference = "Stop"

$ROOT = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))
$ANT_GLOBAL_DIR = Join-Path $env:USERPROFILE ".gemini\config"
$GEMINI_GLOBAL = Join-Path $env:USERPROFILE ".gemini\GEMINI.md"

Write-Host "== Installing Antigravity Global Customizations (Windows) =="
Write-Host "Global config dir: $ANT_GLOBAL_DIR"
Write-Host "Global GEMINI.md:  $GEMINI_GLOBAL"
Write-Host ""

# 1. Ensure target directories exist
New-Item -ItemType Directory -Force -Path "$ANT_GLOBAL_DIR\rules" | Out-Null
New-Item -ItemType Directory -Force -Path "$ANT_GLOBAL_DIR\skills" | Out-Null
New-Item -ItemType Directory -Force -Path "$ANT_GLOBAL_DIR\workflows" | Out-Null

# 2. Sync rules (excluding codex-overlay.md and codex-specific rules)
Write-Host "Syncing rules to global..."
Get-ChildItem -Path "$ANT_GLOBAL_DIR\rules" -File | ForEach-Object {
    if ($_.Name -ne "antigravity-overlay.md") {
        Remove-Item -Force -LiteralPath $_.FullName
    }
}

$skipRules = @("00-codex-runtime-intent.md", "default.rules")
Get-ChildItem -Path "$ROOT\rules" -File -Filter "*.md" | ForEach-Object {
    if ($skipRules -contains $_.Name) { return }
    Copy-Item -LiteralPath $_.FullName -Destination "$ANT_GLOBAL_DIR\rules\$($_.Name)" -Force
}

# Copy antigravity-overlay.md specifically
$overlaySrc = "$ROOT\platforms\antigravity\.agents\rules\antigravity-overlay.md"
if (Test-Path $overlaySrc) {
    Copy-Item -LiteralPath $overlaySrc -Destination "$ANT_GLOBAL_DIR\rules\antigravity-overlay.md" -Force
    Write-Host "  [OK] Synced antigravity-overlay.md"
}

# 3. Refresh YAML frontmatter for global rules
$fmScript = "$ROOT\platforms\antigravity\scripts\add-rules-frontmatter.ps1"
if (Test-Path $fmScript) {
    Write-Host "Refreshing frontmatter for global rules..."
    & $fmScript -RulesDir "$ANT_GLOBAL_DIR\rules"
}

# 4. Sync skills (excluding _archive)
Write-Host "Syncing skills to global..."
if (Test-Path "$ANT_GLOBAL_DIR\skills") {
    Remove-Item -Recurse -Force -LiteralPath "$ANT_GLOBAL_DIR\skills"
    New-Item -ItemType Directory -Force -Path "$ANT_GLOBAL_DIR\skills" | Out-Null
}
Get-ChildItem -Path "$ROOT\skills" -Directory | ForEach-Object {
    if ($_.Name -eq "_archive") { return }
    Copy-Item -LiteralPath $_.FullName -Destination "$ANT_GLOBAL_DIR\skills\$($_.Name)" -Recurse -Force
}

# 5. Sync workflows to global
Write-Host "Syncing workflows to global..."
if (Test-Path "$ANT_GLOBAL_DIR\workflows") {
    Remove-Item -Recurse -Force -LiteralPath "$ANT_GLOBAL_DIR\workflows"
    New-Item -ItemType Directory -Force -Path "$ANT_GLOBAL_DIR\workflows" | Out-Null
}
if (Test-Path "$ROOT\workflows") {
    Get-ChildItem -Path "$ROOT\workflows" -File -Filter "*.md" | ForEach-Object {
        Copy-Item -LiteralPath $_.FullName -Destination "$ANT_GLOBAL_DIR\workflows\$($_.Name)" -Force
    }
}

# 6. Ensure global GEMINI.md setup
Write-Host "Installing global GEMINI.md..."
$geminiSrc = "$ROOT\platforms\antigravity\GEMINI.md"
if (Test-Path $geminiSrc) {
    Copy-Item -LiteralPath $geminiSrc -Destination $GEMINI_GLOBAL -Force
    Write-Host "  [OK] Copied GEMINI.md master to $GEMINI_GLOBAL"
} else {
    Write-Host "  [WARN] GEMINI.md master not found at $geminiSrc"
}

Write-Host ""
Write-Host "Antigravity global installation complete."
Write-Host "=========================================="
