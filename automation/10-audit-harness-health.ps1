param(
  [string]$Root = (Split-Path -Parent $PSScriptRoot),
  [string]$DebugLog = (Join-Path $Root ".cursor/debug-d2ae37.log"),
  [string]$RunId = "audit-pre"
)
$ErrorActionPreference = "Continue"
. (Join-Path $PSScriptRoot "path-compat.ps1")

function Write-DebugLog {
  param([string]$HypothesisId, [string]$Location, [string]$Message, $Data)
  $Entry = [ordered]@{
    sessionId = "d2ae37"
    runId = $RunId
    hypothesisId = $HypothesisId
    location = $Location
    message = $Message
    data = $Data
    timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  }
  $Line = ($Entry | ConvertTo-Json -Compress -Depth 6)
  # #region agent log
  try {
    $dir = Split-Path -Parent $DebugLog
    if ($dir -and -not (Test-Path $dir)) {
      New-Item -ItemType Directory -Force -Path $dir | Out-Null
    }
    Add-Content -Encoding UTF8 -Path $DebugLog -Value $Line -ErrorAction SilentlyContinue
  } catch {
    # debug log must never fail the audit
  }
  # #endregion
}

$Findings = [System.Collections.Generic.List[object]]::new()

function Add-Finding {
  param([string]$Category, [string]$Id, [string]$Severity, [string]$Detail, [string]$HypothesisId)
  $Findings.Add([ordered]@{
    category = $Category
    id = $Id
    severity = $Severity
    detail = $Detail
    hypothesisId = $HypothesisId
  }) | Out-Null
}

# H1/H2: UI routing audit
$UiAudit = Join-Path $Root "automation\audit-ui-routing.ps1"
$UiProblems = @()
if (Test-Path $UiAudit) {
  try {
    & $UiAudit -Root $Root -RunId $RunId 2>&1 | ForEach-Object { $UiProblems += "$_" }
  } catch {
    $UiProblems += $_.Exception.Message
  }
  if ($LASTEXITCODE -ne 0 -and $UiProblems.Count -eq 0) {
    $UiProblems += "ui-routing audit exit $LASTEXITCODE"
  }
  Write-DebugLog "H1" "audit-harness-health.ps1:ui-routing" "ui-routing-exit" @{
    exitCode = $LASTEXITCODE
    problems = @($UiProblems)
  }
  if ($LASTEXITCODE -ne 0) {
    foreach ($P in $UiProblems) {
      Add-Finding "workflow" "ui-routing-audit" "fail" $P "H1"
    }
  }
}

# H1b: plan artifact audit
$PlanAudit = Join-Path $Root "automation\audit-plan-artifact.ps1"
if (Test-Path $PlanAudit) {
  $PlanProblems = @()
  try {
    & $PlanAudit -Root $Root -RunId $RunId 2>&1 | ForEach-Object { $PlanProblems += "$_" }
  } catch {
    $PlanProblems += $_.Exception.Message
  }
  if ($LASTEXITCODE -ne 0 -and $PlanProblems.Count -eq 0) {
    $PlanProblems += "plan-artifact audit exit $LASTEXITCODE"
  }
  Write-DebugLog "H1b" "audit-harness-health.ps1:plan-artifact" "plan-artifact-exit" @{
    exitCode = $LASTEXITCODE
    problems = @($PlanProblems)
  }
  if ($LASTEXITCODE -ne 0) {
    foreach ($P in $PlanProblems) {
      Add-Finding "workflow" "plan-artifact-audit" "fail" $P "H1b"
    }
  }
}

# H2: keyword gap ui-delivery
$UiPath = Join-Path $Root "projects\5fedu\domains\ui-delivery.md"
if (Test-Path $UiPath) {
  $UiBody = (Get-Content -Raw -Encoding UTF8 $UiPath).ToLowerInvariant()
  $HasSuaModule = $UiBody -like "*sửa module*"
  Write-DebugLog "H2" "audit-harness-health.ps1:ui-delivery" "keyword-sua-module" @{ present = $HasSuaModule }
  if (-not $HasSuaModule) {
    Add-Finding "desync" "ui-delivery-keyword" "fail" "audit expects 'sửa module' literal; doc uses 'sửa/tạo' variants only" "H2"
  }
}

