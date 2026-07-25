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

$MarkerDir = Join-Path $Root ".agent\profiles"
$MarkerPath = Join-Path $MarkerDir "$Name.enabled"

if ((Test-Path $MarkerPath) -and -not $Force) {
  Write-Host "Profile '$Name' is already enabled. Use -Force to re-enable."
  exit 0
}

# Validate harness compatibility
$ManifestPath = Join-Path $Root "rules\manifest.yaml"
if (Test-Path $ManifestPath) {
  $Manifest = Get-Content -Raw -Encoding UTF8 $ManifestPath
  if ($Manifest -match 'version:\s*(\S+)') {
    $ManifestVersion = $Matches[1]
    $MinVersion = if ($Config.ContainsKey("minHarnessVersion")) { $Config["minHarnessVersion"] } else { "0.0.0" }
    Write-Host "Harness version: $ManifestVersion, profile requires: $MinVersion"
  }
}

Enable-Profile -Name $Name -Root $Root

Write-Host "Profile '$Name' ($($Config.displayName)) installed and enabled."
Write-Host ""
Write-Host "Profile-owned files are now available:"
$Owned = Get-ProfileOwnedFiles $Name
foreach ($F in $Owned) {
  $FullPath = Join-Path $Root ($F -replace '/', '\')
  if (Test-Path $FullPath) { Write-Host "  ✓ $F" }
  else { Write-Host "  ? $F (not found)" }
}
Write-Host ""
Write-Host "To verify profile: profiles\doctor-profile.ps1 -Name $Name"
