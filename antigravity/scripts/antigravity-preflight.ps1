$ErrorActionPreference = "Stop"

$masterRoot = "P:\agent-rules\antigravity"
$localAgents = ".agents"
$localLegacy = ".agent"

$updated = $false

# 1. Auto-update from master P:\agent-rules if available and not inside P:\agent-rules itself
$currentPath = (Get-Location).Path
if (Test-Path $masterRoot -and $currentPath -notlike "*agent-rules*") {
  $masterAgents = Join-Path $masterRoot ".agents"
  if (Test-Path $masterAgents) {
    # Check and sync .agents (modern)
    $masterFiles = Get-ChildItem $masterAgents -Recurse -File
    foreach ($mFile in $masterFiles) {
      $relative = $mFile.FullName.Substring($masterAgents.Length + 1)
      $lFile = Join-Path $localAgents $relative
      
      # If local file does not exist or has a different hash, sync it
      if (-not (Test-Path $lFile) -or (Get-FileHash $mFile.FullName).Hash -ne (Get-FileHash $lFile).Hash) {
        $parent = Split-Path $lFile -Parent
        New-Item -ItemType Directory -Force -Path $parent | Out-Null
        Copy-Item $mFile.FullName $lFile -Force
        $updated = $true
      }
    }
    
    # Check and sync .agent (legacy mirror) if present
    if (Test-Path $localLegacy) {
      foreach ($mFile in $masterFiles) {
        $relative = $mFile.FullName.Substring($masterAgents.Length + 1)
        $lFile = Join-Path $localLegacy $relative
        
        if (-not (Test-Path $lFile) -or (Get-FileHash $mFile.FullName).Hash -ne (Get-FileHash $lFile).Hash) {
          $parent = Split-Path $lFile -Parent
          New-Item -ItemType Directory -Force -Path $parent | Out-Null
          Copy-Item $mFile.FullName $lFile -Force
          $updated = $true
        }
      }
    }
  }
}

# 2. Check if required files are present
$required = @(
  ".agents\rules\00-codex-runtime-intent.md",
  ".agents\rules\01-intent-contract.md",
  ".agents\rules\10-fast-context.md",
  ".agents\workflows\5fedu-project.md",
  ".agents\workflows\codex-research.md",
  ".agents\workflows\runtime-sync-audit.md"
)

$missing = @()
foreach ($path in $required) {
  if (-not (Test-Path $path)) {
    $missing += $path
  }
}

if ($missing.Count -gt 0) {
  $message = "Antigravity adapter missing files: " + ($missing -join ", ")
  [pscustomobject]@{
    injectSteps = @(
      @{
        ephemeralMessage = $message
      }
    )
  } | ConvertTo-Json -Depth 5
  exit 0
}

$statusMsg = "Antigravity adapter ready. Use /5fedu-project, /codex-research, or /runtime-sync-audit when the request matches."
if ($updated) {
  $statusMsg = "[Auto-Updated] Antigravity rules synced with master P:\agent-rules. " + $statusMsg
}

[pscustomobject]@{
  injectSteps = @(
    @{
      ephemeralMessage = $statusMsg
    }
  )
} | ConvertTo-Json -Depth 5
