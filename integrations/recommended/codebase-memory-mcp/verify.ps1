$ErrorActionPreference = "Stop"
$Manifest = Get-Content -Raw (Join-Path $PSScriptRoot "manifest.json") | ConvertFrom-Json
$Os = if ([System.Runtime.InteropServices.RuntimeInformation]::IsOSPlatform([System.Runtime.InteropServices.OSPlatform]::Windows)) {
  "windows"
} elseif ([System.Runtime.InteropServices.RuntimeInformation]::IsOSPlatform([System.Runtime.InteropServices.OSPlatform]::OSX)) {
  "darwin"
} else {
  "linux"
}
$InstallRoot = if ($Os -eq "windows") {
  [Environment]::ExpandEnvironmentVariables($Manifest.installDirs.windows)
} elseif ($Os -eq "darwin") {
  $Manifest.installDirs.darwin.Replace('$HOME', $HOME)
} else {
  $Manifest.installDirs.linux.Replace('$HOME', $HOME)
}
$BinaryName = if ($Os -eq "windows") { "codebase-memory-mcp.exe" } else { "codebase-memory-mcp" }
$Bin = Join-Path $InstallRoot $BinaryName
if (-not (Test-Path $Bin)) { throw "Missing binary: $Bin" }
$Version = & $Bin --version 2>&1
if ($LASTEXITCODE -ne 0) { throw "Binary failed: $Version" }
Write-Host "Codebase MCP PASS: $Version"
Write-Host $Bin
