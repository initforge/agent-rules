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
$body += "# Researcher Note (legacy script — prefer run-researcher.ps1)"
$body += ""
$body += "Status: TODO"
$body += ""
$body += "Mode: $Mode"
$body += "Repo: $repoLabel"
$body += ""
$body += "## Task"
$body += "- $Task"
$body += ""
$body += "## Research Contract"
$body += "- Use local context first: rg, targeted file reads, GitNexus when usable."
$body += "- Use web only for latest behavior, official docs, or external platform details."
$body += "- Do not edit application code during research mode."
$body += "- Return: Summary, Evidence, Risks, Recommendation, Unknowns."
$body += ""
$body += "## Result"
$body += "- pending"

$body -join "`n" | Set-Content -Encoding UTF8 $Out

Write-Host "[Researcher/legacy] seeded note at $Out"
