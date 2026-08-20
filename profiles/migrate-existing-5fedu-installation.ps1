param(
  [string]$ProjectRoot = "",
  [string]$Root = (Split-Path -Parent $PSScriptRoot),
  [switch]$DryRun
)
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "profile-helper.ps1")

Write-Host "=== 5fedu Profile Migration Helper ==="
Write-Host ""
Write-Host "This script helps migrate existing 5fedu installations to the new profile-based layout."
Write-Host ""
Write-Host "Changes in this version:"
Write-Host "  1. 5fedu content moved from projects/5fedu/ to profiles/5fedu/projects/"
Write-Host "  2. Skills moved from skills/5fedu-*/ to profiles/5fedu/skills/"
Write-Host "  3. Automation scripts moved to profiles/5fedu/automation/"
Write-Host "  4. 5fedu profile is DISABLED by default"
Write-Host "  5. Enable via: profiles\install-profile.ps1 -Name 5fedu"
Write-Host ""

# Check if profile is already enabled
$Enabled = Test-ProfileEnabled -Name "5fedu" -Root $Root
if ($Enabled) {
  Write-Host "5fedu profile is already enabled."
} else {
  Write-Host "5fedu profile is currently DISABLED."
  if (-not $DryRun) {
    $Confirm = Read-Host "Enable 5fedu profile now? (y/N)"
    if ($Confirm -match '^[yY]') {
      Enable-Profile -Name "5fedu" -Root $Root
    }
  }
}

# Check for existing project context installations (if project root provided)
if ($ProjectRoot) {
  $Project = (Resolve-Path $ProjectRoot).Path
  $CtxDir = Join-Path $Project "context\5fedu"
  if (Test-Path $CtxDir) {
    Write-Host ""
    Write-Host "Found existing 5fedu context at: $CtxDir"
    Write-Host "This installation is fully compatible."
    Write-Host "The installer at profiles/5fedu/automation/08-install-5fedu-context.ps1 works as before."
  } else {
    Write-Host ""
    Write-Host "No existing 5fedu context found at $CtxDir"
  }
}

Write-Host ""
Write-Host "Migration complete."
Write-Host ""
Write-Host "To verify: profiles\doctor-profile.ps1 -Name 5fedu"
Write-Host "To use 5fedu skills in a project, enable the profile first."
