param([switch]$Force)
$ErrorActionPreference = "Stop"
$Manifest = Get-Content -Raw (Join-Path $PSScriptRoot "manifest.json") | ConvertFrom-Json

$Os = if ($IsWindows) { "windows" } elseif ($IsMacOS) { "darwin" } else { "linux" }
$Arch = switch ([System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString()) {
  "Arm64" { "arm64" }
  default { "amd64" }
}
$Key = "$Os-$Arch"
$Asset = $Manifest.assets.$Key
if (-not $Asset) { throw "Unsupported platform: $Key" }

$InstallRoot = if ($Os -eq "windows") {
  [Environment]::ExpandEnvironmentVariables($Manifest.installDirs.windows)
} elseif ($Os -eq "darwin") {
  $Manifest.installDirs.darwin.Replace('$HOME', $HOME)
} else {
  $Manifest.installDirs.linux.Replace('$HOME', $HOME)
}

$BinaryName = if ($Os -eq "windows") { "codebase-memory-mcp.exe" } else { "codebase-memory-mcp" }
$Target = Join-Path $InstallRoot $BinaryName
if ((Test-Path $Target) -and -not $Force) { Write-Host "Already installed: $Target"; exit 0 }

$TempRoot = [System.IO.Path]::GetTempPath()
$Url = "$($Manifest.upstream)/releases/download/v$($Manifest.version)/$($Asset.archive)"
$Temp = Join-Path $TempRoot $Asset.archive
$Extract = Join-Path $TempRoot "codebase-memory-mcp-$($Manifest.version)-$Key"
Invoke-WebRequest -Uri $Url -OutFile $Temp
$Actual = (Get-FileHash $Temp -Algorithm SHA256).Hash.ToLowerInvariant()
if ($Actual -ne $Asset.sha256) { throw "Checksum mismatch: $Actual" }
if (Test-Path $Extract) { Remove-Item -LiteralPath $Extract -Recurse -Force }
New-Item -ItemType Directory -Force -Path $Extract | Out-Null

if ($Asset.archive.EndsWith(".zip")) {
  Expand-Archive -LiteralPath $Temp -DestinationPath $Extract -Force
} else {
  & tar -xzf $Temp -C $Extract
  if ($LASTEXITCODE -ne 0) { throw "Tar extract failed" }
}

$Exe = Get-ChildItem $Extract -Recurse -File | Where-Object { $_.Name -eq $BinaryName } | Select-Object -First 1
if (-not $Exe) { throw "Binary not found in verified archive" }
New-Item -ItemType Directory -Force -Path $InstallRoot | Out-Null
Copy-Item -LiteralPath $Exe.FullName -Destination $Target -Force
if (-not $IsWindows) { & chmod +x $Target }
Remove-Item -LiteralPath $Temp -Force
Remove-Item -LiteralPath $Extract -Recurse -Force
& $Target --version
Write-Host "Installed: $Target"
