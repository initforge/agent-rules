param(
    [Parameter(Mandatory=$true)]
    [string]$Service,
    [string]$MockFile,
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

$absMock = Resolve-Path $MockFile -ErrorAction Stop
docker cp $absMock "${container}:/app/_mock_data.json"
docker exec $container bash -c "/mock.sh /app/_mock_data.json"
