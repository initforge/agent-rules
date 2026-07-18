[CmdletBinding()]
param(
  [string]$Root = (Split-Path -Parent $PSScriptRoot),
  [Parameter(Mandatory=$true)][string]$LedgerPath,
  [switch]$Strict
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "path-compat.ps1")
$problems = [System.Collections.Generic.List[string]]::new()
$warnings = [System.Collections.Generic.List[string]]::new()

if (-not (Test-Path -LiteralPath $LedgerPath -PathType Leaf)) {
  $problems.Add("Ledger not found: $LedgerPath")
} else {
  $body = [IO.File]::ReadAllText((Resolve-Path -LiteralPath $LedgerPath), [Text.Encoding]::UTF8)
  if ($body -notmatch "(?im)^\s*Slice ID\s*:") { $problems.Add("Ledger is missing 'Slice ID:' scope identity") }
  if ($body -notmatch "(?im)^\s*Scope IN\s*:") { $problems.Add("Ledger is missing 'Scope IN:'") }
  if ($body -notmatch "(?im)^\s*Scope OUT\s*:") { $warnings.Add("Ledger has no explicit Scope OUT") }
  $acLines = @([regex]::Matches($body, "(?im)^\s*-\s*\[(?<mark>[ x!])\]\s*(?<text>.+)$") | ForEach-Object {
    [pscustomobject]@{ mark = $_.Groups["mark"].Value; text = $_.Groups["text"].Value.Trim(); index = $_.Index }
  })
  if ($acLines.Count -eq 0) { $problems.Add("Ledger has no acceptance-criteria checkboxes") }
  if (@($acLines | Where-Object mark -eq " ").Count -gt 0) { $problems.Add("Ledger still has open AC: $(@($acLines | Where-Object mark -eq ' ' | ForEach-Object text) -join '; ')") }
  if (@($acLines | Where-Object mark -eq "!").Count -gt 0) { $problems.Add("Ledger has blocker AC: $(@($acLines | Where-Object mark -eq '!' | ForEach-Object text) -join '; ')") }
  $normalized = @{}
  foreach ($ac in $acLines) {
    $key = ($ac.text -replace "(?i)\bverify\s*:.*$", "" -replace "[^a-z0-9]+", " ").Trim().ToLowerInvariant()
    if ($key -and $normalized.ContainsKey($key)) { $problems.Add("Duplicate AC text: $($ac.text)") } elseif ($key) { $normalized[$key] = $true }
    $nextBoundary = $body.Length
    $next = $acLines | Where-Object { $_.index -gt $ac.index } | Sort-Object index | Select-Object -First 1
    if ($next) { $nextBoundary = $next.index }
    $segment = $body.Substring($ac.index, $nextBoundary - $ac.index)
    if ($ac.mark -eq "x") {
      if ($segment -notmatch "(?im)^\s*verify\s*:\s*\S+") { $problems.Add("Checked AC lacks a concrete verify command: $($ac.text)") }
      if ($segment -match "(?im)^\s*evidence\s*:\s*(?:<[^>]+>|$)") { $problems.Add("Checked AC lacks real evidence: $($ac.text)") }
      if ($segment -notmatch "(?im)^\s*evidence\s*:\s*\S+") { $problems.Add("Checked AC lacks evidence line: $($ac.text)") }
    }
  }
  if ($body -match "(?im)^\s*Status\s*:\s*PASS\s*$" -and $problems.Count -gt 0) { $problems.Add("Report claims PASS while ledger gate is not clean") }
  if ($body -match "(?im)evidence\s*:\s*(?:<not-run>|<not run>|<pending>)") { $problems.Add("Ledger contains placeholder evidence") }
}

foreach ($warning in $warnings) { Write-Host "WARN: $warning" }
foreach ($problem in $problems) { Write-Host "FAIL: $problem" }
if ($problems.Count -gt 0) {
  Write-Host "FAIL: slice ledger audit ($LedgerPath)"
  exit 1
}
Write-Host "PASS: slice ledger audit ($LedgerPath); open_ac=0; blockers=0"
exit 0
