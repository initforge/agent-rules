param(
  [Parameter(Mandatory=$true)][string]$ProjectRoot,
  [Parameter(Mandatory=$true)][string[]]$RelativePaths,
  [switch]$Apply
)
$ErrorActionPreference = "Stop"

$ProjectRoot = (Resolve-Path $ProjectRoot).Path
$RepoCtx = Join-Path $ProjectRoot "context\5fedu"
if (-not (Test-Path $RepoCtx)) { throw "Repository 5fedu context directory not found: $RepoCtx" }

$PSScriptRootResolved = $PSScriptRoot
$RepoRoot = Split-Path -Parent $PSScriptRootResolved
$Harness = Join-Path $RepoRoot "projects\5fedu"

$DenyPatterns = @(
  "project-local",
  "project-overlay",
  "install-metadata\.md",
  "legacy",
  "\.template-managed\.json"
)

$AllowPatterns = @(
  "^AGENTS\.md$",
  "^00-context-map\.md$",
  "^decisions\.md$",
  "^open-questions\.md$",
  "^sync-flow\.md$",
  "^README\.md$",
  "^domains[/\\]",
  "^evidence[/\\]"
)

$ForbiddenContentPatterns = @(
  "NOSTIME APP",
  "tah-app\.vercel",
  "linhnxdeveloper",
  "1ROjN7"
)

foreach ($RelPath in $RelativePaths) {
  $NormalizedPath = $RelPath -replace "/", "\"
  $SourceFile = Join-Path $RepoCtx $NormalizedPath
  $DestFile = Join-Path $Harness $NormalizedPath

  if (-not (Test-Path $SourceFile)) {
    throw "Source file not found: $SourceFile"
  }

  foreach ($Pattern in $DenyPatterns) {
    if ($NormalizedPath -match $Pattern) {
      throw "Path '$RelPath' is in denylist. Write-back forbidden."
    }
  }

  $Allowed = $false
  foreach ($Pattern in $AllowPatterns) {
    if ($NormalizedPath -match $Pattern) {
      $Allowed = $true
      break
    }
  }
  if (-not $Allowed) {
    throw "Path '$RelPath' is not in allowlist. Write-back forbidden."
  }

  $Content = Get-Content -Raw -Encoding UTF8 $SourceFile
  foreach ($Pattern in $ForbiddenContentPatterns) {
    if ($Content -match $Pattern) {
      throw "File '$RelPath' contains forbidden project-specific pattern '$Pattern'. Write-back rejected."
    }
  }

  Write-Host "File '$RelPath' passed write-back check."
}

if (-not $Apply) {
  Write-Host "Dry-run mode. Check passed. Use -Apply to write changes."
  exit 0
}

$BackupList = @{}
try {
  foreach ($RelPath in $RelativePaths) {
    $NormalizedPath = $RelPath -replace "/", "\"
    $SourceFile = Join-Path $RepoCtx $NormalizedPath
    $DestFile = Join-Path $Harness $NormalizedPath

    $DestDir = Split-Path $DestFile -Parent
    if (-not (Test-Path $DestDir)) {
      New-Item -ItemType Directory -Force -Path $DestDir | Out-Null
    }

    if (Test-Path $DestFile) {
      $TempBackup = [System.IO.Path]::GetTempFileName()
      Copy-Item -LiteralPath $DestFile -Destination $TempBackup -Force
      $BackupList[$DestFile] = $TempBackup
    } else {
      $BackupList[$DestFile] = $null
    }

    Copy-Item -LiteralPath $SourceFile -Destination $DestFile -Force
    Write-Host "Copied: $RelPath -> Harness"
  }

  $AuditScript = Join-Path $PSScriptRootResolved "audit-5fedu-template-purity.ps1"
  if (Test-Path $AuditScript) {
    Write-Host "Running template purity audit..."
    & $AuditScript
    if ($LASTEXITCODE -ne 0) {
      throw "Purity audit failed on newly copied files."
    }
    Write-Host "Purity audit passed."
  }
} catch {
  Write-Error "Write-back failed. Rolling back changes..."
  foreach ($DestFile in $BackupList.Keys) {
    $Backup = $BackupList[$DestFile]
    if ($Backup -and (Test-Path $Backup)) {
      Copy-Item -LiteralPath $Backup -Destination $DestFile -Force
      Remove-Item -LiteralPath $Backup -Force
    } elseif ($null -eq $Backup -and (Test-Path $DestFile)) {
      Remove-Item -LiteralPath $DestFile -Force
    }
  }
  throw $_
} finally {
  foreach ($Backup in $BackupList.Values) {
    if ($Backup -and (Test-Path $Backup)) {
      Remove-Item -LiteralPath $Backup -Force
    }
  }
}

Write-Host "Write-back complete and validated successfully."
