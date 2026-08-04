param(
    [Parameter(Mandatory=$true)]
    [string]$Service,
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
    throw "Service '$Service' is not running on stack '$projectName'. Start stack first with: docker compose up -d"
}

$seedScript = if ($Env.DATA_PATH) { $Env.DATA_PATH } else { 'automation/scripts/compose/seed-data.sh' }

docker cp "$seedScript" "${container}:/app/_seed_data.sh"
docker exec $container bash -c "chmod +x /app/_seed_data.sh && /app/_seed_data.sh"
