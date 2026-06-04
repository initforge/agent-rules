param(
  [string]$RepoRoot = (Get-Location).Path,
  [ValidateSet("newer","agents","codex")]
  [string]$Prefer = "newer",
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

$repo = (Resolve-Path -LiteralPath $RepoRoot).Path
$agents = Join-Path $repo ".agents\5fedu"
$codex = Join-Path $repo ".codex\5fedu"

if (-not (Test-Path $agents) -and -not (Test-Path $codex)) {
  throw "No 5fedu context found under $repo"
}

New-Item -ItemType Directory -Force -Path $agents | Out-Null
New-Item -ItemType Directory -Force -Path $codex | Out-Null

function Convert-ContextPathText([string]$Content, [string]$Direction) {
  if ($Direction -eq "agents-to-codex") {
    $Content = $Content -replace "\.agents/5fedu/", ".codex/5fedu/"
    $Content = $Content -replace "\.agents\\5fedu\\", ".codex\5fedu\"
  } elseif ($Direction -eq "codex-to-agents") {
    $Content = $Content -replace "\.codex/5fedu/", ".agents/5fedu/"
    $Content = $Content -replace "\.codex\\5fedu\\", ".agents\5fedu\"
  }
  $Content = $Content -replace "`r`n", "`n"
  $Content = $Content -replace "`r", "`n"
  $Content = $Content -replace "^\uFEFF", ""
  $Content = $Content.TrimEnd() + "`n"
  return $Content
}

function Get-NormalizedHash([string]$Path, [string]$Direction) {
  if (-not (Test-Path -LiteralPath $Path)) { return $null }
  $content = Get-Content -LiteralPath $Path -Raw -Encoding UTF8
  $normalized = Convert-ContextPathText $content $Direction
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($normalized)
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    $hashBytes = $sha.ComputeHash($bytes)
    return ([System.BitConverter]::ToString($hashBytes) -replace "-", "")
  } finally {
    $sha.Dispose()
  }
}

function Copy-Normalized([string]$Src, [string]$Dst, [string]$Direction) {
  $content = Get-Content -LiteralPath $Src -Raw -Encoding UTF8
  $content = Convert-ContextPathText $content $Direction
  if ($DryRun) {
    Write-Host "[DRY] sync $Src -> $Dst"
    return
  }
  Set-Content -LiteralPath $Dst -Value $content -Encoding UTF8
  (Get-Item -LiteralPath $Dst).LastWriteTime = (Get-Item -LiteralPath $Src).LastWriteTime
  Write-Host "[Sync] $Src -> $Dst"
}

$names = @()
$names += Get-ChildItem -LiteralPath $agents -File -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name
$names += Get-ChildItem -LiteralPath $codex -File -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name
$names = $names | Sort-Object -Unique

$conflicts = New-Object System.Collections.Generic.List[string]

foreach ($name in $names) {
  $a = Join-Path $agents $name
  $c = Join-Path $codex $name

  if (-not (Test-Path -LiteralPath $a)) {
    Copy-Normalized $c $a "codex-to-agents"
    continue
  }
  if (-not (Test-Path -LiteralPath $c)) {
    Copy-Normalized $a $c "agents-to-codex"
    continue
  }

  $aAsCodex = Get-NormalizedHash $a "agents-to-codex"
  $cHash = Get-NormalizedHash $c "none"
  if ($aAsCodex -eq $cHash) {
    continue
  }

  $aTime = (Get-Item -LiteralPath $a).LastWriteTimeUtc
  $cTime = (Get-Item -LiteralPath $c).LastWriteTimeUtc
  $delta = [Math]::Abs(($aTime - $cTime).TotalSeconds)

  if ($delta -le 2 -and $Prefer -eq "newer") {
    $conflicts.Add("Different content with near-equal timestamps: $name") | Out-Null
  } elseif ($Prefer -eq "agents") {
    Copy-Normalized $a $c "agents-to-codex"
  } elseif ($Prefer -eq "codex") {
    Copy-Normalized $c $a "codex-to-agents"
  } elseif ($aTime -gt $cTime) {
    Copy-Normalized $a $c "agents-to-codex"
  } else {
    Copy-Normalized $c $a "codex-to-agents"
  }
}

if ($conflicts.Count -gt 0) {
  Write-Host "5fedu context sync: CONFLICT"
  foreach ($conflict in $conflicts) {
    Write-Host "- $conflict"
  }
  exit 1
}

Write-Host "5fedu context sync: PASS"
