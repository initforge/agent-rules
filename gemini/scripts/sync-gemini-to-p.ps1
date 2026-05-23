param(
  [string]$GeminiHome = "$env:USERPROFILE\.gemini",
  [string]$RulesRoot = "P:\agent-rules",
  [switch]$Backup = $true
)

$ErrorActionPreference = "Stop"

$ts = Get-Date -Format "yyyyMMdd-HHmmss"
$target = Join-Path $RulesRoot "gemini"

New-Item -ItemType Directory -Force -Path $RulesRoot | Out-Null

if ($Backup -and (Test-Path $target)) {
  Copy-Item $target "$target.bak.$ts" -Recurse -Force
}

if (Test-Path $target) {
  Remove-Item $target -Recurse -Force
}

New-Item -ItemType Directory -Force -Path $target | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $target "scripts") | Out-Null

# Copy global and CLI configs
$configsToCopy = @(
  @{ Src = Join-Path $GeminiHome "config\mcp_config.json"; Dest = Join-Path $target "mcp_config.json" },
  @{ Src = Join-Path $GeminiHome "config\hooks.json"; Dest = Join-Path $target "hooks.json" },
  @{ Src = Join-Path $GeminiHome "settings.json"; Dest = Join-Path $target "settings.json" },
  @{ Src = Join-Path $GeminiHome "antigravity-cli\settings.json"; Dest = Join-Path $target "antigravity-cli-settings.json" }
)

foreach ($config in $configsToCopy) {
  if (Test-Path $config.Src) {
    Copy-Item $config.Src $config.Dest -Force
  }
}

# Copy scripts
$scriptsSrc = Join-Path $GeminiHome "config\scripts"
if (Test-Path $scriptsSrc) {
  Copy-Item "$scriptsSrc\*" (Join-Path $target "scripts") -Recurse -Force
}

Write-Host "[Sync-Gemini] $GeminiHome configs -> $target"
