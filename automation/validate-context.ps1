$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Problems = [System.Collections.Generic.List[string]]::new()
$Core = Get-ChildItem (Join-Path $Root "knowledge\core") -File -Filter "*.md"
$CoreChars = ($Core | ForEach-Object { (Get-Content -Raw -Encoding UTF8 $_.FullName).Length } | Measure-Object -Sum).Sum
$CoreTokens = [math]::Ceiling($CoreChars / 3.6)
if ($CoreTokens -gt 4000) { $Problems.Add("Core token budget exceeded: $CoreTokens") }
foreach ($Platform in @("codex","grok","antigravity")) {
  $Overlay = Join-Path $Root "platforms\$Platform\$Platform-overlay.md"
  if (-not (Test-Path $Overlay)) { $Problems.Add("Missing overlay: $Overlay"); continue }
  $Tokens = [math]::Ceiling((Get-Content -Raw -Encoding UTF8 $Overlay).Length / 3.6)
  if ($Tokens -gt 600) { $Problems.Add("$Platform overlay budget exceeded: $Tokens") }
}
$SkillFiles = Get-ChildItem (Join-Path $Root "knowledge\capabilities") -Recurse -File -Filter "SKILL.md"
$Slugs = $SkillFiles | ForEach-Object { $_.Directory.Name }
$MaxSkillTokens = 3500
foreach ($Skill in $SkillFiles) {
  $Tokens = [math]::Ceiling((Get-Content -Raw -Encoding UTF8 $Skill.FullName).Length / 3.6)
  if ($Tokens -gt $MaxSkillTokens) {
    $Problems.Add("Capability token budget exceeded: $($Skill.FullName.Substring($Root.Length + 1)) = $Tokens")
  }
}
$Duplicates = $Slugs | Group-Object | Where-Object Count -gt 1
foreach ($Dup in $Duplicates) { $Problems.Add("Duplicate capability: $($Dup.Name)") }
$ForbiddenCapabilities = @(
  "check-work",
  "workflow-router",
  "skill-creator",
  "plugin-creator",
  "create-skill",
  "template-creator"
)
foreach ($Slug in $Slugs) {
  if ($ForbiddenCapabilities -contains $Slug) {
    $Problems.Add("Generated or external capability synced into canonical source: $Slug")
  }
  if ($Slug -match "(^|-)creator$") {
    $Problems.Add("Creator capability must stay external/runtime-only: $Slug")
  }
}
$ProjectTemplate = Join-Path $Root "knowledge\project-context\templates\5fedu"
if (Test-Path $ProjectTemplate) {
  $IndexPath = Join-Path $ProjectTemplate "00-index.md"
  if (Test-Path $IndexPath) {
    $IndexTokens = [math]::Ceiling((Get-Content -Raw -Encoding UTF8 $IndexPath).Length / 3.6)
    if ($IndexTokens -gt 1800) { $Problems.Add("5fedu index token budget exceeded: $IndexTokens") }
  }
  Get-ChildItem $ProjectTemplate -File -Filter "*.md" | ForEach-Object {
    $Tokens = [math]::Ceiling((Get-Content -Raw -Encoding UTF8 $_.FullName).Length / 3.6)
    if ($Tokens -gt 8000) {
      $Problems.Add("5fedu lazy pack token budget exceeded: $($_.Name) = $Tokens")
    }
  }
}
$CodexProfiles = Join-Path $Root "platforms\codex\profiles"
if (Test-Path $CodexProfiles) { $Problems.Add("Retired Codex profiles remain: $CodexProfiles") }
if (Test-Path (Join-Path $Root ".agents")) { $Problems.Add("Project mirror exists: .agents") }
if (Test-Path (Join-Path $Root ".codex")) { $Problems.Add("Project mirror exists: .codex") }
$RetiredTool = "git" + "nexus"
$Forbidden = rg -n -i $RetiredTool $Root -g "!plan/**" -g "!.git/**" -g "!build/**" 2>$null
if ($Forbidden) { $Problems.Add("Retired code-graph tool references remain outside plan") }
$MojibakePattern = [string]::Join("|", @(
  ([string][char]0x00c3 + "[\x{80}-\x{bf}]"),
  ([string][char]0x00c2 + "[\x{80}-\x{bf}]"),
  ([string][char]0x00e2 + "[\x{80}-\x{bf}]"),
  ([string][char]0x00e1 + [char]0x00ba),
  ([string][char]0x00e1 + [char]0x00bb),
  ([string][char]0x00c4 + "[\x{80}-\x{bf}]"),
  ([string][char]0x00c6 + "[\x{80}-\x{bf}]")
))
$Mojibake = rg -n $MojibakePattern $Root -g "*.md" -g "*.ps1" -g "*.yaml" -g "*.toml" -g "!plan/**" -g "!.git/**" -g "!build/**" 2>$null
if ($Mojibake) { $Problems.Add("Possible mojibake remains outside plan") }
if ($Problems.Count) { $Problems | ForEach-Object { Write-Error $_ }; exit 1 }
Write-Host "Context validation PASS"
Write-Host "Core tokens (estimated): $CoreTokens"
Write-Host "Capabilities: $($Slugs.Count)"
