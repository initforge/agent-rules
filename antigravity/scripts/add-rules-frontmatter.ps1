param(
    [string]$RulesDir = (Join-Path (Get-Location).Path ".agents\rules"),
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

# Frontmatter definitions - ASCII descriptions to avoid encoding issues
# Codex note: This script is for Antigravity IDE activation only.
# Codex CLI does NOT read YAML frontmatter. It reads .codex/ via AGENTS.md imports.

$fm = @{}

# === ALWAYS APPLY (inject every turn) ===
$fm["00-hard-activation-contract.md"] = "---
description: >-
  BAT BUOC. Hop dong kich hoat cung: final status PASS/PARTIAL/BLOCKED,
  evidence labels, safe override, protected files, trigger gates,
  technical debt gate. Doc file nay truoc moi task.
alwaysApply: true
---"

$fm["00-antigravity-runtime-intent.md"] = "---
description: >-
  BAT BUOC. Quy tac van hanh cot loi cho Antigravity: ngon ngu tieng Viet,
  cach sua file, quality gate, impact analysis, intent audit, template
  reference, tu hoc feedback.
alwaysApply: true
---"

$fm["01-intent-contract.md"] = "---
description: >-
  BAT BUOC. Hop dong y do: cach nhan dien request, kich hoat workflow,
  final status PASS/PARTIAL/BLOCKED. Uu tien workflow chuyen biet khi
  request khop.
alwaysApply: true
---"

$fm["10-fast-context.md"] = "---
description: >-
  BAT BUOC. Ky luat context: context budget, trigger map cho skills va
  workflows, stop conditions. Doc file nay de biet khi nao dung skill
  hoac workflow nao.
alwaysApply: true
---"

$fm["core.md"] = "---
description: >-
  BAT BUOC. Luat nen tang: scope control, verify truoc khi bao xong,
  khong sua lan, tach fact/assumption/unknown.
alwaysApply: true
---"

$fm["quality-gates.md"] = "---
description: >-
  BAT BUOC. Quality gates: root cause analysis, impact table, verify
  checklist, database/auth/permission as HIGH risk.
alwaysApply: true
---"

$fm["clean-code.md"] = "---
description: >-
  BAT BUOC. Clean code discipline: naming, structure, DRY, no dead code,
  comment preservation, import organization.
alwaysApply: true
---"

$fm["technical-debt-control.md"] = "---
description: >-
  BAT BUOC. Kiem soat no ky thuat: phan loai debt, severity matrix,
  khi nao phai sua truoc PASS, debt register format.
alwaysApply: true
---"

$fm["prompt-intent-router.md"] = "---
description: >-
  BAT BUOC. Router y do prompt: phan loai request thanh investigate,
  implement, fix, review, cleanup. Chon dung workflow va depth.
alwaysApply: true
---"

# === MODEL DECISION (agent decides based on description) ===
$fm["planning.md"] = "---
description: >-
  Quy tac lap plan: khi nao can plan, format plan, slice plan, khong
  mega-plan. Kich hoat khi task phuc tap can planning.
alwaysApply: false
---"

$fm["execution.md"] = "---
description: >-
  Quy tac thuc thi: scope discipline, verify after change, rollback
  awareness. Kich hoat khi dang implement code changes.
alwaysApply: false
---"

$fm["context-tools.md"] = "---
description: >-
  Huong dan su dung context tools: rg/search tool, list_dir, view_file,
  browser, MCP. Kich hoat khi can tra cuu hoac debug.
alwaysApply: false
---"

$fm["root-cause-verification.md"] = "---
description: >-
  Quy trinh xac minh root cause: 5 Whys, reproduce, verify fix.
  Kich hoat khi debug loi hoac investigate issue.
alwaysApply: false
---"

$fm["tool-inventory.md"] = "---
description: >-
  Danh sach tools va cach dung: MCP servers, scripts, CLI tools.
  Kich hoat khi can biet tool nao available.
alwaysApply: false
---"

$fm["codex-overlay.md"] = "---
description: >-
  Overlay cho Codex CLI: import rules, model config, sandbox.
  CHI kich hoat khi context la Codex CLI, KHONG dung cho Antigravity.
alwaysApply: false
---"

# Files to skip entirely
$skipFiles = @("00-codex-runtime-intent.md", "default.rules")

if (-not (Test-Path $RulesDir)) {
    throw "Rules directory not found: $RulesDir"
}

$files = Get-ChildItem -LiteralPath $RulesDir -File
$updated = 0
$skipped = 0
$alreadyHas = 0

foreach ($file in $files) {
    $name = $file.Name

    if ($skipFiles -contains $name) {
        Write-Host "[Skip] $name (not for Antigravity)"
        $skipped++
        continue
    }

    if (-not $fm.ContainsKey($name)) {
        Write-Host "[Warn] $name has no frontmatter definition"
        $skipped++
        continue
    }

    $content = Get-Content -LiteralPath $file.FullName -Raw -Encoding UTF8

    # Check if already has frontmatter
    if ($content.StartsWith("---")) {
        Write-Host "[Already] $name"
        $alreadyHas++
        continue
    }

    $header = $fm[$name]
    $newContent = $header + "`n`n" + $content
    $newContent = $newContent -replace "`r`n", "`n"

    if ($DryRun) {
        $alwaysVal = if ($header -match "alwaysApply:\s*true") { "true" } else { "false" }
        Write-Host "[DryRun] $name (alwaysApply: $alwaysVal)"
    } else {
        [System.IO.File]::WriteAllText(
            $file.FullName,
            $newContent,
            [System.Text.UTF8Encoding]::new($false)
        )
        $alwaysVal = if ($header -match "alwaysApply:\s*true") { "true" } else { "false" }
        Write-Host "[Updated] $name (alwaysApply: $alwaysVal)"
    }
    $updated++
}

Write-Host ""
Write-Host "Done: $updated updated, $alreadyHas already, $skipped skipped"
