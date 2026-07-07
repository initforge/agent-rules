param([ValidateSet("codex","grok","antigravity","cursor","all")][string]$Platform = "all")
$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
& (Join-Path $PSScriptRoot "03-validate-context.ps1")
if ($LASTEXITCODE -ne 0) { throw "validate-context failed — fix harness before runtime install" }
& (Join-Path $PSScriptRoot "01-build-runtime.ps1") -Root $Root
. (Join-Path $PSScriptRoot "Merge-Mcp-Adapters.ps1")

$UserHome = if ($env:USERPROFILE) { $env:USERPROFILE } elseif ($env:HOME) { $env:HOME } else { throw "Cannot resolve user home directory" }
$PlatformHomes = @{
  codex = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $UserHome ".codex" }
  grok = if ($env:GROK_HOME) { $env:GROK_HOME } else { Join-Path $UserHome ".grok" }
  antigravity = Join-Path $UserHome ".gemini\config"
  cursor = Join-Path $UserHome ".cursor"
}
$Selected = if ($Platform -eq "all") { @("codex", "grok", "antigravity", "cursor") } else { @($Platform) }
$BuildRoot = Join-Path $Root "05-generated\runtime-build"
$Registry = Get-Content -Raw (Join-Path $Root "integrations\registry.json") | ConvertFrom-Json
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
    "cursor" { Join-Path $AdaptersRoot "adapters\cursor.json" }
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
      $State.verified = $false
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

  if ($Name -eq "cursor") {
    $CursorRules = Join-Path $Dest "rules"
    $CursorSkills = Join-Path $Dest "skills"
    foreach ($FolderPair in @(@("rules", $CursorRules), @("skills", $CursorSkills))) {
      $SrcFolder = Join-Path $Source $FolderPair[0]
      $TargetFolder = $FolderPair[1]
      if (Test-Path $TargetFolder) { Remove-Item -LiteralPath $TargetFolder -Recurse -Force }
      New-Item -ItemType Directory -Force -Path $TargetFolder | Out-Null
      if (Test-Path $SrcFolder) {
        Copy-Item -Path (Join-Path $SrcFolder "*") -Destination $TargetFolder -Recurse -Force
      }
    }
    $DocsDest = Join-Path $Dest "agent-rules-docs"
    if (Test-Path $DocsDest) { Remove-Item -LiteralPath $DocsDest -Recurse -Force }
    Copy-Item -Path (Join-Path $Source "docs") -Destination $DocsDest -Recurse -Force
  } else {
    foreach ($Folder in @("rules", "skills", "docs")) {
      $TargetFolder = Join-Path $Dest $Folder
      if (Test-Path $TargetFolder) { Remove-Item -LiteralPath $TargetFolder -Recurse -Force }
      New-Item -ItemType Directory -Force -Path $TargetFolder | Out-Null
      Copy-Item -Path (Join-Path $Source "$Folder\*") -Destination $TargetFolder -Recurse -Force
    }
  }

  Copy-Item (Join-Path $Source "manifest.json") (Join-Path $Dest "agent-rules-manifest.json") -Force

  foreach ($Integration in $Registry.integrations) {
    if ($Integration.policy -eq "optional") { continue }
    $IntegrationState += Install-Integration -Integration $Integration -PlatformName $Name -RuntimeHome $Dest
  }

  $StatePath = Join-Path $Dest "agent-rules-integrations.json"
  [System.IO.File]::WriteAllText($StatePath, ($IntegrationState | Where-Object platform -eq $Name | ConvertTo-Json -Depth 4))

  $McpMerged = Merge-PlatformMcpAdapters -PlatformName $Name -RuntimeHome $Dest -UserHome $UserHome -Root $Root
  if ($McpMerged) { Write-Host "Merged MCP adapters for $Name" }

  Write-Host "Installed $Name -> $Dest"
}

& (Join-Path $PSScriptRoot "09-doctor.ps1") -Root $Root -Platform $Platform

$HooksScript = Join-Path $PSScriptRoot "11-install-runtime-hooks.sh"
if ((Get-Command bash -ErrorAction SilentlyContinue) -and (Test-Path -LiteralPath $HooksScript)) {
  Write-Host "Installing runtime hooks (Codex/Antigravity/Grok/pre-commit)..."
  & bash $HooksScript
} else {
  Write-Host "Skip runtime hooks: bash or 11-install-runtime-hooks.sh missing — chạy thủ công sau install."
}
