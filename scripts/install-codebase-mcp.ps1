<#
.SYNOPSIS
Installs the DeusData codebase-memory-mcp binary for Windows.

.DESCRIPTION
Downloads the latest release of codebase-memory-mcp from GitHub, extracts it to the Antigravity bin directory,
and provides the JSON snippet for MCP configuration.

.EXAMPLE
.\install-codebase-mcp.ps1
#>

$ErrorActionPreference = "Stop"

$repo = "DeusData/codebase-memory-mcp"
$installDir = "$env:USERPROFILE\.gemini\bin"
$binName = "codebase-memory-mcp.exe"
$targetPath = Join-Path $installDir $binName

Write-Host "Fetching latest release of $repo..." -ForegroundColor Cyan
$releaseUrl = "https://api.github.com/repos/$repo/releases/latest"
$release = Invoke-RestMethod -Uri $releaseUrl

# Identify the correct asset for Windows
$asset = $release.assets | Where-Object { $_.name -match "windows-amd64\.zip$" -and $_.name -notmatch "ui-windows" }

if (-not $asset) {
    Write-Host "Could not find a Windows amd64 zip asset in the latest release." -ForegroundColor Red
    exit 1
}

$downloadUrl = $asset.browser_download_url
$zipPath = Join-Path $env:TEMP $asset.name

Write-Host "Downloading $($asset.name) from $downloadUrl..." -ForegroundColor Cyan
Invoke-WebRequest -Uri $downloadUrl -OutFile $zipPath

Write-Host "Creating directory $installDir if it doesn't exist..." -ForegroundColor Cyan
if (-not (Test-Path $installDir)) {
    New-Item -ItemType Directory -Force -Path $installDir | Out-Null
}

Write-Host "Extracting to $installDir..." -ForegroundColor Cyan
Expand-Archive -Path $zipPath -DestinationPath $installDir -Force

# Note: The zip might contain a folder or just the executable. Let's find the .exe inside the dest folder.
$extractedExe = Get-ChildItem -Path $installDir -Filter "*.exe" -Recurse | Where-Object { $_.Name -match "codebase-memory-mcp" } | Select-Object -First 1

if ($extractedExe) {
    if ($extractedExe.FullName -ne $targetPath) {
        Move-Item -Path $extractedExe.FullName -Destination $targetPath -Force
    }
    Write-Host "`nInstallation successful! Binary placed at: $targetPath" -ForegroundColor Green
    
    # Try to verify version
    try {
        $versionInfo = & $targetPath --version 2>&1
        Write-Host "Installed Version: $versionInfo" -ForegroundColor Green
    } catch {
        Write-Host "Could not print version, but file exists." -ForegroundColor Yellow
    }
} else {
    Write-Host "Extraction failed or could not find codebase-memory-mcp.exe in zip." -ForegroundColor Red
}

# Clean up
Remove-Item -Path $zipPath -Force

Write-Host "`n--- MCP CONFIGURATION SNIPPET ---" -ForegroundColor Yellow
Write-Host "Add the following to your MCP configuration (e.g. claude_desktop_config.json or Antigravity config):"
Write-Host @"
{
  "mcpServers": {
    "codebase-memory": {
      "command": "$($targetPath.Replace('\', '\\'))",
      "args": []
    }
  }
}
"@
Write-Host "---------------------------------" -ForegroundColor Yellow
