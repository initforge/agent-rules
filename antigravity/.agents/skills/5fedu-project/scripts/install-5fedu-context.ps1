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
$targetCodexContext = Join-Path $repo ".codex\5fedu"

# Separate project-specific custom files vs shared rules/lessons
$sharedFiles = @(
  "00-index.md",
  "02-database-and-auth-rules.md",
  "03-ui-ux-and-delivery-standards.md"
)

$isAlreadyScaffolded = (Test-Path $targetContext) -or (Test-Path $targetCodexContext)

if ($isAlreadyScaffolded -and -not $Force) {
  Write-Host "[5fedu] Project is already scaffolded. Performing intelligent update..."
  
  # Copy/overwrite only shared lessons and rules
  foreach ($target in @($targetContext, $targetCodexContext)) {
    New-Item -ItemType Directory -Force -Path $target | Out-Null
    foreach ($srcFolder in @(".agents\5fedu", ".codex\5fedu")) {
      $src5fedu = Join-Path $sourceRoot $srcFolder
      if (-not (Test-Path $src5fedu)) { continue }
      foreach ($file in $sharedFiles) {
        $srcFile = Join-Path $src5fedu $file
        $dstFile = Join-Path $target $file
        if (Test-Path $srcFile) {
          Copy-Item -Path $srcFile -Destination $dstFile -Force
          Write-Host "  -> Updated shared rules file: $file in $target"
        }
      }
    }
  }
  
  # Check and copy other files ONLY if they don't exist
  foreach ($srcFolder in @(".agents\5fedu", ".codex\5fedu")) {
    $src5fedu = Join-Path $sourceRoot $srcFolder
    if (-not (Test-Path $src5fedu)) { continue }
    $allFiles = Get-ChildItem $src5fedu -File
    foreach ($file in $allFiles) {
      if ($sharedFiles -notcontains $file.Name) {
        foreach ($target in @($targetContext, $targetCodexContext)) {
          $dstFile = Join-Path $target $file.Name
          if (-not (Test-Path $dstFile)) {
            Copy-Item -Path $file.FullName -Destination $dstFile -Force
            Write-Host "  -> Initialized missing project-specific file: $($file.Name) in $target"
          } else {
            Write-Host "  -> Preserved custom project-specific file: $($file.Name) in $target"
          }
        }
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
  
  # Copy both platform mirrors when available
  foreach ($platformFolder in @(".agents", ".codex")) {
    $srcPlatform = Join-Path $sourceRoot $platformFolder
    if (-not (Test-Path $srcPlatform)) { continue }
    $dstPlatform = Join-Path $repo $platformFolder
    New-Item -ItemType Directory -Force -Path $dstPlatform | Out-Null
    Copy-Item -Path "$srcPlatform\*" -Destination $dstPlatform -Recurse -Force
  }
  
  # Also write legacy mirror .agent for compatibility if it is configured
  $legacyDir = Join-Path $repo ".agent"
  if (Test-Path $legacyDir) {
    $srcAgents = Join-Path $sourceRoot ".agents"
    if (Test-Path $srcAgents) {
      Copy-Item -Path "$srcAgents\*" -Destination $legacyDir -Recurse -Force
    }
  }
}

Write-Host "[5fedu] Installation and sync completed for $repo"
