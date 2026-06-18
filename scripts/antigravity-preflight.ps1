$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$adapter = Join-Path (Split-Path -Parent $here) "platforms\antigravity\scripts\antigravity-preflight.ps1"
if (-not (Test-Path -LiteralPath $adapter)) {
  throw "Missing adapter preflight: $adapter"
}
& $adapter @args