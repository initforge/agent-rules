param(
  [Parameter(Mandatory = $true)]
  [string]$PlanRoot
)

$ErrorActionPreference = "Stop"

$resolved = Resolve-Path -LiteralPath $PlanRoot -ErrorAction Stop
$root = $resolved.Path

$problems = New-Object System.Collections.Generic.List[string]

function Add-Problem([string]$Message) {
  $problems.Add($Message) | Out-Null
}

function Test-NumberedFiles([string]$Directory) {
  $files = Get-ChildItem -LiteralPath $Directory -File -Filter "*.md" |
    Where-Object { $_.Name -match "^\d{2}-.+\.md$" } |
    Sort-Object Name

  if ($files.Count -eq 0) {
    return
  }

  $numbers = @()
  foreach ($file in $files) {
    if ($file.Name -match "^(\d{2})-.+\.md$") {
      $numbers += [int]$Matches[1]
    }
  }

  if ($numbers -contains 0) {
    $index = Join-Path $Directory "00-index.md"
    if (-not (Test-Path -LiteralPath $index)) {
      Add-Problem "Missing 00-index.md in $Directory"
    }
  }

  $executionNumbers = $numbers | Where-Object { $_ -gt 0 } | Sort-Object
  if ($executionNumbers.Count -eq 0) {
    return
  }

  for ($i = 0; $i -lt $executionNumbers.Count; $i++) {
    $expected = $i + 1
    $actual = $executionNumbers[$i]
    if ($actual -ne $expected) {
      Add-Problem "Non-contiguous plan numbering in ${Directory}: expected $("{0:D2}" -f $expected), found $("{0:D2}" -f $actual)"
      break
    }
  }
}

function Test-LargeRootPlan([System.IO.FileInfo]$File) {
  $content = Get-Content -LiteralPath $File.FullName -Raw -Encoding UTF8
  $domainHits = 0
  foreach ($pattern in @(
      "secret",
      "migration",
      "database",
      "CI",
      "Docker",
      "infra",
      "API",
      "frontend",
      "go-live",
      "staging",
      "bridge"
    )) {
    if ($content -match [regex]::Escape($pattern)) {
      $domainHits++
    }
  }

  if ($File.Name -match "^(0[1-9]|[1-9][0-9])-.+\.md$" -and $domainHits -ge 5) {
    Add-Problem "Possible mega-plan at $($File.FullName). Split multi-domain execution work into plan/<feature>/00-index.md plus contiguous slice files."
  }
}

if ((Split-Path -Leaf $root) -ne "plan") {
  Add-Problem "PlanRoot should point to a plan directory, got: $root"
}

Test-NumberedFiles $root

Get-ChildItem -LiteralPath $root -Directory | ForEach-Object {
  Test-NumberedFiles $_.FullName
}

Get-ChildItem -LiteralPath $root -File -Filter "*.md" | ForEach-Object {
  Test-LargeRootPlan $_
}

if ($problems.Count -gt 0) {
  Write-Host "Plan structure check: FAIL"
  foreach ($problem in $problems) {
    Write-Host "- $problem"
  }
  exit 1
}

Write-Host "Plan structure check: PASS"
