$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Problems = [System.Collections.Generic.List[string]]::new()

$ManifestPath = Join-Path $Root "rules\manifest.yaml"
$BudgetYaml = if (Test-Path $ManifestPath) { Get-Content -Raw $ManifestPath } else { "" }
$CoreBudget = 4000
if ($BudgetYaml -match "core_total_tokens:\s*(\d+)") { $CoreBudget = [int]$Matches[1] }

$ManifestContent = if (Test-Path $ManifestPath) { Get-Content -Raw $ManifestPath } else { "" }
$LoadOrderFiles = [System.Collections.Generic.List[string]]::new()
if ($ManifestContent -match "(?ms)load_order:\s*\r?\n(.*?)(?=\r?\n\w+:|$)") {
  $Block = $Matches[1]
  foreach ($Line in ($Block -split "`n")) {
    if ($Line -match "-\s*(\S+)") { $LoadOrderFiles.Add($Matches[1]) }
  }
}
$Core = $LoadOrderFiles | ForEach-Object { Join-Path $Root "rules\$_" } | Where-Object { Test-Path $_ }
$CoreChars = ($Core | ForEach-Object { (Get-Content -Raw -Encoding UTF8 $_).Length } | Measure-Object -Sum).Sum
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
  "guides\05-maturity.md",
  "integrations\registry.json",
  "projects\5fedu\AGENTS.md",
  "projects\5fedu\00-context-map.md",
  "projects\5fedu\decisions.md",
  "rules\05-critical-thinking.md",
  "rules\16-context-style.md",
  "rules\25-task-lifecycle.md",
  "skills\plan-and-handoff\SKILL.md"
  "skills\plan-and-handoff\references\plan-artifact-template.md"
  "skills\plan-and-handoff\references\capability-tier-routing.md"
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

if (Test-Path (Join-Path $Root "plans")) { $Problems.Add("Legacy plans/ folder still exists") }

$TracePath = Join-Path $Root ".agent\trace.jsonl"
if (Test-Path $TracePath) {
  $TraceLines = @(Get-Content $TracePath -ErrorAction SilentlyContinue | Where-Object { $_.Trim() })
  if ($TraceLines.Count -gt 0) {
    $MissingFriction = 0
    foreach ($Line in $TraceLines) {
      try {
        $Obj = $Line | ConvertFrom-Json
        if (-not $Obj.PSObject.Properties.Name -contains "friction") { $MissingFriction++ }
      } catch { $MissingFriction++ }
    }
    if ($MissingFriction -gt 0) {
      Write-Warning "Advisory: $MissingFriction trace line(s) missing friction field in .agent/trace.jsonl"
    }
    Write-Host "Advisory trace lines: $($TraceLines.Count)"
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
      $CursorAdapter = Join-Path (Join-Path $Root $Integration.path) "adapters\cursor.json"
      if (-not (Test-Path $CursorAdapter)) { $Problems.Add("Missing context7 cursor adapter: $CursorAdapter") }
    }
  }
}

$TriggerAuditPath = Join-Path $Root "automation\trigger-audit.json"
if (Test-Path $TriggerAuditPath) {
  $Cases = Get-Content -Raw -Encoding UTF8 $TriggerAuditPath | ConvertFrom-Json
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

$UiRoutingAudit = Join-Path $Root "automation\audit-ui-routing.ps1"
if (Test-Path $UiRoutingAudit) {
  $UiLogPath = Join-Path $Root ".agent\validate-ui-routing.log"
  $UiLogDir = Split-Path $UiLogPath -Parent
  if (-not (Test-Path $UiLogDir)) { New-Item -ItemType Directory -Force -Path $UiLogDir | Out-Null }
  try {
    & $UiRoutingAudit -Root $Root -RunId validate-context -LogPath $UiLogPath | Out-Null
    if ($LASTEXITCODE -ne 0) {
      $Problems.Add("UI routing audit failed - see .agent/validate-ui-routing.log and automation/audit-ui-routing.ps1")
    }
  } catch {
    $Problems.Add("UI routing audit crashed - error: $_ - see .agent/validate-ui-routing.log")
  }
} else {
  $Problems.Add("Missing UI routing audit: automation/audit-ui-routing.ps1")
}

$PlanArtifactAudit = Join-Path $Root "automation\audit-plan-artifact.ps1"
if (Test-Path $PlanArtifactAudit) {
  try {
    & $PlanArtifactAudit -Root $Root -RunId validate-context 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
      $Problems.Add("Plan artifact audit failed - run automation/audit-plan-artifact.ps1")
    }
  } catch {
    $Problems.Add("Plan artifact audit crashed - error: $_")
  }
} else {
  $Problems.Add("Missing plan artifact audit: automation/audit-plan-artifact.ps1")
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
if (Get-Command rg -ErrorAction SilentlyContinue) {
  $Mojibake = rg -n $MojibakePattern $Root -g "*.md" -g "*.ps1" -g "*.yaml" -g "*.toml" -g "!05-generated/**" -g "!.git/**" 2>$null
  if ($Mojibake) { $Problems.Add("Possible mojibake remains outside archive/build") }
} else {
  Write-Warning "ripgrep (rg) is not found, skipping mojibake check."
}

$PurityAudit = Join-Path $PSScriptRoot "audit-5fedu-template-purity.ps1"
if (Test-Path $PurityAudit) {
  try {
    & $PurityAudit | Out-Null
    if ($LASTEXITCODE -ne 0) {
      $Problems.Add("5fedu template purity audit failed - run automation/audit-5fedu-template-purity.ps1 for details")
    }
  } catch {
    $Problems.Add("5fedu template purity audit crashed - error: $_")
  }
}

if ($Problems.Count) {
  $Problems | ForEach-Object { Write-Error $_ }
  exit 1
}

Write-Host "Context validation PASS"
Write-Host "Core tokens (estimated): $CoreTokens"
Write-Host "Skills: $($Slugs.Count)"
Write-Host "Trigger audit cases: $((Get-Content -Raw $TriggerAuditPath | ConvertFrom-Json).Count)"
