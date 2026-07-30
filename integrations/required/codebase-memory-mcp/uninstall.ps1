$ErrorActionPreference = "Stop"
$Manifest = Get-Content -Raw (Join-Path $PSScriptRoot "manifest.json") | ConvertFrom-Json
if ($IsLinux) { $Platform = "linux" }
elseif ($IsMacOS) { $Platform = "darwin" }
else { $Platform = "windows" }
$InstallDir = [Environment]::ExpandEnvironmentVariables($Manifest.installDirs.$Platform)
if (Test-Path $InstallDir) {
  $Resolved = (Resolve-Path $InstallDir).Path
  $Expected = [Environment]::ExpandEnvironmentVariables($Manifest.installDirs.$Platform)
  if ($Resolved -ne $Expected) { throw "Refusing unexpected path: $Resolved" }
  Remove-Item -LiteralPath $Resolved -Recurse -Force
}
