$ErrorActionPreference = "Stop"
$ROOT = "p:\agent-rules"
$ANT_AGENTS = Join-Path $ROOT "platforms\antigravity\.agents"
$LIVE_AGENTS = Join-Path $ROOT ".agents"

# Create directories
New-Item -ItemType Directory -Force -Path (Join-Path $ANT_AGENTS "rules") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $ANT_AGENTS "skills") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $ANT_AGENTS "workflows") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $LIVE_AGENTS "rules") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $LIVE_AGENTS "skills") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $LIVE_AGENTS "workflows") | Out-Null

# Clean target skills/rules before copy to avoid old files remaining
Remove-Item -Path (Join-Path $ANT_AGENTS "skills\*") -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path (Join-Path $LIVE_AGENTS "skills\*") -Recurse -Force -ErrorAction SilentlyContinue
Get-ChildItem -Path (Join-Path $ANT_AGENTS "rules\*") -Exclude "antigravity-overlay.md" | Remove-Item -Force -ErrorAction SilentlyContinue
Remove-Item -Path (Join-Path $LIVE_AGENTS "rules\*") -Force -ErrorAction SilentlyContinue

# Copy skills
Copy-Item -Path (Join-Path $ROOT "skills\*") -Destination (Join-Path $ANT_AGENTS "skills") -Recurse -Force
Copy-Item -Path (Join-Path $ROOT "skills\*") -Destination (Join-Path $LIVE_AGENTS "skills") -Recurse -Force

# Copy rules
Copy-Item -Path (Join-Path $ROOT "rules\*") -Destination (Join-Path $ANT_AGENTS "rules") -Force
Copy-Item -Path (Join-Path $ROOT "rules\*") -Destination (Join-Path $LIVE_AGENTS "rules") -Force

# Add frontmatter to Antigravity rules
$FM_SCRIPT = Join-Path $ROOT "platforms\antigravity\scripts\add-rules-frontmatter.ps1"
if (Test-Path $FM_SCRIPT) {
    & $FM_SCRIPT -RulesDir (Join-Path $ANT_AGENTS "rules")
}

# Sync workflows
Copy-Item -Path (Join-Path $ROOT "workflows\*") -Destination (Join-Path $ANT_AGENTS "workflows") -Force
Copy-Item -Path (Join-Path $ROOT "workflows\*") -Destination (Join-Path $LIVE_AGENTS "workflows") -Force

# Sync AGENTS.md, INTENT.md, README.md
foreach ($f in @("AGENTS.md", "INTENT.md", "README.md")) {
    $srcFile = Join-Path $ANT_AGENTS $f
    $dstFile = Join-Path $LIVE_AGENTS $f
    if (Test-Path $srcFile) {
        Copy-Item -Path $srcFile -Destination $dstFile -Force
    }
}

Write-Host "Local sync completed successfully!"