# H1: skill references checklist in module-mapping
$SkillPath = Join-Path $Root "skills\5fedu-module-parity\SKILL.md"
$MapPath = Join-Path $Root "projects\5fedu\domains\module-mapping.md"
if ((Test-Path $SkillPath) -and (Test-Path $MapPath)) {
  $Skill = Get-Content -Raw -Encoding UTF8 $SkillPath
  $Map = Get-Content -Raw -Encoding UTF8 $MapPath
  $RefsClone = $Skill -match "Clone checklist.*module-mapping"
  $HasCloneSection = $Map.ToLowerInvariant() -like "*clone checklist*"
  Write-DebugLog "H1" "audit-harness-health.ps1:module-mapping" "clone-checklist-gap" @{
    skillReferences = [bool]$RefsClone
    mappingHasSection = $HasCloneSection
  }
  if ($RefsClone -and -not $HasCloneSection) {
    Add-Finding "logic" "clone-checklist-missing" "fail" "5fedu-module-parity points to Clone checklist in module-mapping.md but section absent" "H1"
  }
}

# H3: known-5fedu-repos stale layout claim
$KnownPath = Join-Path $Root "projects\known-5fedu-repos.md"
$TahDomains = Test-Path "/home/linhnxdeveloper/Projects/Tah-app/context/5fedu/domains"
$KnownBody = if (Test-Path $KnownPath) { Get-Content -Raw -Encoding UTF8 $KnownPath } else { "" }
$ClaimsLegacy = $KnownBody -like "*layout context cũ*"
Write-DebugLog "H3" "audit-harness-health.ps1:known-repos" "layout-doc-vs-tah" @{
  docClaimsLegacyLayout = $ClaimsLegacy
  tahHasDomains = $TahDomains
}
if ($ClaimsLegacy -and $TahDomains) {
  Add-Finding "desync" "known-5fedu-repos-stale" "warn" "known-5fedu-repos.md says legacy layout; tah-app already has context/5fedu/domains/" "H3"
}

# H4: maturity trigger count drift
$MaturityPath = Join-Path $Root "guides\05-maturity.md"
$TriggerPath = Join-Path $Root "automation\trigger-audit.json"
$TriggerCount = 0
if (Test-Path $TriggerPath) {
  $TriggerCount = @((Get-Content -Raw -Encoding UTF8 $TriggerPath | ConvertFrom-Json)).Count
}
$Maturity = if (Test-Path $MaturityPath) { Get-Content -Raw -Encoding UTF8 $MaturityPath } else { "" }
$Claims23 = $Maturity -match "23/23"
Write-DebugLog "H4" "audit-harness-health.ps1:maturity" "trigger-count-drift" @{
  maturitySays23 = [bool]$Claims23
  actualTriggerCases = $TriggerCount
}
if ($Claims23 -and $TriggerCount -ne 23) {
  Add-Finding "desync" "maturity-trigger-count" "warn" "guides/05-maturity.md says 23/23; trigger-audit.json has $TriggerCount cases" "H4"
}

# H5: duplication token estimate
$ParitySkill = if (Test-Path $SkillPath) { (Get-Content -Raw -Encoding UTF8 $SkillPath).Length } else { 0 }
$UiLen = if (Test-Path $UiPath) { (Get-Content -Raw -Encoding UTF8 $UiPath).Length } else { 0 }
$MapLen = if (Test-Path $MapPath) { (Get-Content -Raw -Encoding UTF8 $MapPath).Length } else { 0 }
Write-DebugLog "H5" "audit-harness-health.ps1:duplication" "parity-doc-chars" @{
  skillChars = $ParitySkill
  uiDeliveryChars = $UiLen
  moduleMappingChars = $MapLen
  totalChars = ($ParitySkill + $UiLen + $MapLen)
}
 $SingleOwnerRouting =
  ($Skill -match "Checklist.*chỉ.*file\s+này") -and
  ($UiBody -match "không\s+lặp\s+checklist") -and
  ($Map.ToLowerInvariant() -match "clone checklist")
