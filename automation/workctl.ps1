[CmdletBinding()]
param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$WorkctlArgs
)

$ErrorActionPreference = "Stop"
$ScriptPath = Join-Path $PSScriptRoot "workctl.py"
$Python = $null

foreach ($Candidate in @("python", "python3", "py")) {
  $Resolved = Get-Command $Candidate -ErrorAction SilentlyContinue
  if ($Resolved) {
    $Python = $Resolved.Source
    break
  }
}

if (-not $Python) {
  throw "Python 3 is required for workctl."
}

& $Python $ScriptPath @WorkctlArgs
exit $LASTEXITCODE
