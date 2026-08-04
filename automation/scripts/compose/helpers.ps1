# Shared helper functions for compose operations
param()

function Find-ComposeProjectRoot {
    param([string]$StartPath)

    $candidate = $StartPath
    while ($candidate) {
        if (Test-Path (Join-Path $candidate 'docker-compose.yml')) { return $candidate }
        if (Test-Path (Join-Path $candidate 'docker-compose.yaml')) { return $candidate }
        $parent = Split-Path -Parent $candidate
        if ($parent -eq $candidate -or -not $parent) { break }
        $candidate = $parent
    }
    return $null
}

function Get-ComposeRoot {
    param([string]$Root)

    $candidate = Join-Path $Root 'docker-compose.yml'
    if (Test-Path $candidate) {
        return $Root
    }

    $subproject = Get-ChildItem -Path $Root -Directory -Depth 1 -ErrorAction SilentlyContinue | Where-Object {
        Test-Path (Join-Path $_.FullName 'docker-compose.yml')
    } | Select-Object -First 1

    if ($subproject) {
        return $subproject.FullName
    }

    throw "No docker-compose.yml found in $Root or subdirectories"
}

function Get-ComposeProjectName {
    param([string]$ComposeRoot)

    $projectName = Split-Path -Leaf $ComposeRoot
    if (Test-Path (Join-Path $ComposeRoot '.env')) {
        $envVars = Get-Content (Join-Path $ComposeRoot '.env') -ErrorAction SilentlyContinue | Where-Object { $_ -match '^COMPOSE_PROJECT_NAME=' }
        if ($envVars) {
            return $envVars -replace '^COMPOSE_PROJECT_NAME=\s*', ''
        }
    }

    return $projectName
}