if (($ParitySkill + $UiLen + $MapLen) -gt 12000 -and -not $SingleOwnerRouting) {
  Add-Finding "concept" "parity-triple-stack" "warn" "ui-delivery + module-mapping + 5fedu-module-parity exceed the context budget without explicit single-owner routing (~$([math]::Ceiling(($ParitySkill+$UiLen+$MapLen)/3.6)) tokens)" "H5"
}

# H6: project-local in canonical template
$PlPath = Join-Path $Root "projects\5fedu\project-local"
$PlFiles = if (Test-Path $PlPath) {
  @(Get-ChildItem $PlPath -File | Where-Object { $_.Name -ne "README.md" })
} else { @() }
Write-DebugLog "H6" "audit-harness-health.ps1:project-local" "template-project-local" @{ fileCount = $PlFiles.Count }
if ($PlFiles.Count -gt 0) {
  Add-Finding "redundant" "canonical-project-local" "warn" "projects/5fedu/project-local/ has $($PlFiles.Count) non-README files in harness template" "H6"
}

# H7: legacy references in evidence
$CoveragePath = Join-Path $Root "projects\5fedu\evidence\coverage-audit.md"
if (Test-Path $CoveragePath) {
  $Cov = Get-Content -Raw -Encoding UTF8 $CoveragePath
  $Refs00Index = ([regex]::Matches($Cov, "00-index\.md")).Count
  Write-DebugLog "H7" "audit-harness-health.ps1:legacy-refs" "coverage-audit-legacy-refs" @{ count00Index = $Refs00Index }
  if ($Refs00Index -gt 5) {
    Add-Finding "redundant" "evidence-legacy-refs" "warn" "evidence/coverage-audit.md still heavily references 00-index.md ($Refs00Index times) while router is 00-context-map.md" "H7"
  }
}

# H8: debug artifact in repo root
$DebugArtifact = Join-Path $Root "debug-af8c2b.log"
$CursorValidateLog = Join-Path $Root ".cursor\validate-ui-routing.log"
Write-DebugLog "H8" "audit-harness-health.ps1:artifacts" "debug-log-artifact" @{
  legacyRootLog = (Test-Path $DebugArtifact)
  cursorValidateLog = (Test-Path $CursorValidateLog)
}
if (Test-Path $DebugArtifact) {
  Add-Finding "redundant" "debug-af8c2b-log" "warn" "debug-af8c2b.log in repo root - remove or gitignore" "H8"
}

