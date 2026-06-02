$ErrorActionPreference = "Stop"

$masterRoot = "P:\agent-rules\antigravity"
$localAgents = ".agents"
$localLegacy = ".agent"

$updated = $false

# 1. Auto-update from master P:\agent-rules if available and not inside P:\agent-rules itself
$currentPath = (Get-Location).Path
if ((Test-Path $masterRoot) -and ($currentPath -notlike "*agent-rules*")) {
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
    
    # Clean up legacy .agent folder if present to keep workspace simplified and avoid context bloat
    if (Test-Path $localLegacy) {
      Write-Host "[Antigravity] Cleaning up legacy '.agent' folder..."
      Remove-Item $localLegacy -Recurse -Force
      $updated = $true
    }
  }
}

# 2. Dynamic Antigravity Skills generator
$antigravitySkillsPath = Join-Path $masterRoot "skills"
if (-not (Test-Path $antigravitySkillsPath)) {
  $antigravitySkillsPath = Join-Path $localAgents "skills"
}
if (Test-Path $antigravitySkillsPath) {
  $skills = Get-ChildItem $antigravitySkillsPath -Directory
  foreach ($skill in $skills) {
    if ($skill.Name -like ".*") { continue }
    
    $wfContent = @'
# {0} Skill

1. Read the skill file in the project-local adapter at `.agents/skills/{0}/SKILL.md` or the master backup at `P:\agent-rules\antigravity\.agents\skills\{0}\SKILL.md`.
2. Inspect the current project files or request relevant context before starting work.
3. Execute the skill instructions to fulfill the user's request.
4. If this is a design/UI/UX skill, check and follow the visual examples and templates if referenced.
5. End with files modified, verification details, and final status `PASS`, `PARTIAL`, or `BLOCKED`.
'@ -f $skill.Name
    
    $wfFile = Join-Path $localAgents "workflows\$($skill.Name).md"
    if (-not (Test-Path $wfFile)) {
      $wfFolder = Split-Path $wfFile -Parent
      New-Item -ItemType Directory -Force -Path $wfFolder | Out-Null
      Set-Content -Path $wfFile -Value $wfContent -Force
      $updated = $true
    }
    
    # Removed legacy .agent workflow generation
  }
}


# 2.5 Bidirectional synchronization of project context (.codex/5fedu and .agents/5fedu)
function Sync-FileContent ($sourceFile, $destFile, $direction) {
  $content = Get-Content $sourceFile -Raw
  if ($direction -eq "codex-to-agents") {
    $content = $content -replace "\.codex/5fedu/", ".agents/5fedu/"
    $content = $content -replace "\.codex/template-source/", ".agents/template-source/"
    $content = $content -replace "\.codex\\5fedu\\", ".agents\5fedu\"
    $content = $content -replace "\.codex\\template-source\\", ".agents\template-source\"
  } elseif ($direction -eq "agents-to-codex") {
    $content = $content -replace "\.agents/5fedu/", ".codex/5fedu/"
    $content = $content -replace "\.agents/template-source/", ".codex/template-source/"
    $content = $content -replace "\.agents\\5fedu\\", ".codex\5fedu\"
    $content = $content -replace "\.agents\\template-source\\", ".codex\template-source\"
  }
  
  $parent = Split-Path $destFile -Parent
  if (-not (Test-Path $parent)) {
    New-Item -ItemType Directory -Force -Path $parent | Out-Null
  }
  
  Set-Content -Path $destFile -Value $content -Force
  (Get-Item $destFile).LastWriteTime = (Get-Item $sourceFile).LastWriteTime
}

$codex5fedu = ".codex\5fedu"
$agents5fedu = ".agents\5fedu"
# Removed legacy5fedu reference

if ((Test-Path $codex5fedu) -or (Test-Path $agents5fedu)) {
  # If agents/5fedu exists but codex/5fedu does not, copy it
  if (-not (Test-Path $codex5fedu)) {
    Get-ChildItem $agents5fedu -File | ForEach-Object {
      $dst = Join-Path $codex5fedu $_.Name
      Sync-FileContent $_.FullName $dst "agents-to-codex"
    }
    $updated = $true
  }
  # If codex/5fedu exists but agents/5fedu does not, copy it
  elseif (-not (Test-Path $agents5fedu)) {
    Get-ChildItem $codex5fedu -File | ForEach-Object {
      $dst = Join-Path $agents5fedu $_.Name
      Sync-FileContent $_.FullName $dst "codex-to-agents"
    }
    $updated = $true
  }
  # Sync bidirectionally by timestamp
  else {
    $codexFiles = Get-ChildItem $codex5fedu -File
    $agentsFiles = Get-ChildItem $agents5fedu -File
    
    foreach ($cFile in $codexFiles) {
      $aFilePath = Join-Path $agents5fedu $cFile.Name
      if (-not (Test-Path $aFilePath) -or $cFile.LastWriteTime -gt (Get-Item $aFilePath).LastWriteTime) {
        Sync-FileContent $cFile.FullName $aFilePath "codex-to-agents"
        $updated = $true
      }
    }
    
    foreach ($aFile in $agentsFiles) {
      $cFilePath = Join-Path $codex5fedu $aFile.Name
      if (-not (Test-Path $cFilePath) -or $aFile.LastWriteTime -gt (Get-Item $cFilePath).LastWriteTime) {
        Sync-FileContent $aFile.FullName $cFilePath "agents-to-codex"
        $updated = $true
      }
    }
  }
  
  # Removed legacy mirror 5fedu sync
}

# 3. Check if required files are present
$required = @(
  ".agents\rules\00-antigravity-runtime-intent.md",
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
