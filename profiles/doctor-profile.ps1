param(
  [string]$Name = "",
  [string]$Root = (Split-Path -Parent $PSScriptRoot)
)
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "profile-helper.ps1")

$Problems = [System.Collections.Generic.List[string]]::new()

if ($Name) {
  $Profiles = @($Name)
} else {
  $Profiles = Get-EnabledProfiles -Root $Root
  if ($Profiles.Count -eq 0) {
    $All = @(Get-ChildItem (Join-Path $PSScriptRoot) -Directory | Where-Object { Test-Path (Join-Path $_.FullName "profile.yaml") } | ForEach-Object { $_.Name })
    if ($All.Count -eq 0) {
      Write-Host "No profiles found."
      exit 0
    }
    Write-Host "No profiles enabled. Available:"
    foreach ($P in $All) { Write-Host "  $P" }
    exit 0
  }
}

foreach ($PName in $Profiles) {
  $ProfileDir = Get-ProfileDir $PName
  if (-not (Test-Path $ProfileDir)) { $Problems.Add("Profile directory missing: $ProfileDir"); continue }
  $ConfigPath = Join-Path $ProfileDir "profile.yaml"
  if (-not (Test-Path $ConfigPath)) { $Problems.Add("Missing profile.yaml: $ConfigPath"); continue }
  $Enabled = Test-ProfileEnabled -Name $PName -Root $Root
  $State = if ($Enabled) { "ENABLED" } else { "DISABLED" }
  Write-Host "Profile '$PName': $State"
  $Owned = Get-ProfileOwnedFiles $PName
  $Missing = @()
  foreach ($F in $Owned) {
    $FullPath = Join-Path $Root ($F -replace '/', '\')
    if (-not (Test-Path $FullPath)) { $Missing += $F }
  }
  if ($Missing.Count -gt 0) {
    $Problems.Add("Profile '$PName' has $($Missing.Count) missing owned file(s): $($Missing -join ', ')")
  } else {
    Write-Host "  All owned files present."
  }
  $Config = Get-ProfileConfig $PName
  if ($Config) { Write-Host "  Version: $($Config.version)" }
}

if ($Problems.Count -gt 0) {
  foreach ($P in $Problems) { Write-Error $P }
  exit 1
}
Write-Host "Profile health OK."
