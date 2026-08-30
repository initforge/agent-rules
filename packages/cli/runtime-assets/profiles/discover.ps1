param([string]$Root = (Split-Path -Parent $PSScriptRoot))
$ErrorActionPreference = "Stop"

$ManifestPath = Join-Path $PSScriptRoot "manifest.yaml"
if (-not (Test-Path $ManifestPath)) { throw "Profile manifest not found: $ManifestPath" }

$Manifest = Get-Content -Raw -Encoding UTF8 $ManifestPath
$ProfileSection = $false
$CurrentProfile = $null
$Profiles = @()

foreach ($Line in ($Manifest -split "`r?`n")) {
  if ($Line -match '^profiles:') { $ProfileSection = $true; continue }
  if (-not $ProfileSection) { continue }
  if ($Line -match '^  (\S+):') {
    if ($CurrentProfile) { $Profiles += $CurrentProfile }
    $CurrentProfile = @{ name = $Matches[1] }
  }
  if ($CurrentProfile -and $Line -match '^\s+displayName:\s*"(.+)"') { $CurrentProfile.displayName = $Matches[1] }
  if ($CurrentProfile -and $Line -match '^\s+description:\s*"(.+)"') { $CurrentProfile.description = $Matches[1] }
  if ($CurrentProfile -and $Line -match '^\s+version:\s*"(.+)"') { $CurrentProfile.version = $Matches[1] }
  if ($CurrentProfile -and $Line -match '^\s+enabledByDefault:\s*(.+)') { $CurrentProfile.enabledByDefault = $Matches[1] -eq 'true' }
}
if ($CurrentProfile) { $Profiles += $CurrentProfile }

if ($Profiles.Count -eq 0) {
  Write-Host "No profiles available."
  exit 0
}

Write-Host "Available profiles:`n"
foreach ($P in $Profiles) {
  $Flag = if ($P.enabledByDefault) { "[default]" } else { "[optional]" }
  Write-Host "  $($P.name) $Flag"
  Write-Host "    Name: $($P.displayName)"
  Write-Host "    Version: $($P.version)"
  Write-Host "    $($P.description)"
  Write-Host ""
}
