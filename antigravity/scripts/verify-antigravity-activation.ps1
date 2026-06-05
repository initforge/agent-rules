<#
.SYNOPSIS
    Verify toàn bộ Antigravity activation architecture hoạt động đúng.
#>
$ErrorActionPreference = "Stop"

$problems = New-Object System.Collections.Generic.List[string]

function Check-Exists([string]$Path, [string]$Label) {
    if (-not (Test-Path -LiteralPath $Path)) {
        $problems.Add("MISSING: $Label ($Path)")
        return $false
    }
    return $true
}

function Check-Frontmatter([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path)) { return }
    $content = Get-Content -LiteralPath $Path -Raw -Encoding UTF8
    if (-not $content.StartsWith("---")) {
        $problems.Add("NO FRONTMATTER: $Path")
    }
}

Write-Host "== Verify Antigravity Activation Architecture =="
Write-Host ""

# 1. Global rules
Write-Host "--- Layer 1: Global Rules ---"
$geminiMd = "$env:USERPROFILE\.gemini\GEMINI.md"
if (Check-Exists $geminiMd "~/.gemini/GEMINI.md") {
    $content = Get-Content -LiteralPath $geminiMd -Raw -Encoding UTF8
    if ($content -match "PASS/PARTIAL/BLOCKED") {
        Write-Host "[OK] GEMINI.md contains PASS/PARTIAL/BLOCKED"
    } else {
        $problems.Add("GEMINI.md missing PASS/PARTIAL/BLOCKED enforcement")
    }
}

# 2. Workspace rules frontmatter
Write-Host ""
Write-Host "--- Layer 2: Workspace Rules Frontmatter ---"

$locations = @(
    @{ Path = "P:\agent-rules\antigravity\.agents\rules"; Label = "Master source" },
    @{ Path = "P:\agent-rules\.agents\rules"; Label = "Workspace-local (agent-rules)" },
    @{ Path = "P:\tahdieuphoi\.agents\rules"; Label = "tahdieuphoi" },
    @{ Path = "P:\FaBsolution\.agents\rules"; Label = "FaBsolution" }
)

$skipFiles = @("00-codex-runtime-intent.md", "default.rules")

foreach ($loc in $locations) {
    $dir = $loc.Path
    $label = $loc.Label
    Write-Host "  Checking: $label"
    
    if (-not (Test-Path $dir)) {
        $problems.Add("MISSING DIR: $label ($dir)")
        continue
    }
    
    $files = Get-ChildItem -LiteralPath $dir -File -Filter "*.md"
    $ok = 0
    $missing = 0
    
    foreach ($file in $files) {
        if ($skipFiles -contains $file.Name) { continue }
        $content = Get-Content -LiteralPath $file.FullName -Raw -Encoding UTF8
        if ($content.StartsWith("---")) {
            $ok++
        } else {
            $missing++
            $problems.Add("NO FRONTMATTER: $label/$($file.Name)")
        }
    }
    
    Write-Host "    $ok with frontmatter, $missing without"
}

# 3. KI sync
Write-Host ""
Write-Host "--- Layer 3: KI Artifacts ---"
$kiRules = "C:\Users\DELL\.gemini\antigravity\knowledge\agent-rules-runtime\artifacts\rules"
if (Check-Exists $kiRules "KI rules directory") {
    $kiFiles = Get-ChildItem -LiteralPath $kiRules -File -Filter "*.md"
    $kiFm = ($kiFiles | Where-Object {
        $c = Get-Content -LiteralPath $_.FullName -Raw -Encoding UTF8
        $c.StartsWith("---")
    }).Count
    Write-Host "  $kiFm/$($kiFiles.Count) KI rule files have frontmatter"
}

# 4. Documentation
Write-Host ""
Write-Host "--- Documentation ---"
Check-Exists "P:\agent-rules\docs\05-antigravity-activation-architecture.md" "Architecture doc" | Out-Null
Check-Exists "P:\agent-rules\antigravity\README.md" "Antigravity README" | Out-Null
Check-Exists "P:\agent-rules\antigravity\scripts\add-rules-frontmatter.ps1" "Frontmatter script" | Out-Null

# Result
Write-Host ""
if ($problems.Count -eq 0) {
    Write-Host "Antigravity Activation Architecture: PASS"
    Write-Host "All layers verified successfully."
} else {
    Write-Host "Antigravity Activation Architecture: FAIL"
    foreach ($p in $problems) {
        Write-Host "  - $p"
    }
    exit 1
}
