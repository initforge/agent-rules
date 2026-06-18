param(
  [Parameter(Mandatory=$true)][string]$Feature,
  [string]$Title = $Feature,
  [string]$Risk = "medium"
)

$ErrorActionPreference = "Stop"

$slug = $Feature.ToLower() -replace '[^a-z0-9\-]+','-' -replace '-+','-'
$planDir = Join-Path "plan" $slug

New-Item -ItemType Directory -Force -Path $planDir | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $planDir "research") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $planDir "review") | Out-Null

$codexHome = "$env:USERPROFILE\.codex"

Copy-Item (Join-Path $codexHome "templates\plan-index.md") (Join-Path $planDir "00-index.md") -Force
Copy-Item (Join-Path $codexHome "templates\decision-note.md") (Join-Path $planDir "decisions.md") -Force
Copy-Item (Join-Path $codexHome "templates\handoff.md") (Join-Path $planDir "handoff.md") -Force

(Get-Content (Join-Path $planDir "00-index.md") -Raw) `
  -replace '<Feature>', $Title `
  -replace 'Risk tier: low \| medium \| high', "Risk tier: $Risk" `
  -replace '<ISO timestamp>', (Get-Date -Format o) |
  Set-Content -Encoding UTF8 (Join-Path $planDir "00-index.md")

Write-Host "[Plan] created $planDir"
