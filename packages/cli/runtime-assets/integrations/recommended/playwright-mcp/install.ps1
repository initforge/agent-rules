param([switch]$Force)
$ErrorActionPreference = "Stop"

$Manifest = Get-Content -Raw (Join-Path $PSScriptRoot "manifest.json") | ConvertFrom-Json
Write-Host "Ensuring Playwright MCP package resolvable via npx: $($Manifest.npmPackage)"
& npx -y "$($Manifest.npmPackage)@$($Manifest.version)" --help *> $null
if ($LASTEXITCODE -ne 0) { throw "Playwright MCP npx failed" }

# Browser binary for agent sessions
& npx -y playwright-core@1.62.0-alpha-1783623505000 install chromium
if ($LASTEXITCODE -ne 0) {
  Write-Host "WARN: playwright install chromium failed - agent may auto-download on first run"
} else {
  Write-Host "Playwright Chromium ready"
}
Write-Host "Installed Playwright MCP (npx)"
