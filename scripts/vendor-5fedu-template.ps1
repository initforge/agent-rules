param(
  [string]$TargetDir = (Join-Path (Split-Path -Parent $PSScriptRoot) "profiles/5fedu/reference-projects/5f-template-ket-noi-supabase-main"),
  [string]$RepoUrl = "https://github.com/initforge/pos-ops.git",
  [string]$SourcePath = "5f-template-ket-noi-supabase-main",
  [string]$CommitSha = "ec9e4a87c7918a48a089a293f70090beb82cebbb"
)

$ErrorActionPreference = "Stop"

$TempDir = Join-Path $env:TEMP "pos-ops-temp-$([System.IO.Path]::GetRandomFileName())"
try {
  git clone --depth 1 $RepoUrl $TempDir 2>&1 | Out-Null
  Push-Location $TempDir
  git fetch origin $CommitSha 2>&1 | Out-Null
  git checkout $CommitSha 2>&1 | Out-Null
  Pop-Location

  $SourceDir = Join-Path $TempDir $SourcePath
  if (-not (Test-Path $SourceDir)) { throw "Source path not found: $SourceDir" }

  if (Test-Path $TargetDir) { Remove-Item -LiteralPath $TargetDir -Recurse -Force }
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $TargetDir) | Out-Null
  Copy-Item -LiteralPath $SourceDir -Destination $TargetDir -Recurse -Force

  $Files = Get-ChildItem $TargetDir -Recurse -File | ForEach-Object {
    $Rel = $_.FullName.Substring($TargetDir.Length + 1).Replace('\', '/')
    $Hash = (Get-FileHash $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    [pscustomobject]@{ path = $Rel; sha256 = $Hash }
  }

  $SourceLock = @{
    repository = $RepoUrl
    sourcePath = $SourcePath
    commitSha = $CommitSha
    importedAt = (Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ")
    verifiedAt = (Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ")
    redistribution = "internal"
    updatePolicy = "manual-vendored"
    immutable = $true
    role = "reference-template"
    compatibility = @{ node = ">=18"; npm = ">=9" }
  }
  $SourceLock | ConvertTo-Json -Depth 3 | Set-Content -Encoding UTF8 (Join-Path (Split-Path -Parent $TargetDir) "5f-template-ket-noi-supabase-main.source-lock.json")

  $Manifest = @{
    version = 1
    source = "$RepoUrl/tree/$CommitSha/$SourcePath"
    files = $Files
    fileCount = @($Files).Count
  }
  $Manifest | ConvertTo-Json -Depth 5 | Set-Content -Encoding UTF8 (Join-Path (Split-Path -Parent $TargetDir) "5f-template-ket-noi-supabase-main.manifest.json")

  Write-Host "Template vendored to: $TargetDir"
  Write-Host "Files: $($Files.Count)"
} finally {
  if (Test-Path $TempDir) { Remove-Item -LiteralPath $TempDir -Recurse -Force }
}
