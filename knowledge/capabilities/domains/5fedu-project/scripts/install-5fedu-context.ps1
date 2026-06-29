param([Parameter(Mandatory=$true)][string]$ProjectRoot)
$ErrorActionPreference = "Stop"
$Project = (Resolve-Path $ProjectRoot).Path
$RepoRoot = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))))
$Template = Join-Path $RepoRoot "knowledge\project-context\templates\5fedu"
$Target = Join-Path $Project "context\5fedu"
if (-not (Test-Path $Template)) { throw "Missing template: $Template" }
if (Test-Path $Target) { throw "Context already exists: $Target" }
New-Item -ItemType Directory -Force -Path $Target | Out-Null
Copy-Item -Path (Join-Path $Template "*") -Destination $Target -Recurse -Force
$Pointer = "# Project context pointer`n`nCanonical context: ``context/5fedu/00-index.md``. Load only domain files selected by that index.`n"
foreach ($Adapter in @(".agents", ".codex")) {
  $Dir = Join-Path $Project $Adapter
  New-Item -ItemType Directory -Force -Path $Dir | Out-Null
  Set-Content -Encoding UTF8 -LiteralPath (Join-Path $Dir "AGENTS.md") -Value $Pointer
}
Write-Host "Installed canonical 5fedu context: $Target"
