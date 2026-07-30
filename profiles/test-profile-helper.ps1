param(
  [string]$Root = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "profile-helper.ps1")

$Owned = @(Get-ProfileOwnedFiles -Name "5fedu")
if ($Owned.Count -eq 0) { throw "Expected 5fedu ownedFiles to parse." }
if ($Owned -notcontains "profiles/5fedu/**") { throw "Missing profiles/5fedu/** ownership pattern." }
foreach ($Case in @(
  @{ Path = "profiles/5fedu/rules/business.md"; Expected = $true; Label = "POSIX direct child" },
  @{ Path = "profiles\5fedu\rules\dữ-liệu.md"; Expected = $true; Label = "Windows Unicode child" },
  @{ Path = "profiles/5fedu/rules/nhóm/đặc-biệt.md"; Expected = $true; Label = "nested recursive child" },
  @{ Path = "profiles/5fedu-other/rules/business.md"; Expected = $false; Label = "sibling prefix" },
  @{ Path = "profiles/other/rules/business.md"; Expected = $false; Label = "outside profile" }
)) {
  $Actual = Test-ProfileOwnedFile -Name "5fedu" -RelativePath $Case.Path
  if ($Actual -ne $Case.Expected) {
    throw "Owned-file matching failed for $($Case.Label): $($Case.Path) expected $($Case.Expected), got $Actual."
  }
}

$FixtureRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("agent-rules-profile-helper-" + [System.Guid]::NewGuid().ToString("N"))
try {
  $RealOwnedFile = Join-Path $FixtureRoot "profiles/5fedu/rules/nhóm có khoảng trắng/đặc biệt tiếng Việt.md"
  [System.IO.Directory]::CreateDirectory((Split-Path -Parent $RealOwnedFile)) | Out-Null
  [System.IO.File]::WriteAllText($RealOwnedFile, "fixture", [System.Text.UTF8Encoding]::new($false))
  $RealRelativePath = [System.IO.Path]::GetRelativePath($FixtureRoot, $RealOwnedFile)
  if (-not (Test-Path -LiteralPath $RealOwnedFile -PathType Leaf)) {
    throw "Unicode + space owned-path fixture was not created."
  }
  if (-not (Test-ProfileOwnedFile -Name "5fedu" -RelativePath $RealRelativePath)) {
    throw "Real recursive Unicode + space owned path did not match: $RealRelativePath"
  }
} finally {
  if ([System.IO.Directory]::Exists($FixtureRoot)) {
    [System.IO.Directory]::Delete($FixtureRoot, $true)
  }
}

Write-Host "Profile helper ownedFiles parser PASS ($($Owned.Count) pattern(s))."
