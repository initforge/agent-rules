param(
  [string]$RepoRoot = (Get-Location).Path,
  [switch]$Force = $false
)

$ErrorActionPreference = "Stop"

$skillRoot = Split-Path -Parent $PSScriptRoot
$sourceRoot = Join-Path $skillRoot "assets\project-context"

if (-not (Test-Path $sourceRoot)) {
  throw "Missing template source: $sourceRoot"
}

$repo = (Resolve-Path $RepoRoot).Path
$agentsPath = Join-Path $repo "AGENTS.md"
$targetContext = Join-Path $repo ".agents\5fedu"

# Separate project-specific custom files vs shared rules/lessons
$sharedFiles = @(
  "00-index.md",
  "02-database-and-auth-rules.md",
  "03-ui-ux-and-delivery-standards.md"
)

$isAlreadyScaffolded = (Test-Path $targetContext)

if ($isAlreadyScaffolded -and -not $Force) {
  Write-Host "[5fedu] Project is already scaffolded. Performing intelligent update..."
  
  # Copy/overwrite only shared lessons and rules
  $src5fedu = Join-Path $sourceRoot ".agents\5fedu"
  foreach ($file in $sharedFiles) {
    $srcFile = Join-Path $src5fedu $file
    $dstFile = Join-Path $targetContext $file
    if (Test-Path $srcFile) {
      Copy-Item -Path $srcFile -Destination $dstFile -Force
      Write-Host "  -> Updated shared rules file: $file"
    }
  }
  
  # Check and copy other files ONLY if they don't exist
  $allFiles = Get-ChildItem (Join-Path $sourceRoot ".agents\5fedu") -File
  foreach ($file in $allFiles) {
    if ($sharedFiles -notcontains $file.Name) {
      $dstFile = Join-Path $targetContext $file.Name
      if (-not (Test-Path $dstFile)) {
        Copy-Item -Path $file.FullName -Destination $dstFile -Force
        Write-Host "  -> Initialized missing project-specific file: $($file.Name)"
      } else {
        Write-Host "  -> Preserved custom project-specific file: $($file.Name)"
      }
    }
  }
} else {
  # Full scaffold or Force overwrite
  Write-Host "[5fedu] Performing full project scaffolding..."
  New-Item -ItemType Directory -Force -Path $repo | Out-Null
  
  # Copy AGENTS.md if not exists or Force
  if (-not (Test-Path $agentsPath) -or $Force) {
    Copy-Item -LiteralPath (Join-Path $sourceRoot "AGENTS.md") -Destination $agentsPath -Force
    Write-Host "  -> Wrote AGENTS.md"
  }
  
  # Copy the whole .agents folder
  $srcAgents = Join-Path $sourceRoot ".agents"
  $dstAgents = Join-Path $repo ".agents"
  New-Item -ItemType Directory -Force -Path $dstAgents | Out-Null
  Copy-Item -Path "$srcAgents\*" -Destination $dstAgents -Recurse -Force
  
  # Also write legacy mirror .agent for compatibility if it is configured
  $legacyDir = Join-Path $repo ".agent"
  if (Test-Path $legacyDir) {
    Copy-Item -Path "$srcAgents\*" -Destination $legacyDir -Recurse -Force
  }
}

Write-Host "[5fedu] Installation and sync completed for $repo"
