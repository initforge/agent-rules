param(
  [Parameter(Mandatory = $true)]
  [string]$ReportPath,

  [ValidateSet("generic", "5fedu-ui", "production", "permission", "database", "export", "cleanup", "audit")]
  [string[]]$Mode = @("generic")
)

$ErrorActionPreference = "Stop"

$problems = New-Object System.Collections.Generic.List[string]

function Add-Problem([string]$Message) {
  $problems.Add($Message) | Out-Null
}

function Require-Pattern([string]$Name, [string]$Pattern) {
  if ($content -notmatch $Pattern) {
    Add-Problem "Missing evidence: $Name"
  }
}

if (-not (Test-Path -LiteralPath $ReportPath)) {
  Write-Host "Task evidence validation: FAIL"
  Write-Host "- Missing report file: $ReportPath"
  exit 1
}

$content = Get-Content -LiteralPath $ReportPath -Raw -Encoding UTF8

if ([string]::IsNullOrWhiteSpace($content)) {
  Add-Problem "Report is empty"
}

Require-Pattern "Status PASS/PARTIAL/BLOCKED" "(?im)^\s*Status\s*:\s*(PASS|PARTIAL|BLOCKED)\b"

foreach ($item in $Mode) {
  if ($item -eq "generic") {
    Require-Pattern "Intent detected" "(?im)^\s*(Intent detected|Task)\s*:"
    Require-Pattern "Verification" "(?im)^\s*(Verification|Verify)\s*:"
    Require-Pattern "Technical debt check" "(?im)^\s*(Technical debt check|Debt check|Remaining debt)\s*:"
  } elseif ($item -eq "5fedu-ui") {
    Require-Pattern "Context loaded" "(?im)^\s*Context loaded\s*:"
    Require-Pattern "Template checked" "(?im)^\s*Template checked\s*:"
    Require-Pattern "UI verification" "(?im)^\s*(UI verification|Browser checks|Playwright|Screenshot)\s*:"
  } elseif ($item -eq "production") {
    Require-Pattern "Production environment" "(?im)^\s*(Production|Production verification|URL|Environment)\s*:"
    Require-Pattern "Deploy/build status" "(?im)^\s*(Deploy|Build|CI/CD|Vercel)\s*:"
  } elseif ($item -eq "permission") {
    Require-Pattern "Roles/accounts" "(?im)^\s*(Roles|Accounts|Permission)\s*:"
    Require-Pattern "Allowed/denied behavior" "(?im)(allowed|denied|unauthorized|forbidden)"
  } elseif ($item -eq "database") {
    Require-Pattern "Database verification" "(?im)^\s*(Database|DB verification|SQL)\s*:"
  } elseif ($item -eq "export") {
    Require-Pattern "Export/download verification" "(?im)^\s*(Export|Download|Excel|PDF|CSV)\s*:"
  } elseif ($item -eq "cleanup") {
    Require-Pattern "Reference check before cleanup" "(?im)(rg|GitNexus|callers|references)"
    Require-Pattern "Cleanup impact" "(?im)^\s*(Cleanup|Gitignore|Artifact|Deleted|Removed)\s*:"
  } elseif ($item -eq "audit") {
    Require-Pattern "Findings" "(?im)^\s*(Findings|Issues)\s*:"
    Require-Pattern "Risk/debt classification" "(?im)(risk|debt|severity)"
  }
}

if ($problems.Count -gt 0) {
  Write-Host "Task evidence validation: FAIL"
  foreach ($problem in $problems) {
    Write-Host "- $problem"
  }
  exit 1
}

Write-Host "Task evidence validation: PASS"
