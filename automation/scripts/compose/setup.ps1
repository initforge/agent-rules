param(
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

docker compose --project-name $projectName --project-directory $Root up -d

docker compose --project-name $projectName --project-directory $Root ps

$configService = if ($Env.CONFIG_SERVICE) { $Env.CONFIG_SERVICE } else { 'config' }
$configContainer = docker ps --filter "name=$projectName-$configService" --filter 'status=running' -q 2>$null
if ($configContainer) {
    $configJson = $Env | ConvertTo-Json -Compress
    echo $configJson | docker exec -i $configContainer bash -c 'cat > /app/config/runtime.json'
}
