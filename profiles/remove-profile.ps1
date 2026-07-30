param(
  [Parameter(Mandatory=$true)][string]$Name,
  [string]$Root = (Split-Path -Parent $PSScriptRoot),
  [switch]$Force
)
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "profile-helper.ps1")

$MarkerPath = Join-Path $Root ".agent\profiles\$Name.enabled"
if (-not (Test-Path $MarkerPath)) {
  Write-Host "Profile '$Name' is not enabled."
  if (-not $Force) { exit 0 }
}

if (-not $Force) {
  $Confirm = Read-Host "Remove profile '$Name'? This will disable it but preserve profile files. (y/N)"
  if ($Confirm -notmatch '^[yY]') { throw "Remove cancelled." }
}

Disable-Profile -Name $Name -Root $Root
Write-Host "Profile '$Name' removed (files preserved at profiles/$Name/)."
