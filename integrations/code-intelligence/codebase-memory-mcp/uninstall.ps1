$ErrorActionPreference = "Stop"
$Manifest = Get-Content -Raw (Join-Path $PSScriptRoot "manifest.json") | ConvertFrom-Json
$InstallDir = [Environment]::ExpandEnvironmentVariables($Manifest.installDir)
if (Test-Path $InstallDir) {
  $Resolved = (Resolve-Path $InstallDir).Path
  $Expected = [Environment]::ExpandEnvironmentVariables("%LOCALAPPDATA%\Programs\codebase-memory-mcp")
  if ($Resolved -ne $Expected) { throw "Refusing unexpected path: $Resolved" }
  Remove-Item -LiteralPath $Resolved -Recurse -Force
}
