param(
  [Parameter(Mandatory=$true)][string]$SourcePath,
  [Parameter(Mandatory=$true)][ValidateSet("global","skill","project","evidence","legacy")][string]$ChangeType,
  [switch]$Apply
)
$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$Resolved = (Resolve-Path $SourcePath).Path
$AllowedRoots = @(
  (Join-Path $Root "01-global"),
  (Join-Path $Root "02-du-an"),
  (Join-Path $Root ".codex"),
  (Join-Path $Root ".agents")
) | Where-Object { Test-Path $_ }

if ($Resolved -like (Join-Path $Root "05-ban-dung*")) { throw "Generated build output cannot be imported." }

$UnderAllowedRoot = $false
foreach ($Allowed in $AllowedRoots) {
  if ($Resolved.StartsWith($Allowed, [System.StringComparison]::OrdinalIgnoreCase)) {
    $UnderAllowedRoot = $true
    break
  }
}
if (-not $UnderAllowedRoot) { throw "Source path is outside reviewed import roots." }

if ($Resolved -match "\\30-bang-chung\\" -and $ChangeType -ne "evidence") { throw "Evidence paths can only be imported as evidence." }
if ($Resolved -match "\\40-legacy\\" -and $ChangeType -ne "legacy") { throw "Legacy paths can only be imported as legacy." }

$Report = [pscustomobject]@{
  sourcePath = $Resolved
  changeType = $ChangeType
  apply = [bool]$Apply
  note = "Reviewed import only. Inspect diff before using -Apply."
}

if (-not $Apply) {
  $Report | ConvertTo-Json -Depth 4
  exit 0
}

Write-Host "Reviewed import is intentionally manual after diff approval: $Resolved"
