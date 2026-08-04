param(
    [Parameter(Mandatory=$true)]
    [string]$Service,
    [string]$EventType,
    [string]$PayloadJson,
    [hashtable]$Env = @{},
    [string]$Root = $null
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'helpers.ps1')

if (-not $Root) {
    $Root = Find-ComposeProjectRoot -StartPath $PSScriptRoot
    if (-not $Root) { throw "No docker-compose.yml found above $PSScriptRoot" }
}

$projectName = Split-Path -Leaf $Root
$container = docker ps --filter "name=$projectName-$Service" --filter 'status=running' -q 2>$null
if (-not $container) {
    throw "Service '$Service' is not running. Start stack first: docker compose up -d"
}

$eventObj = @{
    type = $EventType
    payload = $PayloadJson | ConvertFrom-Json
    timestamp = (Get-Date).ToUniversalTime().ToString("o")
}
$eventJson = $eventObj | ConvertTo-Json -Compress
docker exec -i $container bash -c "echo '$eventJson' | /event-inject.sh"
