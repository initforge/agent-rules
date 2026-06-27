param(
  [string]$RepoRoot = (Get-Location).Path,
  [switch]$Force = $false
)

$ErrorActionPreference = "Stop"

$skillRoot = Split-Path -Parent $PSScriptRoot
$sourceRoot = Join-Path $skillRoot "assets\project-context"
$source5fedu = Join-Path $sourceRoot "common\5fedu"

if (-not (Test-Path $sourceRoot)) {
  throw "Missing template source: $sourceRoot"
}

if (-not (Test-Path $source5fedu)) {
  throw "Missing 5fedu template source: $source5fedu"
}

$repo = (Resolve-Path $RepoRoot).Path
$agentsPath = Join-Path $repo "AGENTS.md"
$targetContext = Join-Path $repo ".agents\5fedu"
$targetCodexContext = Join-Path $repo ".codex\5fedu"

# Separate project-specific custom files vs shared rules/lessons
$sharedFiles = @(
  "00-index.md",
  "02-database-and-auth-rules.md",
  "03-ui-ux-and-delivery-standards.md",
  "04-business-patterns.md"
)

$defaultScaffoldExcludes = @(
  "07-working-format.md",
  "08-source-examples.md",
  "10-owner-feedback-lessons.md"
)

$isAlreadyScaffolded = (Test-Path $targetContext) -or (Test-Path $targetCodexContext)

if ($isAlreadyScaffolded -and -not $Force) {
  Write-Host "[5fedu] Project is already scaffolded. Performing intelligent update..."
  
  # Copy/overwrite only shared lessons and rules
  foreach ($target in @($targetContext, $targetCodexContext)) {
    New-Item -ItemType Directory -Force -Path $target | Out-Null
    foreach ($file in $sharedFiles) {
      $srcFile = Join-Path $source5fedu $file
      $dstFile = Join-Path $target $file
      if (Test-Path $srcFile) {
        Copy-Item -Path $srcFile -Destination $dstFile -Force
        Write-Host "  -> Updated shared rules file: $file in $target"
      }
    }
  }
  
  # Check and copy other files ONLY if they don't exist
  $allFiles = Get-ChildItem $source5fedu -File
  foreach ($file in $allFiles) {
    if (($sharedFiles -notcontains $file.Name) -and ($defaultScaffoldExcludes -notcontains $file.Name)) {
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
} else {
  # Full scaffold or Force overwrite
  Write-Host "[5fedu] Performing full project scaffolding..."
  New-Item -ItemType Directory -Force -Path $repo | Out-Null
  
  # Copy AGENTS.md if not exists or Force
  if (-not (Test-Path $agentsPath) -or $Force) {
    Copy-Item -LiteralPath (Join-Path $sourceRoot "AGENTS.md") -Destination $agentsPath -Force
    Write-Host "  -> Wrote AGENTS.md"
  }
  
  # Generate both platform mirrors from one common source.
  # Deep examples/raw lessons stay in the skill source unless explicitly requested.
  foreach ($target in @($targetContext, $targetCodexContext)) {
    New-Item -ItemType Directory -Force -Path $target | Out-Null
    foreach ($file in Get-ChildItem $source5fedu -File) {
      if ($defaultScaffoldExcludes -contains $file.Name) { continue }
      Copy-Item -Path $file.FullName -Destination (Join-Path $target $file.Name) -Force
    }
  }
  
  # Also write legacy mirror .agent for compatibility if it is configured
  $legacyDir = Join-Path $repo ".agent"
  if (Test-Path $legacyDir) {
    $legacy5fedu = Join-Path $legacyDir "5fedu"
    New-Item -ItemType Directory -Force -Path $legacy5fedu | Out-Null
    foreach ($file in Get-ChildItem $source5fedu -File) {
      if ($defaultScaffoldExcludes -contains $file.Name) { continue }
      Copy-Item -Path $file.FullName -Destination (Join-Path $legacy5fedu $file.Name) -Force
    }
  }
}

Write-Host "[5fedu] Installation and sync completed for $repo"
