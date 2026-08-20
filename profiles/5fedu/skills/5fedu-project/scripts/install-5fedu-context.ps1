param(
  [Parameter(Mandatory=$true)][string]$ProjectRoot,
  [ValidateSet("default","tah-app","nostime")][string]$Profile = "default",
  [switch]$SkipPrompts,
  [switch]$Force,
  [switch]$UpdatePointersOnly
)
$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$RepoRoot = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))
$Installer = Join-Path $RepoRoot "profiles/5fedu/automation/08-install-5fedu-context.ps1"
if (-not (Test-Path -LiteralPath $Installer -PathType Leaf)) {
  throw "Canonical 5fedu installer not found: $Installer"
}

$Forward = @{
  ProjectRoot = $ProjectRoot
  Profile = $Profile
}
if ($SkipPrompts) { $Forward.SkipPrompts = $true }
if ($Force) { $Forward.Force = $true }
if ($UpdatePointersOnly) { $Forward.UpdatePointersOnly = $true }

& $Installer @Forward
