param(
  [string]$Repo = ".",
  [switch]$ForceAnalyze
)

$ErrorActionPreference = "Stop"

Push-Location $Repo

try {
  if (-not (Test-Path ".git")) {
    Write-Host "[GitNexus] not a git repo: $Repo"
    exit 0
  }

  if (-not (Test-Path ".gitnexus")) {
    Write-Host "[GitNexus] missing .gitnexus -> analyze recommended"

    if ($ForceAnalyze) {
      npx gitnexus analyze
    }

    exit $LASTEXITCODE
  }

  if (-not (Test-Path ".gitnexus\\meta.json")) {
    Write-Host "[GitNexus] .gitnexus exists but meta.json is missing -> index is incomplete or broken"
    Write-Host "[GitNexus] If analyze keeps failing, fallback to rg and record GitNexus as unavailable for this repo"
    exit 0
  }

  if ($ForceAnalyze) {
    Write-Host "[GitNexus] forced analyze"
    npx gitnexus analyze
    exit $LASTEXITCODE
  }

  $changed = git status --porcelain

  if ($changed) {
    Write-Host "[GitNexus] repo has changes. Analyze only if task is MEDIUM/HIGH or impact-sensitive."
    Write-Host "Run: npx gitnexus analyze"
  } else {
    Write-Host "[GitNexus] index exists and repo is clean."
  }
}
finally {
  Pop-Location
}
