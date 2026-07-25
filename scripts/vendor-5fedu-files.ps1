param(
  [string]$TargetDir = "profiles/5fedu/reference-projects/5f-template-ket-noi-supabase-main",
  [string]$CommitSha = "ec9e4a87c7918a48a089a293f70090beb82cebbb"
)

$Root = Split-Path -Parent $PSScriptRoot
$FullTarget = Join-Path $Root $TargetDir
New-Item -ItemType Directory -Force -Path $FullTarget | Out-Null

function Fetch-Tree($ApiUrl, $Prefix) {
  $Items = Invoke-RestMethod -Uri $ApiUrl -Headers @{"Accept"="application/vnd.github.v3+json"}
  foreach ($Item in $Items) {
    $RelPath = if ($Prefix) { "$Prefix/$($Item.name)" } else { "5f-template-ket-noi-supabase-main/$($Item.name)" }
    if ($Item.type -eq "dir") {
      Fetch-Tree $Item.git_url.Replace("git/trees","git/blobs") $RelPath
    } elseif ($Item.type -eq "file") {
      Write-Host "Fetching: $RelPath"
      $Dest = Join-Path $FullTarget $RelPath.Substring("5f-template-ket-noi-supabase-main/".Length)
      New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Dest) | Out-Null
      Invoke-WebRequest -Uri $Item.download_url -OutFile $Dest
    }
  }
}

$TreeUrl = "https://api.github.com/repos/initforge/pos-ops/git/trees/$CommitSha"
$TopItems = Invoke-RestMethod -Uri "$TreeUrl`?recursive=1" -Headers @{"Accept"="application/vnd.github.v3+json"}
$Filtered = $TopItems.tree | Where-Object { $_.path -like "5f-template-ket-noi-supabase-main/*" }
foreach ($Entry in $Filtered) {
  $RelPath = $Entry.path.Substring("5f-template-ket-noi-supabase-main/".Length)
  if ($Entry.type -eq "tree") {
    New-Item -ItemType Directory -Force -Path (Join-Path $FullTarget $RelPath) | Out-Null
  } elseif ($Entry.type -eq "blob") {
    Write-Host "Fetching: $RelPath"
    $Dest = Join-Path $FullTarget $RelPath
    $RawUrl = "https://raw.githubusercontent.com/initforge/pos-ops/$CommitSha/5f-template-ket-noi-supabase-main/$RelPath"
    Invoke-WebRequest -Uri $RawUrl -OutFile $Dest
  }
}

Write-Host "Template vendored to: $FullTarget"
Write-Host "Files: $($Filtered | Where-Object { $_.type -eq 'blob' } | Measure-Object | Select-Object -ExpandProperty Count)"
