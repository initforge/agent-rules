$ErrorActionPreference = "Stop"
$PSScriptRootResolved = $PSScriptRoot
$RepoRoot = Split-Path -Parent $PSScriptRootResolved
$Harness = Join-Path $RepoRoot "projects\5fedu"

$Problems = [System.Collections.Generic.List[string]]::new()

# R1: Scan generic content for project-specific patterns
$ScanFiles = @(
  "decisions.md",
  "AGENTS.md",
  "00-context-map.md",
  "open-questions.md",
  "README.md",
  "sync-flow.md"
)
# Add all files in domains/
if (Test-Path (Join-Path $Harness "domains")) {
  Get-ChildItem (Join-Path $Harness "domains") -File -Recurse | ForEach-Object {
    $ScanFiles += "domains/$($_.FullName.Substring((Join-Path $Harness "domains").Length + 1).Replace('\', '/'))"
  }
}

$ForbiddenContentPatterns = @(
  "NOSTIME APP",
  "tah-app\.vercel",
  "linhnxdeveloper",
  "1ROjN7"
)

foreach ($RelFile in $ScanFiles) {
  $Path = Join-Path $Harness ($RelFile -replace "/", "\")
  if (-not (Test-Path $Path)) { continue }
  $Content = Get-Content -Raw -Encoding UTF8 $Path
  foreach ($Pattern in $ForbiddenContentPatterns) {
    if ($Content -match $Pattern) {
      $Problems.Add("Purity error [R1]: File '$RelFile' contains forbidden pattern '$Pattern'.")
    }
  }
}

# R2: project-local/ must only contain README.md
$PlDir = Join-Path $Harness "project-local"
if (Test-Path $PlDir) {
  Get-ChildItem $PlDir -File -Recurse | ForEach-Object {
    if ($_.Name -ne "README.md") {
      $Problems.Add("Purity error [R2]: Non-README file found in template project-local: $($_.Name)")
    }
  }
}

# R3: install-metadata.md must not exist in template
if (Test-Path (Join-Path $Harness "install-metadata.md")) {
  $Problems.Add("Purity error [R3]: install-metadata.md must not exist in template harness.")
}

# R4: project-overlay/ must not exist in template
if (Test-Path (Join-Path $Harness "project-overlay")) {
  $Problems.Add("Purity error [R4]: project-overlay/ directory must not exist in template harness. Use archive/nostime/ instead.")
}

# R5: legacy/ must not exist in template
if (Test-Path (Join-Path $Harness "legacy")) {
  $Problems.Add("Purity error [R5]: legacy/ directory must not exist in template harness.")
}

if ($Problems.Count -gt 0) {
  foreach ($Problem in $Problems) {
    Write-Error $Problem
  }
  exit 1
}

Write-Host "5fedu template purity audit PASS"
exit 0
