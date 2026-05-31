$ErrorActionPreference = "Stop"

$masterAntigravity = "P:\agent-rules\antigravity\.agents"
$masterCodex = "P:\agent-rules\codex"
$localCodex = "$env:USERPROFILE\.codex"

function Sync-Folder {
  param(
    [string]$Src,
    [string]$Dst
  )
  if (-not (Test-Path $Src) -or -not (Test-Path $Dst)) { return }
  
  $srcFiles = Get-ChildItem $Src -Recurse -File
  foreach ($sFile in $srcFiles) {
    # Skip system files
    if ($sFile.Name -like ".*") { continue }
    
    $relative = $sFile.FullName.Substring($Src.Length + 1)
    $dFile = Join-Path $Dst $relative
    
    if (-not (Test-Path $dFile) -or $sFile.LastWriteTime -gt (Get-Item $dFile).LastWriteTime) {
      $parent = Split-Path $dFile -Parent
      New-Item -ItemType Directory -Force -Path $parent | Out-Null
      Copy-Item $sFile.FullName $dFile -Force
      Write-Host "Synced: $($sFile.FullName) -> $dFile"
    }
  }

  $dstFiles = Get-ChildItem $Dst -Recurse -File
  foreach ($dFile in $dstFiles) {
    if ($dFile.Name -like ".*") { continue }
    
    $relative = $dFile.FullName.Substring($Dst.Length + 1)
    $sFile = Join-Path $Src $relative
    
    if (-not (Test-Path $sFile) -or $dFile.LastWriteTime -gt (Get-Item $sFile).LastWriteTime) {
      $parent = Split-Path $sFile -Parent
      New-Item -ItemType Directory -Force -Path $parent | Out-Null
      Copy-Item $dFile.FullName $sFile -Force
      Write-Host "Synced: $($dFile.FullName) -> $sFile"
    }
  }
}

Write-Host "[Platform Sync] Syncing Rules and Skills between Antigravity and Codex..."

# 1. Sync Rules
Sync-Folder -Src (Join-Path $masterAntigravity "rules") -Dst (Join-Path $masterCodex "rules")

# 2. Sync Skills
Sync-Folder -Src (Join-Path $masterAntigravity "skills") -Dst (Join-Path $masterCodex "skills")

# 3. Sync to local user runtime ~/.codex
if (Test-Path $localCodex) {
  Write-Host "[Platform Sync] Propagating master updates to local user runtime $localCodex..."
  Sync-Folder -Src (Join-Path $masterCodex "rules") -Dst (Join-Path $localCodex "rules")
  Sync-Folder -Src (Join-Path $masterCodex "skills") -Dst (Join-Path $localCodex "skills")
}

Write-Host "[Platform Sync] Synchronization completed successfully."
