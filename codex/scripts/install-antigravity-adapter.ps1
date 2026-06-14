<#
.SYNOPSIS
    Cài đặt Antigravity adapter vào một project và đồng bộ hóa sang Codex.

.DESCRIPTION
    Script này copy toàn bộ cấu trúc Antigravity vào project target:
    - .agents/rules/     (rules + YAML frontmatter)
    - .agents/skills/    (tất cả skills: UI, research, security, PDF...)
    - .agents/workflows/ (slash command wrappers cho mỗi skill)
    - .agents/AGENTS.md, INTENT.md, README.md
    - scripts/antigravity-preflight.ps1

    Sau khi copy, script TỰ ĐỘNG:
    1. Dọn dẹp các skills và workflows cũ đã bị gộp/deprecated.
    2. Chạy add-rules-frontmatter.ps1 để thêm YAML frontmatter.
    3. Generate workflow files cho mỗi skill hiện hoạt.
    4. Đồng bộ hóa trực tiếp sang Codex runtime (C:\Users\DELL\.codex\) để Codex CLI dùng chung bộ rules/skills mới.
    5. Verify và báo cáo số lượng.

.PARAMETER ProjectRoot
    Đường dẫn tới project cần cài adapter.

.PARAMETER RulesRoot
    Đường dẫn tới repo agent-rules. Mặc định: P:\agent-rules

.PARAMETER SkipFrontmatter
    Bỏ qua bước thêm frontmatter (dùng khi debug).

.PARAMETER KeepExistingSkills
    Giữ lại skills có sẵn trong project (ví dụ: gitnexus). Mặc định: true.

