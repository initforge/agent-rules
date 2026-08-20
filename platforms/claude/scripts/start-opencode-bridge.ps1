param(
  [string]$Root = (Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))),
  [string]$OpenCodeConfig = "",
  [string]$ContainerName = "claude-opencode-bridge",
  [int]$Port = 4000,
  [switch]$WhatIf
)

# Run an Anthropic-to-OpenAI LiteLLM bridge so Claude Code can use the same
# OpenCode provider without sending Anthropic Messages directly to an
# OpenAI-compatible endpoint.
$ErrorActionPreference = "Stop"
$UserHome = if ($env:USERPROFILE) { $env:USERPROFILE } elseif ($env:HOME) { $env:HOME } else { throw "Cannot resolve user home" }
$SourceConfig = if ($OpenCodeConfig) { [IO.Path]::GetFullPath($OpenCodeConfig) } else { Join-Path $UserHome ".config\opencode\opencode.json" }
$BridgeConfig = Join-Path $Root "platforms\claude\bridge\litellm-opencode.yaml"
$BridgeKey = "local-claude-opencode-bridge"

if (-not (Test-Path -LiteralPath $BridgeConfig -PathType Leaf)) { throw "Bridge config is missing: $BridgeConfig" }
if (-not (Test-Path -LiteralPath $SourceConfig -PathType Leaf)) { throw "OpenCode config is missing: $SourceConfig" }
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw "Docker is required to run the Claude/OpenCode bridge" }

$OpenCode = Get-Content -Raw -Encoding UTF8 -LiteralPath $SourceConfig | ConvertFrom-Json
$ProviderName = [string]@($OpenCode.enabled_providers)[0]
$Provider = $OpenCode.provider.PSObject.Properties[$ProviderName].Value
$ApiKey = [string]$Provider.options.apiKey
if ($ApiKey -match '^\{env:([^}]+)\}$') {
  $ApiKey = [Environment]::GetEnvironmentVariable($Matches[1], "Process")
  if (-not $ApiKey) { $ApiKey = [Environment]::GetEnvironmentVariable($Matches[1], "User") }
}
if (-not $ApiKey) { throw "OpenCode provider API key is missing" }

if ($WhatIf) {
  Write-Host "Would run Docker container: $ContainerName"
  Write-Host "Would bind local port: $Port"
  Write-Host "Would use OpenCode provider: $ProviderName"
  return
}

$Existing = @(docker ps -a --filter "name=^/$ContainerName$" --format "{{.Names}}" 2>$null)
if ($Existing -contains $ContainerName) {
  docker rm -f $ContainerName | Out-Null
}

$ResolvedConfig = [IO.Path]::GetFullPath($BridgeConfig)
$DockerArgs = @(
  "run", "-d", "--name", $ContainerName, "--restart", "unless-stopped",
  "-p", "127.0.0.1:$Port`:4000",
  "-v", "${ResolvedConfig}:/app/config.yaml:ro",
  "-e", "QWENCODER_API_KEY=$ApiKey",
  "-e", "LITELLM_MASTER_KEY=$BridgeKey",
  "ghcr.io/berriai/litellm:main-latest",
  "--config", "/app/config.yaml", "--host", "0.0.0.0", "--port", "4000"
)
$ContainerId = & docker @DockerArgs
if ($LASTEXITCODE -ne 0) { throw "LiteLLM bridge failed to start" }
Write-Host "LiteLLM bridge started: $ContainerName ($($ContainerId.Trim()))"

& (Join-Path $PSScriptRoot "sync-opencode-parity.ps1") -Root $Root -UseLocalBridge -BridgeApiKey $BridgeKey
if ($LASTEXITCODE -ne 0) { throw "Claude settings sync to local bridge failed" }

$Ready = $false
$SavedErrorActionPreference = $ErrorActionPreference
$ErrorActionPreference = "Continue"
try {
  for ($i = 0; $i -lt 45; $i++) {
    $Status = & curl.exe --max-time 2 -sS -o NUL -w "%{http_code}" -H "Authorization: Bearer $BridgeKey" "http://127.0.0.1:$Port/health/readiness" 2>$null
    if ($LASTEXITCODE -eq 0 -and [string]$Status -eq "200") { $Ready = $true; break }
    Start-Sleep -Seconds 1
  }
} finally {
  $ErrorActionPreference = $SavedErrorActionPreference
}
if (-not $Ready) { throw "LiteLLM bridge did not become ready on http://127.0.0.1:$Port" }
Write-Host "LiteLLM bridge ready on http://127.0.0.1:$Port"
