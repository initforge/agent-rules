# Helper functions for profile management.
# Dot-source this file: . (Join-Path $PSScriptRoot "profile-helper.ps1")

function Get-ProfileRoot { param() Split-Path -Parent $PSScriptRoot }

function Get-ProfileManifest { param() Join-Path (Get-ProfileRoot) "profiles\manifest.yaml" }

function Get-ProfileDir { param([string]$Name) Join-Path (Get-ProfileRoot) "profiles\$Name" }

function Get-ProfileConfig {
  param([string]$Name)
  $ProfileDir = Get-ProfileDir $Name
  $ConfigPath = Join-Path $ProfileDir "profile.yaml"
  if (-not (Test-Path $ConfigPath)) { return $null }
  $Content = Get-Content -Raw -Encoding UTF8 $ConfigPath
  $Config = @{}
  foreach ($Line in ($Content -split "`r?`n")) {
    if ($Line -match '^(\w+):\s*"(.+)"') { $Config[$Matches[1]] = $Matches[2] }
    if ($Line -match '^enabledByDefault:\s*(.+)') { $Config["enabledByDefault"] = $Matches[1].Trim() -eq 'true' }
  }
  return $Config
}

function Get-ProfileOwnedFiles {
  param([string]$Name)
  $ConfigPath = Join-Path (Get-ProfileDir $Name) "profile.yaml"
  if (-not (Test-Path $ConfigPath)) { return @() }
  $InOwned = $false
  $Files = @()
  foreach ($Line in (Get-Content -Raw -Encoding UTF8 $ConfigPath -split "`r?`n")) {
    if ($Line -match '^ownedFiles:') { $InOwned = $true; continue }
    if ($InOwned) {
      if ($Line -match '^\s+- "(.+)"') { $Files += $Matches[1] }
      elseif ($Line -match '^\w') { $InOwned = $false }
    }
  }
  return $Files
}

function Test-ProfileEnabled {
  param([string]$Name, [string]$Root = (Get-ProfileRoot))
  $Marker = Join-Path $Root ".agent\profiles\$Name.enabled"
  return (Test-Path $Marker)
}

function Enable-Profile {
  param([string]$Name, [string]$Root = (Get-ProfileRoot))
  $ProfileDir = Get-ProfileDir $Name
  if (-not (Test-Path $ProfileDir)) { throw "Profile '$Name' not found at $ProfileDir" }
  $MarkerDir = Join-Path $Root ".agent\profiles"
  New-Item -ItemType Directory -Force -Path $MarkerDir | Out-Null
  [System.IO.File]::WriteAllText((Join-Path $MarkerDir "$Name.enabled"), "enabled: $(Get-Date -Format 'yyyy-MM-ddTHH:mm:ss')`n")
  Write-Host "Profile '$Name' enabled."
}

function Disable-Profile {
  param([string]$Name, [string]$Root = (Get-ProfileRoot))
  $Marker = Join-Path $Root ".agent\profiles\$Name.enabled"
  if (Test-Path $Marker) {
    Remove-Item -LiteralPath $Marker -Force
    Write-Host "Profile '$Name' disabled."
  } else {
    Write-Host "Profile '$Name' is not enabled."
  }
}

function Get-EnabledProfiles {
  param([string]$Root = (Get-ProfileRoot))
  $ProfileDir = Join-Path $Root ".agent\profiles"
  if (-not (Test-Path $ProfileDir)) { return @() }
  return @(Get-ChildItem $ProfileDir -Filter "*.enabled" | ForEach-Object { $_.BaseName })
}

function Test-ProfileOwnedFile {
  param([string]$Name, [string]$RelativePath)
  $Owned = Get-ProfileOwnedFiles $Name
  foreach ($Pattern in $Owned) {
    $Normalized = $RelativePath.Replace('\', '/')
    $PatNormalized = $Pattern.Replace('\', '/').Replace('**', '.*').Replace('*', '[^/]*')
    if ($Normalized -match "^$PatNormalized$") { return $true }
  }
  return $false
}