.EXAMPLE
    & "P:\agent-rules\codex\scripts\install-antigravity-adapter.ps1" `
        -ProjectRoot "P:\internaltools"
#>
param(
    [Parameter(Mandatory = $true)]
    [string]$ProjectRoot,

    [string]$RulesRoot = "P:\agent-rules",

    [switch]$SkipFrontmatter = $false,

    [switch]$KeepExistingSkills = $true
)

$ErrorActionPreference = "Stop"

# === Validate ===
$adapterRoot = Join-Path $RulesRoot "antigravity"
if (-not (Test-Path $adapterRoot)) {
    throw "Missing Antigravity adapter source: $adapterRoot"
}

$project = Resolve-Path $ProjectRoot
$agentsSource = Join-Path $adapterRoot ".agents"
$agentsTarget = Join-Path $project ".agents"

Write-Host ""
Write-Host "=========================================="
Write-Host " Antigravity & Codex Adapter Install"
Write-Host "=========================================="
Write-Host "Source:  $agentsSource"
Write-Host "Target:  $agentsTarget"
Write-Host ""

# Danh sách các skill cũ đã bị gộp và cần xoá bỏ
$deprecatedSkills = @(
    "taste-skill", "soft-skill", "gpt-tasteskill", "redesign-skill",
    "imagegen-frontend-web", "imagegen-frontend-mobile", "image-to-code-skill",
    "brandkit", "stitch-skill", "minimalist-skill", "brutalist-skill",
    "frontend-ui-quality", "ui-ux-pro-max", "output-skill", "playwright-interactive"
)

# === 1. Copy entrypoints ===
Write-Host "[1/6] Copying entrypoints..."
New-Item -ItemType Directory -Force -Path $agentsTarget | Out-Null

$entrypoints = @("AGENTS.md", "INTENT.md", "README.md")
foreach ($ep in $entrypoints) {
    $src = Join-Path $agentsSource $ep
    if (Test-Path $src) {
        Copy-Item -LiteralPath $src -Destination (Join-Path $agentsTarget $ep) -Force
        Write-Host "  [OK] $ep"
    }
}

# === 2. Copy rules ===
Write-Host "[2/6] Copying rules..."
$rulesTarget = Join-Path $agentsTarget "rules"
New-Item -ItemType Directory -Force -Path $rulesTarget | Out-Null

$rulesSource = Join-Path $agentsSource "rules"
$rulesFiles = Get-ChildItem -LiteralPath $rulesSource -File
foreach ($rf in $rulesFiles) {
    Copy-Item -LiteralPath $rf.FullName -Destination (Join-Path $rulesTarget $rf.Name) -Force
}
Write-Host "  [OK] $($rulesFiles.Count) rule files copied"

# === 3. Cleanup & Copy skills ===
Write-Host "[3/6] Cleaning up deprecated skills and copying new skills..."
$skillsTarget = Join-Path $agentsTarget "skills"
$wfTarget = Join-Path $agentsTarget "workflows"

# Thực hiện dọn dẹp các skill và workflow cũ ở project đích
foreach ($ds in $deprecatedSkills) {
    $dsPath = Join-Path $skillsTarget $ds
    if (Test-Path $dsPath) {
        Remove-Item -Recurse -Force -LiteralPath $dsPath -ErrorAction SilentlyContinue
        Write-Host "  [CLEANUP] Removed deprecated skill folder: $ds"
    }
    $wfFile = Join-Path $wfTarget "$ds.md"
    if (Test-Path $wfFile) {
        Remove-Item -Force -LiteralPath $wfFile -ErrorAction SilentlyContinue
        Write-Host "  [CLEANUP] Removed deprecated workflow: $ds.md"
    }
}

New-Item -ItemType Directory -Force -Path $skillsTarget | Out-Null

$skillsSource = Join-Path $agentsSource "skills"
$skillDirs = Get-ChildItem -LiteralPath $skillsSource -Directory
$skillsCopied = 0
$skillsKept = 0

foreach ($sd in $skillDirs) {
    $destSkill = Join-Path $skillsTarget $sd.Name
    if ($KeepExistingSkills -and (Test-Path $destSkill) -and -not (Test-Path (Join-Path $agentsSource "skills\$($sd.Name)"))) {
        # Project has a skill that master doesn't — keep it
        $skillsKept++
        continue
    }
    Copy-Item -LiteralPath $sd.FullName -Destination $destSkill -Recurse -Force
    $skillsCopied++
}

# Copy README.md from skills source if exists
$skillsReadme = Join-Path $skillsSource "README.md"
if (Test-Path $skillsReadme) {
    Copy-Item -LiteralPath $skillsReadme -Destination (Join-Path $skillsTarget "README.md") -Force
}

Write-Host "  [OK] $skillsCopied skills copied, $skillsKept project-specific skills preserved"

# === 4. Generate workflows ===
Write-Host "[4/6] Generating workflows..."
New-Item -ItemType Directory -Force -Path $wfTarget | Out-Null

# Also copy existing workflow files from source
$wfSource = Join-Path $agentsSource "workflows"
if (Test-Path $wfSource) {
    $wfFiles = Get-ChildItem -LiteralPath $wfSource -File
    foreach ($wf in $wfFiles) {
        Copy-Item -LiteralPath $wf.FullName -Destination (Join-Path $wfTarget $wf.Name) -Force
    }
}

# Generate workflow stubs for any skill that doesn't have one
$allSkills = Get-ChildItem -LiteralPath $skillsTarget -Directory | Where-Object { $_.Name -notlike ".*" }
$wfGenerated = 0
foreach ($skill in $allSkills) {
    $wfFile = Join-Path $wfTarget "$($skill.Name).md"
    if (-not (Test-Path $wfFile)) {
        $wfContent = @"
# $($skill.Name) Skill

1. Read the skill file at ``.agents/skills/$($skill.Name)/SKILL.md``.
2. Inspect the current project files or request relevant context before starting work.
3. Execute the skill instructions to fulfill the user's request.
4. End with final status ``PASS``, ``PARTIAL``, or ``BLOCKED``.
"@
        Set-Content -LiteralPath $wfFile -Value $wfContent -Force
        $wfGenerated++
    }
}

$totalWf = (Get-ChildItem -LiteralPath $wfTarget -File).Count
Write-Host "  [OK] $totalWf workflows total ($wfGenerated newly generated)"

# === 5. Add YAML frontmatter ===
if (-not $SkipFrontmatter) {
    Write-Host "[5/6] Adding YAML frontmatter to rules..."
    $fmScript = Join-Path $adapterRoot "scripts\add-rules-frontmatter.ps1"
    if (Test-Path $fmScript) {
        & $fmScript -RulesDir $rulesTarget
    } else {
        Write-Host "  [WARN] add-rules-frontmatter.ps1 not found at $fmScript"
        Write-Host "  Rules will work but Antigravity may not auto-activate them."
    }
} else {
    Write-Host "[5/6] Skipping frontmatter (--SkipFrontmatter)"
}

# === Copy preflight script ===
$scriptTarget = Join-Path $project "scripts"
$preflightSrc = Join-Path $adapterRoot "scripts\antigravity-preflight.ps1"
if (Test-Path $preflightSrc) {
    New-Item -ItemType Directory -Force -Path $scriptTarget | Out-Null
    Copy-Item -LiteralPath $preflightSrc -Destination (Join-Path $scriptTarget "antigravity-preflight.ps1") -Force
}

# === 6. Codex Runtime Sync (Direct Sync to Codex) ===
$codexHome = "C:\Users\DELL\.codex"
if (Test-Path $codexHome) {
    Write-Host "[6/6] Syncing directly to Codex Runtime ($codexHome)..."
    $codexRules = Join-Path $codexHome "rules"
    $codexSkills = Join-Path $codexHome "skills"
    New-Item -ItemType Directory -Force -Path $codexRules | Out-Null
    New-Item -ItemType Directory -Force -Path $codexSkills | Out-Null

    # Xoá các skill cũ trong Codex
    foreach ($depSkill in $deprecatedSkills) {
        $depPath = Join-Path $codexSkills $depSkill
        if (Test-Path $depPath) {
            Remove-Item -Recurse -Force -LiteralPath $depPath -ErrorAction SilentlyContinue
            Write-Host "  [CLEANUP-CODEX] Removed deprecated Codex skill: $depSkill"
        }
    }

    # Sync rules
    $rulesCopiedCodex = 0
    foreach ($rf in (Get-ChildItem -LiteralPath $rulesTarget -File)) {
        Copy-Item -LiteralPath $rf.FullName -Destination (Join-Path $codexRules $rf.Name) -Force
        $rulesCopiedCodex++
    }

    # Sync skills
    $skillsCopiedCodex = 0
    foreach ($sd in (Get-ChildItem -LiteralPath $skillsTarget -Directory)) {
        Copy-Item -LiteralPath $sd.FullName -Destination (Join-Path $codexSkills $sd.Name) -Recurse -Force
        $skillsCopiedCodex++
    }
    Write-Host "  [OK] Codex sync successful ($rulesCopiedCodex rules, $skillsCopiedCodex skills synced)."
} else {
    Write-Host "[6/6] Codex runtime directory not found at $codexHome. Skipping Codex sync."
}

# === Final summary ===
$finalSkills = (Get-ChildItem -LiteralPath $skillsTarget -Directory).Count
$finalRules = (Get-ChildItem -LiteralPath $rulesTarget -File -Filter "*.md").Count
$finalWf = (Get-ChildItem -LiteralPath $wfTarget -File).Count

Write-Host ""
Write-Host "=========================================="
Write-Host " Install & Sync Complete"
Write-Host "=========================================="
Write-Host "  Project:   $project"
Write-Host "  Rules:     $finalRules files"
Write-Host "  Skills:    $finalSkills directories"
Write-Host "  Workflows: $finalWf files"
Write-Host ""
Write-Host "  All changes synchronized to Codex Runtime."
Write-Host "=========================================="
Write-Host ""
