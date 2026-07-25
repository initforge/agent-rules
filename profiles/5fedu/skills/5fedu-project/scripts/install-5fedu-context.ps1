param(
  [Parameter(Mandatory=$true)][string]$ProjectRoot,
  [switch]$SkipPrompts
)
$ErrorActionPreference = "Stop"
$Project = (Resolve-Path $ProjectRoot).Path
$RepoRoot = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))
$Args = @{ ProjectRoot = $Project }
if ($SkipPrompts) { $Args.SkipPrompts = $true }
& (Join-Path $RepoRoot "automation\08-install-5fedu-context.ps1") @Args

