param([Parameter(Mandatory=$true)][string]$ProjectRoot)
$ErrorActionPreference = "Stop"
$Project = (Resolve-Path $ProjectRoot).Path
$RepoRoot = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))))
& (Join-Path $RepoRoot "04-tu-dong-hoa\08-cai-5fedu-context.ps1") -ProjectRoot $Project
