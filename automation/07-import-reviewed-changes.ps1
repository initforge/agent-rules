param(
  [Parameter(Mandatory=$true)][string]$SourcePath,
  [Parameter(Mandatory=$true)][ValidateSet("global","skill","project","evidence","legacy")][string]$ChangeType,
  [switch]$Apply,
  [switch]$AllowDeletedSkillRestore
)
$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$Resolved = (Resolve-Path $SourcePath).Path
$AllowedRoots = @(
  (Join-Path $Root "rules"),
  (Join-Path $Root "skills"),
  (Join-Path $Root "projects"),
  (Join-Path $Root "integrations"),
  (Join-Path $Root "platforms"),
  (Join-Path $Root "guides"),
  (Join-Path $Root ".codex"),
  (Join-Path $Root ".agents")
) | Where-Object { Test-Path $_ }

if ($Resolved -like (Join-Path $Root "05-generated*")) { throw "Generated build output cannot be imported." }

$UnderAllowedRoot = $false
foreach ($Allowed in $AllowedRoots) {
  if ($Resolved.StartsWith($Allowed, [System.StringComparison]::OrdinalIgnoreCase)) {
    $UnderAllowedRoot = $true
    break
  }
}
if (-not $UnderAllowedRoot) { throw "Source path is outside reviewed import roots." }

if ($Resolved -match "[/\\]evidence[/\\]" -and $ChangeType -ne "evidence") { throw "Evidence paths can only be imported as evidence." }
if ($Resolved -match "[/\\]legacy[/\\]" -and $ChangeType -ne "legacy") { throw "Legacy paths can only be imported as legacy." }
if ($Resolved -match "[/\\]archive[/\\]" -and $ChangeType -ne "legacy") { throw "Archive paths can only be imported as legacy." }

$TombstoneDir = Join-Path $Root ".agent" "tombstones"
$LegacyTombstoneDir = Join-Path $Root "plans" "tombstones"
if (-not (Test-Path $TombstoneDir)) { New-Item -ItemType Directory -Path $TombstoneDir -Force | Out-Null }
if (Test-Path $LegacyTombstoneDir) {
  Get-ChildItem $LegacyTombstoneDir -File -ErrorAction SilentlyContinue | ForEach-Object {
    $Dest = Join-Path $TombstoneDir $_.Name
    if (-not (Test-Path $Dest)) { Copy-Item -LiteralPath $_.FullName -Destination $Dest }
  }
}

if ($ChangeType -eq "skill" -and -not $AllowDeletedSkillRestore) {
  $SkillName = $null
  if ($Resolved -match "[/\\]skills[/\\]([^/\\]+)[/\\]") { $SkillName = $Matches[1] }
  if ($SkillName) {
    $CanonicalSkill = Join-Path $Root "skills" $SkillName
    $Tombstone = Join-Path $TombstoneDir "$SkillName.tombstone"
    if (-not (Test-Path $CanonicalSkill) -or (Test-Path $Tombstone)) {
      throw "Skill '$SkillName' was removed from canonical (tombstone). Use -AllowDeletedSkillRestore after explicit review."
    }
  }
}

$Report = [pscustomobject]@{
  sourcePath = $Resolved
  changeType = $ChangeType
  apply = [bool]$Apply
  note = "Reviewed import only. Inspect diff before using -Apply. Canonical wins on conflict."
}

if (-not $Apply) {
  $Report | ConvertTo-Json -Depth 4
  exit 0
}

Write-Host "Reviewed import is intentionally manual after diff approval: $Resolved"
Write-Host "After merge: run automation/03-validate-context.ps1 and automation/01-build-runtime.ps1"