# H9: trigger-audit full run
if (Test-Path $TriggerPath) {
  $Cases = Get-Content -Raw -Encoding UTF8 $TriggerPath | ConvertFrom-Json
  $Fails = @()
  foreach ($Case in $Cases) {
    $TargetPath = $null
    if ($Case.skill) { $TargetPath = Join-Path $Root "skills\$($Case.skill)\SKILL.md" }
    elseif ($Case.file) { $TargetPath = Join-Path $Root ($Case.file -replace "/", "\") }
    if (-not $TargetPath -or -not (Test-Path $TargetPath)) {
      $Fails += "missing target: $($Case.phrase)"
      continue
    }
    $Body = (Get-Content -Raw -Encoding UTF8 $TargetPath).ToLowerInvariant()
    foreach ($Kw in $Case.keywords) {
      if ($Body -notlike "*$($Kw.ToLowerInvariant())*") {
        $Fails += "$($Case.phrase): missing '$Kw'"
        break
      }
    }
  }
  Write-DebugLog "H9" "audit-harness-health.ps1:trigger-audit" "trigger-audit-results" @{
    total = $Cases.Count
    failCount = $Fails.Count
    fails = @($Fails)
  }
  foreach ($F in $Fails) {
    Add-Finding "workflow" "trigger-audit" "fail" $F "H9"
  }
}

# H10: validate-context overall
$ValidateScript = Join-Path $Root "automation\03-validate-context.ps1"
$ValOut = @()
try {
  $ValOut = @(& $ValidateScript 2>&1 | ForEach-Object { "$_" })
} catch {
  $ValOut += $_.Exception.Message
}
Write-DebugLog "H10" "audit-harness-health.ps1:validate" "validate-context-exit" @{
  exitCode = $LASTEXITCODE
  output = @($ValOut)
}

# H11: Slice Gate Protocol wiring
$Rule26Path = Join-Path $Root "rules\26-slice-completion-gate.md"
$SgpPath = Join-Path $Root "skills\finish-to-completion\references\slice-gate-protocol.md"
$FtcSkillPath = Join-Path $Root "skills\finish-to-completion\SKILL.md"
$ManifestPath = Join-Path $Root "rules\manifest.yaml"
$H11Problems = @()
if (-not (Test-Path $Rule26Path)) {
  $H11Problems += "missing rules/26-slice-completion-gate.md"
}
if (-not (Test-Path $SgpPath)) {
  $H11Problems += "missing skills/finish-to-completion/references/slice-gate-protocol.md"
}
if (Test-Path $ManifestPath) {
  $ManifestBody = Get-Content -Raw -Encoding UTF8 $ManifestPath
  if ($ManifestBody -match "load_order:[\s\S]*26-slice-completion-gate\.md") {
    $H11Problems += "rules/manifest.yaml must keep slice gate lazy; remove 26-slice-completion-gate.md from load_order"
  }
} else {
  $H11Problems += "missing rules/manifest.yaml"
}
if (Test-Path $FtcSkillPath) {
  $FtcBody = Get-Content -Raw -Encoding UTF8 $FtcSkillPath
  if ($FtcBody -notlike "*slice-gate-protocol*") {
    $H11Problems += "finish-to-completion/SKILL.md missing slice-gate-protocol reference"
  }
} else {
  $H11Problems += "missing skills/finish-to-completion/SKILL.md"
}
if (Test-Path $Rule26Path) {
  $Rule26Body = Get-Content -Raw -Encoding UTF8 $Rule26Path
  if ($Rule26Body -notlike "*slice-gate-protocol*") {
    $H11Problems += "rules/26-slice-completion-gate.md missing slice-gate-protocol pointer"
  }
}
$PahSkillPath = Join-Path $Root "skills\plan-and-handoff\SKILL.md"
if (Test-Path $PahSkillPath) {
  $PahBody = Get-Content -Raw -Encoding UTF8 $PahSkillPath
  if ($PahBody -notlike "*slice-gate-protocol*") {
    $H11Problems += "plan-and-handoff/SKILL.md missing slice-gate-protocol reference"
  }
} else {
  $H11Problems += "missing skills/plan-and-handoff/SKILL.md"
}
$ClPath = Join-Path $Root "skills\finish-to-completion\references\completion-ledger.md"
if (Test-Path $ClPath) {
  $ClBody = Get-Content -Raw -Encoding UTF8 $ClPath
  if ($ClBody -notlike "*slice-gate-protocol*") {
    $H11Problems += "completion-ledger.md missing slice-gate-protocol reference"
  }
} else {
  $H11Problems += "missing skills/finish-to-completion/references/completion-ledger.md"
}
Write-DebugLog "H11" "audit-harness-health.ps1:slice-gate" "sgp-wiring" @{
  problems = @($H11Problems)
}
foreach ($P in $H11Problems) {
  Add-Finding "workflow" "slice-gate-protocol" "fail" $P "H11"
}

# H12: Grok dual-tree / inject lean (when home present)
$UserHome = if ($env:USERPROFILE) { $env:USERPROFILE } elseif ($env:HOME) { $env:HOME } else { $null }
if ($UserHome) {
  $GrokHome = if ($env:GROK_HOME) { $env:GROK_HOME } else { Join-Path $UserHome ".grok" }
  $Inject = Join-Path (Join-Path $GrokHome ".grok") "rules"
  if (Test-Path $Inject) {
    $Legacy = @("00-index.md", "01-agent-workflow-sop.md", "antigravity-overlay.md")
    $Hits = @($Legacy | Where-Object { Test-Path (Join-Path $Inject $_) })
    if ($Hits.Count -gt 0) {
      Add-Finding "desync" "grok-legacy-inject" "fail" "Legacy dual-tree markers in $Inject : $($Hits -join ', ')" "H12"
    } elseif (-not (Test-Path (Join-Path $Inject "00-bootstrap.md"))) {
      Add-Finding "desync" "grok-inject-missing-lean" "fail" "Inject path lacks lean 00-bootstrap.md: $Inject" "H12"
    }
  }
}

# H13: intentional oversize documented (must not pressure FAIL on docs-style/plan-and-handoff size alone)
$BudgetPath = Join-Path $Root "rules\50-context-budget.md"
if (Test-Path $BudgetPath) {
  $Bb = Get-Content -Raw -Encoding UTF8 $BudgetPath
  if ($Bb -notlike "*Intentional oversize*" -or $Bb -notlike "*docs-style*") {
    Add-Finding "desync" "intentional-oversize-missing" "fail" "50-context-budget missing intentional oversize intent" "H13"
  }
}

# H14: progressive context graph is generated and structurally usable
$GraphPath = Join-Path $Root "05-generated\context-graph.json"
if (-not (Test-Path $GraphPath)) {
  Add-Finding "workflow" "context-graph-missing" "fail" "05-generated/context-graph.json is missing; run build-context-graph.ps1" "H14"
} else {
  try {
    $Graph = Get-Content -Raw -Encoding UTF8 $GraphPath | ConvertFrom-Json
    $GraphNodes = @($Graph.nodes)
    $InvalidNodes = @($GraphNodes | Where-Object {
      [string]::IsNullOrWhiteSpace([string]$_.id) -or
      [string]::IsNullOrWhiteSpace([string]$_.source) -or
      [string]::IsNullOrWhiteSpace([string]$_.load_policy) -or
      [string]::IsNullOrWhiteSpace([string]$_.owner) -or
      [string]::IsNullOrWhiteSpace([string]$_.source_hash) -or
      $null -eq $_.routing
    })
    $GraphIds = @($GraphNodes | ForEach-Object { [string]$_.id })
    $DuplicateIds = @($GraphIds | Group-Object | Where-Object Count -gt 1)
    Write-DebugLog "H14" "audit-harness-health.ps1:context-graph" "graph-structure" @{
      version = $Graph.version
      nodeCount = $GraphNodes.Count
      invalidCount = $InvalidNodes.Count
      duplicateIdCount = $DuplicateIds.Count
    }
    if ([int]$Graph.version -lt 2) {
      Add-Finding "workflow" "context-graph-old-schema" "fail" "context graph schema is $($Graph.version); expected >= 2" "H14"
    }
    if ($GraphNodes.Count -lt 20) {
      Add-Finding "workflow" "context-graph-too-small" "fail" "context graph has only $($GraphNodes.Count) nodes" "H14"
    }
    if ($InvalidNodes.Count -gt 0) {
      Add-Finding "workflow" "context-graph-invalid" "fail" "context graph has $($InvalidNodes.Count) nodes without id/source/load_policy" "H14"
    }
    if ($DuplicateIds.Count -gt 0) {
      Add-Finding "workflow" "context-graph-duplicate-ids" "fail" "context graph has $($DuplicateIds.Count) duplicate node ids" "H14"
    }
  } catch {
    Add-Finding "workflow" "context-graph-invalid-json" "fail" "cannot parse 05-generated/context-graph.json: $($_.Exception.Message)" "H14"
  }
}

Write-DebugLog "summary" "audit-harness-health.ps1:end" "findings-summary" @{
  findingCount = $Findings.Count
  byCategory = ($Findings | Group-Object category | ForEach-Object { @{ $_.Name = $_.Count } })
  findings = @($Findings)
}

if ($Findings.Count -gt 0) {
  $Findings | ForEach-Object {
    Write-Host "[$($_.severity)] $($_.category)/$($_.id): $($_.detail)"
  }
  $Failures = @($Findings | Where-Object severity -eq "fail")
  if ($Failures.Count -gt 0) { exit 1 }
}

Write-Host "Harness health audit PASS"
exit 0
