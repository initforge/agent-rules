param(
    [Parameter(Mandatory=$true)]
    [string]$Service,
    [string]$SourceFile,
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

$absSource = Resolve-Path $SourceFile -ErrorAction Stop
docker cp $absSource "${container}:/app/_import_data"
docker exec $container bash -c "/import.sh /app/_import_data"
