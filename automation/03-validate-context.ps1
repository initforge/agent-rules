$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Problems = [System.Collections.Generic.List[string]]::new()

$ManifestPath = Join-Path $Root "rules\manifest.yaml"
$BudgetYaml = if (Test-Path $ManifestPath) { Get-Content -Raw $ManifestPath } else { "" }
$CoreBudget = 4000
if ($BudgetYaml -match "core_total_tokens:\s*(\d+)") { $CoreBudget = [int]$Matches[1] }

$Core = Get-ChildItem (Join-Path $Root "rules") -File -Filter "*.md" | Where-Object { $_.Name -ne "README.md" }
$CoreChars = ($Core | ForEach-Object { (Get-Content -Raw -Encoding UTF8 $_.FullName).Length } | Measure-Object -Sum).Sum
$CoreTokens = [math]::Ceiling($CoreChars / 3.6)
if ($CoreTokens -gt $CoreBudget) { $Problems.Add("Core token budget exceeded: $CoreTokens > $CoreBudget") }

foreach ($Platform in @("codex", "grok", "antigravity", "cursor")) {
  $Overlay = Join-Path $Root "platforms\$Platform\$Platform-overlay.md"
  if (-not (Test-Path $Overlay)) { $Problems.Add("Missing overlay: $Overlay"); continue }
  $Tokens = [math]::Ceiling((Get-Content -Raw -Encoding UTF8 $Overlay).Length / 3.6)
  if ($Tokens -gt 600) { $Problems.Add("$Platform overlay budget exceeded: $Tokens") }
}

$SkillFiles = Get-ChildItem (Join-Path $Root "skills") -Directory | ForEach-Object {
  Join-Path $_.FullName "SKILL.md"
} | Where-Object { Test-Path $_ }

$Slugs = @()
foreach ($SkillPath in $SkillFiles) {
  $Slugs += (Split-Path $SkillPath -Parent | Split-Path -Leaf)
  $Tokens = [math]::Ceiling((Get-Content -Raw -Encoding UTF8 $SkillPath).Length / 3.6)
  if ($Tokens -gt 3500) {
    $Problems.Add("Skill token budget exceeded: $SkillPath = $Tokens")
  }
}

$Duplicates = $Slugs | Group-Object | Where-Object Count -gt 1
foreach ($Dup in $Duplicates) { $Problems.Add("Duplicate skill slug: $($Dup.Name)") }

$RequiredPaths = @(
  "guides\00-system-map.md",
  "integrations\registry.json",
  "projects\5fedu\AGENTS.md",
  "projects\5fedu\00-context-map.md",
  "projects\5fedu\decisions.md",
  "skills\plan-and-handoff\SKILL.md"
)
foreach ($Path in $RequiredPaths) {
  if (-not (Test-Path (Join-Path $Root $Path))) { $Problems.Add("Missing required path: $Path") }
}

$ForbiddenTopLevel = @(
  "00-huong-dan", "00-guides", "01-global", "02-du-an", "02-projects",
  "03-nen-tang", "03-platforms", "04-tu-dong-hoa", "04-automation",
  "06-ke-hoach", "06-plans", "05-ban-dung", "knowledge", "build", "docs", "plan"
)
foreach ($Name in $ForbiddenTopLevel) {
  if (Test-Path (Join-Path $Root $Name)) { $Problems.Add("Legacy top-level folder still exists: $Name") }
}

$LegacyDocNames = @("00-ban-do-he-thong.md", "01-mo-hinh-runtime.md", "02-he-thong-tri-thuc.md", "03-tich-hop-va-dong-bo.md", "04-bao-tri-va-rui-ro.md")
foreach ($Name in $LegacyDocNames) {
  if (Get-ChildItem $Root -Recurse -File -Filter $Name -ErrorAction SilentlyContinue) {
    $Problems.Add("Legacy Vietnamese doc remains: $Name")
  }
}

$RegistryPath = Join-Path $Root "integrations\registry.json"
if (Test-Path $RegistryPath) {
  $Registry = Get-Content -Raw $RegistryPath | ConvertFrom-Json
  foreach ($Integration in $Registry.integrations) {
    if (-not (Test-Path (Join-Path $Root $Integration.path))) {
      $Problems.Add("Integration registry path missing: $($Integration.path)")
    }
    if ($Integration.name -eq "context7") {
      $CursorAdapter = Join-Path $Root $Integration.path "adapters\cursor.json"
      if (-not (Test-Path $CursorAdapter)) { $Problems.Add("Missing context7 cursor adapter: $CursorAdapter") }
    }
  }
}

$TriggerAuditPath = Join-Path $Root "automation\trigger-audit.json"
if (Test-Path $TriggerAuditPath) {
  $Cases = Get-Content -Raw $TriggerAuditPath | ConvertFrom-Json
  foreach ($Case in $Cases) {
    $TargetPath = $null
    $Body = ""
    if ($Case.skill) {
      $TargetPath = Join-Path $Root "skills\$($Case.skill)\SKILL.md"
    } elseif ($Case.file) {
      $TargetPath = Join-Path $Root ($Case.file -replace "/", "\")
    }
    if (-not $TargetPath -or -not (Test-Path $TargetPath)) {
      $Problems.Add("Trigger audit target missing for '$($Case.phrase)': $TargetPath")
      continue
    }
    $Body = (Get-Content -Raw -Encoding UTF8 $TargetPath).ToLowerInvariant()
    foreach ($Kw in $Case.keywords) {
      if ($Body -notlike "*$($Kw.ToLowerInvariant())*") {
        $Problems.Add("Trigger audit recall fail '$($Case.phrase)': keyword '$Kw' not in $TargetPath")
        break
      }
    }
  }
} else {
  $Problems.Add("Missing trigger audit file: automation/trigger-audit.json")
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
$Mojibake = rg -n $MojibakePattern $Root -g "*.md" -g "*.ps1" -g "*.yaml" -g "*.toml" -g "!plans/**" -g "!05-generated/**" -g "!.git/**" 2>$null
if ($Mojibake) { $Problems.Add("Possible mojibake remains outside archive/build") }

if ($Problems.Count) {
  $Problems | ForEach-Object { Write-Error $_ }
  exit 1
}

Write-Host "Context validation PASS"
Write-Host "Core tokens (estimated): $CoreTokens"
Write-Host "Skills: $($Slugs.Count)"
Write-Host "Trigger audit cases: $((Get-Content -Raw $TriggerAuditPath | ConvertFrom-Json).Count)"
