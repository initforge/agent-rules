# One-time migrate tah-app legacy context -> project-local/
$ErrorActionPreference = "Stop"
$Src = "/home/linhnxdeveloper/Projects/Tah-app/context/5fedu"
$Pl = Join-Path $Src "project-local"
$Ev = Join-Path $Pl "evidence"

function Merge-Files {
  param([string]$Out, [string[]]$Inputs, [string]$Title)
  $Lines = @("# $Title", "", "> Migrated from legacy layout. Installer never overwrites ``project-local/``.", "")
  foreach ($F in $Inputs) {
    $Path = Join-Path $Src $F
    if (-not (Test-Path $Path)) { continue }
    $Lines += "---", "", "## Source: ``$F``", ""
    $Lines += Get-Content -Raw -Encoding UTF8 $Path
    $Lines += ""
  }
  [System.IO.File]::WriteAllText($Out, ($Lines -join "`n"))
}

New-Item -ItemType Directory -Force -Path $Pl, $Ev | Out-Null

Copy-Item (Join-Path $Src "00-index.md") (Join-Path $Pl "00-index.md") -Force

Merge-Files (Join-Path $Pl "database-and-auth.md") @(
  "02-database-and-auth-rules.md",
  "03-database-supabase.md",
  "04-auth-permissions-and-flows.md",
  "database_specs.md",
  "backend_notes.md"
) "Database and Auth (project)"

Merge-Files (Join-Path $Pl "ui-standards.md") @(
  "03-ui-ux-and-delivery-standards.md",
  "02-frontend-mapping.md",
  "05-delivery-quality.md",
  "07-working-format.md"
) "UI Standards (project)"

if (Test-Path (Join-Path $Src "04-business-patterns.md")) {
  Copy-Item (Join-Path $Src "04-business-patterns.md") (Join-Path $Pl "business-patterns.md") -Force
}

Merge-Files (Join-Path $Pl "decisions.md") @(
  "04-decision-status-and-backlog.md",
  "06-decision-status.md"
) "Decisions (project)"

if (Test-Path (Join-Path $Src "questions.md")) {
  Copy-Item (Join-Path $Src "questions.md") (Join-Path $Pl "open-questions.md") -Force
}

Merge-Files (Join-Path $Pl "source-map.md") @(
  "11-current-sheets-source-map.md",
  "05-source-specs-and-coverage.md",
  "08-source-examples.md"
) "Source map (project)"

foreach ($F in @("13-trip-execution-vs-approval-spec.md", "14-production-e2e-harness.md")) {
  $Name = if ($F -match "13-trip") { "transport-spec.md" } else { "e2e-harness.md" }
  if (Test-Path (Join-Path $Src $F)) {
    Copy-Item (Join-Path $Src $F) (Join-Path $Pl $Name) -Force
  }
}

foreach ($F in @(
  "01-architecture-and-specs.md", "01-tech-stack-and-template.md",
  "09-coverage-audit.md", "10-owner-feedback-lessons.md", "12-owner-feedback-transport-ui.md"
)) {
  if (Test-Path (Join-Path $Src $F)) {
    Copy-Item (Join-Path $Src $F) (Join-Path $Ev $F) -Force
  }
}

# Update project-local index header
$Idx = Join-Path $Pl "00-index.md"
$Header = @"
# 5fedu Project-Local Router (Tah-app)

**Vai trò:** Router và rule sống **riêng dự án** - installer không ghi đè ``project-local/``.
**Ý đồ:** Sheets map, Supabase spec, decisions đã chốt, transport, e2e - chỉ trong repo này.

## File chính

| File | Nội dung |
|---|---|
| ``database-and-auth.md`` | Schema, auth, RLS, Supabase |
| ``ui-standards.md`` | UI/delivery/working format |
| ``business-patterns.md`` | ERP patterns dự án |
| ``decisions.md`` | Quyết định DA_CHOT |
| ``open-questions.md`` | Câu hỏi mở |
| ``source-map.md`` | Google Sheets / source coverage |
| ``transport-spec.md`` | Chuyến xe execution vs approval |
| ``e2e-harness.md`` | Playwright production harness |
| ``evidence/`` | Log/audit (không auto-load) |

Template generic: ``../domains/`` (ghi đè bởi installer).

---

"@
$Body = Get-Content -Raw -Encoding UTF8 $Idx
if ($Body -notlike "*Project-Local Router*") {
  [System.IO.File]::WriteAllText($Idx, ($Header + $Body))
}

$LegacyRoot = @(
  "00-index.md", "01-architecture-and-specs.md", "01-tech-stack-and-template.md",
  "02-database-and-auth-rules.md", "02-frontend-mapping.md", "03-database-supabase.md",
  "03-ui-ux-and-delivery-standards.md", "04-auth-permissions-and-flows.md",
  "04-business-patterns.md", "04-decision-status-and-backlog.md", "05-delivery-quality.md",
  "05-source-specs-and-coverage.md", "06-decision-status.md", "07-working-format.md",
  "08-source-examples.md", "09-coverage-audit.md", "10-owner-feedback-lessons.md",
  "11-current-sheets-source-map.md", "12-owner-feedback-transport-ui.md",
  "13-trip-execution-vs-approval-spec.md", "14-production-e2e-harness.md",
  "backend_notes.md", "database_specs.md", "questions.md"
)
foreach ($F in $LegacyRoot) {
  $P = Join-Path $Src $F
  if (Test-Path $P) { Remove-Item -LiteralPath $P -Force }
}

Write-Host "Migrated tah-app -> project-local/ ($((Get-ChildItem $Pl -Recurse -File).Count) files)"
