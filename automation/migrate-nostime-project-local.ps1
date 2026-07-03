# Migrate nostime project-specific content -> project-local/ (preserved from installer overlay overwrite)
$ErrorActionPreference = "Stop"
$Src = "/home/linhnxdeveloper/Projects/nostime/context/5fedu"
$Overlay = Join-Path $Src "project-overlay"
$OverlayNostime = Join-Path $Overlay "nostime"
$Pl = Join-Path $Src "project-local"

New-Item -ItemType Directory -Force -Path $Pl | Out-Null

# Prefer archive/nostime overlay subfolder when present (newer decisions)
$SourceDir = if (Test-Path $OverlayNostime) { $OverlayNostime } else { $Overlay }

$Map = @{
  "architecture-and-specs.md" = "architecture-and-specs.md"
  "backend-notes.md" = "backend-notes.md"
  "database-specs.md" = "database-and-auth.md"
  "decisions.md" = "decisions.md"
  "google-sheets-source-map.md" = "source-map.md"
  "source-specs-and-coverage.md" = "source-specs-and-coverage.md"
}

foreach ($Entry in $Map.GetEnumerator()) {
  $From = Join-Path $SourceDir $Entry.Key
  if (Test-Path $From) {
    Copy-Item $From (Join-Path $Pl $Entry.Value) -Force
  }
}

$Idx = @"
# 5fedu Project-Local Router (NOSTIME)

**Vai trò:** Spec retail/luxury **riêng dự án** — installer không ghi đè ``project-local/``.
**Ý đồ:** Sheets, Supabase, decisions Nostime — chỉ trong repo này.

## File chính

| File | Nội dung |
|---|---|
| ``architecture-and-specs.md`` | Kiến trúc retail |
| ``database-and-auth.md`` | Schema Supabase |
| ``backend-notes.md`` | Backend notes |
| ``decisions.md`` | Quyết định Nostime |
| ``source-map.md`` | Google Sheets |
| ``source-specs-and-coverage.md`` | Coverage spec |

Template generic: ``../domains/``. Overlay template (ghi đè khi install): ``../project-overlay/``.

"@

[System.IO.File]::WriteAllText((Join-Path $Pl "00-index.md"), $Idx)
Write-Host "NOSTIME project-local: $((Get-ChildItem $Pl -File).Count) files"
