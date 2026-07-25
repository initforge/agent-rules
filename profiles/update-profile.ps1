param(
  [Parameter(Mandatory=$true)][string]$Name,
  [string]$Root = (Split-Path -Parent $PSScriptRoot),
  [switch]$Force
)
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "profile-helper.ps1")

$ProfileDir = Get-ProfileDir $Name
if (-not (Test-Path $ProfileDir)) { throw "Profile '$Name' not found at $ProfileDir" }

$Config = Get-ProfileConfig $Name
if (-not $Config) { throw "Missing profile.yaml for '$Name'" }

$Enabled = Test-ProfileEnabled -Name $Name -Root $Root
$Status = if ($Enabled) { "enabled" } else { "disabled" }
Write-Host "Profile '$Name' ($($Config.displayName)) is $Status."

if ($Enabled -and $Force) {
  Enable-Profile -Name $Name -Root $Root
  Write-Host "Profile '$Name' updated."
} elseif (-not $Enabled) {
  Write-Host "Profile is disabled. Run 'profiles\install-profile.ps1 -Name $Name' to enable."
}

Write-Host "Profile version: $($Config.version)"
