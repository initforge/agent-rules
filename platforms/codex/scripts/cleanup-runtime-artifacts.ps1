param(
  [string]$Root = (Get-Location).Path,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

$resolved = (Resolve-Path -LiteralPath $Root).Path
$targets = @()

$targets += Get-ChildItem -LiteralPath $resolved -Recurse -Directory -Force -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -in @("__pycache__", ".pytest_cache", ".ruff_cache") }

$targets += Get-ChildItem -LiteralPath $resolved -Recurse -File -Force -ErrorAction SilentlyContinue |
  Where-Object {
    $_.Name -like "*.pyc" -or
    $_.Name -like "*.tmp" -or
    $_.Name -like "*.bak" -or
    $_.Name -like "*.log"
  }

foreach ($target in $targets) {
  if (-not (Test-Path -LiteralPath $target.FullName)) {
    continue
  }

  $full = (Resolve-Path -LiteralPath $target.FullName).Path
  if (-not $full.StartsWith($resolved, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to remove outside root: $full"
  }

  if ($DryRun) {
    Write-Host "[DRY] remove $full"
  } else {
    Remove-Item -LiteralPath $full -Recurse -Force
    Write-Host "[Cleanup] removed $full"
  }
}

Write-Host "Cleanup scan completed. Count: $($targets.Count)"
