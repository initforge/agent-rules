param(
  [Parameter(Mandatory=$true)][string]$Task,
  [string]$Repo = ".",
  [string]$Out = "plan\_external\researcher-note.md",
  [string]$Mode = "standard"
)

$ErrorActionPreference = "Stop"

New-Item -ItemType Directory -Force -Path (Split-Path $Out) | Out-Null

$repoLabel = if ($Repo -and $Repo -ne ".") { $Repo } else { (Get-Location).Path }

$body = @()
$body += "# Researcher Note"
$body += ""
$body += "Status: TODO"
$body += ""
$body += "Mode: $Mode"
$body += "Repo: $repoLabel"
$body += ""
$body += "## Task"
$body += "- $Task"
$body += ""
$body += "## Research Contract (≥3 source angles)"
$body += "- Local: rg, file reads, GitNexus when usable."
$body += "- Web: official + practice + standard — no duplicate blogs."
$body += "- Return: Summary, Evidence, Risks, Recommendation, Unknowns."
$body += ""
$body += "## Result"
$body += "- pending"

$body -join "`n" | Set-Content -Encoding UTF8 $Out

Write-Host "[Researcher] seeded note at $Out"