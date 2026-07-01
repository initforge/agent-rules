$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Problems = [System.Collections.Generic.List[string]]::new()

$Core = Get-ChildItem (Join-Path $Root "01-global\rules") -File -Filter "*.md"
$CoreChars = ($Core | ForEach-Object { (Get-Content -Raw -Encoding UTF8 $_.FullName).Length } | Measure-Object -Sum).Sum
$CoreTokens = [math]::Ceiling($CoreChars / 3.6)
if ($CoreTokens -gt 4000) { $Problems.Add("Core token budget exceeded: $CoreTokens") }

foreach ($Platform in @("codex", "grok", "antigravity")) {
  $Overlay = Join-Path $Root "03-platforms\$Platform\$Platform-overlay.md"
  if (-not (Test-Path $Overlay)) { $Problems.Add("Missing overlay: $Overlay"); continue }
  $Tokens = [math]::Ceiling((Get-Content -Raw -Encoding UTF8 $Overlay).Length / 3.6)
  if ($Tokens -gt 600) { $Problems.Add("$Platform overlay budget exceeded: $Tokens") }
}

$SkillFiles = Get-ChildItem (Join-Path $Root "01-global\skills") -Recurse -File -Filter "SKILL.md"
$Slugs = $SkillFiles | ForEach-Object { $_.Directory.Name }
foreach ($Skill in $SkillFiles) {
  $Tokens = [math]::Ceiling((Get-Content -Raw -Encoding UTF8 $Skill.FullName).Length / 3.6)
  if ($Tokens -gt 3500) {
    $Problems.Add("Skill token budget exceeded: $($Skill.FullName.Substring($Root.Length + 1)) = $Tokens")
  }
}

$Duplicates = $Slugs | Group-Object | Where-Object Count -gt 1
foreach ($Dup in $Duplicates) { $Problems.Add("Duplicate skill slug: $($Dup.Name)") }

$RequiredPaths = @(
  "00-guides\00-system-map.md",
  "01-global\integrations\registry.json",
  "02-projects\5fedu\AGENTS.md",
  "02-projects\5fedu\00-map\read-first.md"
)
foreach ($Path in $RequiredPaths) {
  if (-not (Test-Path (Join-Path $Root $Path))) { $Problems.Add("Missing required path: $Path") }
}

$ForbiddenTopLevel = @("00-huong-dan", "02-du-an", "03-nen-tang", "04-tu-dong-hoa", "06-ke-hoach", "knowledge", "integrations", "platforms", "automation", "build", "docs", "plan")
foreach ($Name in $ForbiddenTopLevel) {
  if (Test-Path (Join-Path $Root $Name)) { $Problems.Add("Old top-level folder still exists: $Name") }
}

$LegacyDocNames = @("00-ban-do-he-thong.md", "01-mo-hinh-runtime.md", "02-he-thong-tri-thuc.md", "03-tich-hop-va-dong-bo.md", "04-bao-tri-va-rui-ro.md")
foreach ($Name in $LegacyDocNames) {
  if (Get-ChildItem $Root -Recurse -File -Filter $Name -ErrorAction SilentlyContinue) {
    $Problems.Add("Legacy Vietnamese doc remains: $Name")
  }
}

$RegistryPath = Join-Path $Root "01-global\integrations\registry.json"
if (Test-Path $RegistryPath) {
  $Registry = Get-Content -Raw $RegistryPath | ConvertFrom-Json
  foreach ($Integration in $Registry.integrations) {
    if (-not (Test-Path (Join-Path $Root $Integration.path))) {
      $Problems.Add("Integration registry path missing: $($Integration.path)")
    }
  }
}

if (Test-Path (Join-Path $Root ".agents")) { $Problems.Add("Project mirror exists: .agents") }
if (Test-Path (Join-Path $Root ".codex")) { $Problems.Add("Project mirror exists: .codex") }

$MojibakePattern = [string]::Join("|", @(
  ([string][char]0x00c3 + "[\x{80}-\x{bf}]"),
  ([string][char]0x00c2 + "[\x{80}-\x{bf}]"),
  ([string][char]0x00e2 + "[\x{80}-\x{bf}]"),
  ([string][char]0x00e1 + [char]0x00ba),
  ([string][char]0x00e1 + [char]0x00bb),
  ([string][char]0x00c4 + "[\x{80}-\x{bf}]"),
  ([string][char]0x00c6 + "[\x{80}-\x{bf}]")
))
$Mojibake = rg -n $MojibakePattern $Root -g "*.md" -g "*.ps1" -g "*.yaml" -g "*.toml" -g "!06-plans/**" -g "!05-generated/**" -g "!.git/**" 2>$null
if ($Mojibake) { $Problems.Add("Possible mojibake remains outside archive/build") }

if ($Problems.Count) {
  $Problems | ForEach-Object { Write-Error $_ }
  exit 1
}

Write-Host "Context validation PASS"
Write-Host "Core tokens (estimated): $CoreTokens"
Write-Host "Skills: $($Slugs.Count)"

