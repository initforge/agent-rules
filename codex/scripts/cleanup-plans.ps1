param(
  [Parameter(Mandatory = $true)]
  [string]$PlanRoot,
  [switch]$All,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

$root = (Resolve-Path -LiteralPath $PlanRoot).Path

if ((Split-Path -Leaf $root) -ne "plan") {
  throw "PlanRoot should point to a plan directory, got: $root"
}

$candidates = New-Object System.Collections.Generic.List[System.IO.FileInfo]

function Get-PlanStatus([string]$Path) {
  $content = Get-Content -LiteralPath $Path -Raw -Encoding UTF8
  if ($content -match "(?im)^Status:\s*(\w+)") {
    return $Matches[1].ToLowerInvariant()
  }
  return "unknown"
}

if ($All) {
  Get-ChildItem -LiteralPath $root -Recurse -File -Filter "*.md" | ForEach-Object {
    $candidates.Add($_) | Out-Null
  }
} else {
  Get-ChildItem -LiteralPath $root -Recurse -File -Filter "*.md" | ForEach-Object {
    $status = Get-PlanStatus $_.FullName
    if ($status -in @("done", "obsolete")) {
      $candidates.Add($_) | Out-Null
    }
  }
}

if ($candidates.Count -eq 0) {
  Write-Host "No plan files matched cleanup policy."
  exit 0
}

Write-Host "Plan cleanup candidates:"
foreach ($file in $candidates) {
  $status = Get-PlanStatus $file.FullName
  Write-Host "- $($file.FullName) | Status: $status"
}

if ($DryRun) {
  Write-Host "Dry run only. No files deleted."
  exit 0
}

foreach ($file in $candidates) {
  Remove-Item -LiteralPath $file.FullName -Force
}

Write-Host "Deleted $($candidates.Count) plan file(s)."
