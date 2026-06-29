param([switch]$Force)
$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot
$Manifest = Get-Content -Raw (Join-Path $Root "manifest.json") | ConvertFrom-Json
$InstallDir = [Environment]::ExpandEnvironmentVariables($Manifest.installDir)
$Target = Join-Path $InstallDir "codebase-memory-mcp.exe"
if ((Test-Path $Target) -and -not $Force) { Write-Host "Already installed: $Target"; exit 0 }
$Url = "$($Manifest.upstream)/releases/download/v$($Manifest.version)/$($Manifest.windowsArchive)"
$Temp = Join-Path $env:TEMP $Manifest.windowsArchive
$Extract = Join-Path $env:TEMP "codebase-memory-mcp-$($Manifest.version)"
Invoke-WebRequest -Uri $Url -OutFile $Temp
$Actual = (Get-FileHash $Temp -Algorithm SHA256).Hash.ToLowerInvariant()
if ($Actual -ne $Manifest.windowsArchiveSha256) { throw "Checksum mismatch: $Actual" }
if (Test-Path $Extract) { Remove-Item -LiteralPath $Extract -Recurse -Force }
Expand-Archive -LiteralPath $Temp -DestinationPath $Extract -Force
$Exe = Get-ChildItem $Extract -Recurse -File -Filter "codebase-memory-mcp.exe" | Select-Object -First 1
if (-not $Exe) { throw "Binary not found in verified archive" }
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
Copy-Item -LiteralPath $Exe.FullName -Destination $Target -Force
Remove-Item -LiteralPath $Temp -Force
Remove-Item -LiteralPath $Extract -Recurse -Force
& $Target --version
Write-Host "Installed: $Target"
