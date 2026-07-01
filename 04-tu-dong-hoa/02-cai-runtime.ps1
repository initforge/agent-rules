param([ValidateSet("codex","grok","antigravity","all")][string]$Platform = "all")
$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
& (Join-Path $PSScriptRoot "01-build-runtime.ps1") -Root $Root

$UserHome = if ($env:USERPROFILE) { $env:USERPROFILE } elseif ($env:HOME) { $env:HOME } else { throw "Cannot resolve user home directory" }
$PlatformHomes = @{
  codex = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $UserHome ".codex" }
  grok = if ($env:GROK_HOME) { $env:GROK_HOME } else { Join-Path $UserHome ".grok" }
  antigravity = Join-Path $UserHome ".gemini\config"
}
$Selected = if ($Platform -eq "all") { @("codex", "grok", "antigravity") } else { @($Platform) }
$BuildRoot = Join-Path $Root "05-ban-dung\runtime-build"
$Registry = Get-Content -Raw (Join-Path $Root "01-global\tich-hop\registry.json") | ConvertFrom-Json
$IntegrationState = @()

function Stage-Adapters {
  param(
    [pscustomobject]$Integration,
    [string]$PlatformName,
    [string]$RuntimeHome
  )

  $AdaptersRoot = Join-Path $Root $Integration.path
  $SourceAdapter = switch ($PlatformName) {
    "codex" { Join-Path $AdaptersRoot "adapters\codex.toml" }
    "grok" { Join-Path $AdaptersRoot "adapters\grok.json" }
    "antigravity" { Join-Path $AdaptersRoot "adapters\antigravity.json" }
  }

  if (-not (Test-Path $SourceAdapter)) { return $null }

  $TargetDir = Join-Path $RuntimeHome "agent-rules-adapters"
  New-Item -ItemType Directory -Force -Path $TargetDir | Out-Null
  $TargetPath = Join-Path $TargetDir ([IO.Path]::GetFileName($SourceAdapter))
  Copy-Item -LiteralPath $SourceAdapter -Destination $TargetPath -Force
  return $TargetPath
}

function Install-Integration {
  param(
    [pscustomobject]$Integration,
    [string]$PlatformName,
    [string]$RuntimeHome
  )

  $Path = Join-Path $Root $Integration.path
  $InstallScript = Join-Path $Path "install.ps1"
  $VerifyScript = Join-Path $Path "verify.ps1"
  $State = [ordered]@{
    name = $Integration.name
    policy = $Integration.policy
    platform = $PlatformName
    installed = $false
    verified = $false
    adapterStaged = $false
    adapterPath = ""
    note = ""
  }

  if (-not (Test-Path $InstallScript)) {
    $State.note = "Missing install script"
    return [pscustomobject]$State
  }

  try {
    & $InstallScript | Out-Null
    $State.installed = $true
    $AdapterPath = Stage-Adapters -Integration $Integration -PlatformName $PlatformName -RuntimeHome $RuntimeHome
    if ($AdapterPath) {
      $State.adapterStaged = $true
      $State.adapterPath = $AdapterPath
    }
    if (Test-Path $VerifyScript) {
      & $VerifyScript | Out-Null
      $State.verified = $true
    } else {
      $State.verified = $true
      $State.note = "No verify script"
    }
  } catch {
    $State.note = $_.Exception.Message
    if ($Integration.policy -eq "required") { throw }
  }

  return [pscustomobject]$State
}

foreach ($Name in $Selected) {
  $Source = Join-Path $BuildRoot $Name
  $Dest = $PlatformHomes[$Name]
  New-Item -ItemType Directory -Force -Path $Dest | Out-Null

  foreach ($Folder in @("rules", "skills", "docs")) {
    $TargetFolder = Join-Path $Dest $Folder
    if (Test-Path $TargetFolder) { Remove-Item -LiteralPath $TargetFolder -Recurse -Force }
    New-Item -ItemType Directory -Force -Path $TargetFolder | Out-Null
    Copy-Item -Path (Join-Path $Source "$Folder\*") -Destination $TargetFolder -Recurse -Force
  }

  Copy-Item (Join-Path $Source "manifest.json") (Join-Path $Dest "agent-rules-manifest.json") -Force

  foreach ($Integration in $Registry.integrations) {
    if ($Integration.policy -eq "optional") { continue }
    $IntegrationState += Install-Integration -Integration $Integration -PlatformName $Name -RuntimeHome $Dest
  }

  $StatePath = Join-Path $Dest "agent-rules-integrations.json"
  $IntegrationState | Where-Object platform -eq $Name | ConvertTo-Json -Depth 4 | Set-Content -Encoding UTF8 $StatePath

  Write-Host "Installed $Name -> $Dest"
}
