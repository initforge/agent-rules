param(
    [Parameter(Mandatory=$true)]
    [string]$Service,
    [string]$Migration,
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

$migrationPath = "migrations/$Migration.sql"
if (Test-Path (Join-Path $Root $migrationPath)) {
    docker cp (Join-Path $Root $migrationPath) "${container}:/app/_migration.sql"
    docker exec $container bash -c "/migrate.sh /app/_migration.sql"
} else {
    throw "Migration file not found: $migrationPath"
}
