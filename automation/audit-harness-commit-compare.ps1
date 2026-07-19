# Compare harness execution power across commits - writes NDJSON audit evidence
param(
  [string]$Base = "15f8834",
  [string]$Mid = "6b485c0",
  [string]$New = "62d63a9",
  [switch]$IncludeWorkingTree,
  [string]$LogPath = (Join-Path (Split-Path -Parent $PSScriptRoot) ".cursor\debug-75fce4.log")
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

function Write-AuditLog {
  param([string]$HypothesisId, [string]$Location, [string]$Message, [hashtable]$Data)
  $entry = @{
    sessionId    = "75fce4"
    runId        = "commit-compare"
    hypothesisId = $HypothesisId
    location     = $Location
    message      = $Message
    data         = $Data
    timestamp    = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  } | ConvertTo-Json -Compress -Depth 6
  Add-Content -LiteralPath $LogPath -Value $entry -Encoding UTF8
}

function Get-GitFile {
  param([string]$Commit, [string]$Path)
  try { git show "${Commit}:${Path}" 2>$null } catch { $null }
}

function Get-WorkFile {
  param([string]$Path)
  $full = Join-Path $Root $Path
  if (-not (Test-Path $full)) { return $null }
  Get-Content -Raw -Encoding UTF8 $full
}

function Test-ContentMatch {
  param([string]$Text, [string]$Pattern)
  if (-not $Text) { return $false }
  return [bool]($Text -match $Pattern)
}

$files = @(
  "rules/10-execution.md",
  "rules/25-task-lifecycle.md",
  "rules/05-critical-thinking.md",
  "skills/finish-to-completion/SKILL.md",
  "skills/plan-and-handoff/SKILL.md"
)

$checks = [ordered]@{
  proactive_expand_qa           = 'Proactively inspect the broader context'
  finish_default_one_liner      = 'Use finish-to-completion for execution tasks'
  normal_require_plan           = 'require plan-and-handoff'
  normal_bounded_only           = 'bounded validation'
  pipeline_five_step            = 'code-review \(strict review \+ clean-code review\)'
  banned_ask_ab_only_blocked    = '\(unless BLOCKED\)'
}

Write-AuditLog -HypothesisId "H0" -Location "audit-harness-commit-compare.ps1:start" -Message "Commit compare audit started" -Data @{
  base = $Base; mid = $Mid; new = $New; files = $files.Count
}

foreach ($commit in @($Base, $Mid, $New)) {
  $rev = git rev-parse --short $commit 2>$null
  $subj = git log -1 --format="%s" $commit 2>$null
  Write-AuditLog -HypothesisId "H0" -Location "audit:commit-meta" -Message "Commit metadata" -Data @{ commit = $commit; rev = $rev; subject = $subj }
}

foreach ($name in $checks.Keys) {
  $pattern = $checks[$name]
  $row = @{ check = $name; pattern = $pattern }
  $commitMap = @{ base = $Base; mid = $Mid; new = $New }
  if ($IncludeWorkingTree) { $commitMap["work"] = "WORKING_TREE" }
  foreach ($label in $commitMap.GetEnumerator()) {
    $path = "rules/10-execution.md"
    if ($name -match 'normal_|tiny_|lane') { $path = "rules/25-task-lifecycle.md" }
    if ($name -match 'proactive') { $path = "rules/05-critical-thinking.md" }
    if ($name -match 'turn0|banned_ask') { $path = "skills/finish-to-completion/SKILL.md" }
    if ($name -match 'require_plan' -and $name -eq 'normal_require_plan') { $path = "rules/25-task-lifecycle.md" }
    if ($name -match 'bounded') { $path = "rules/25-task-lifecycle.md" }
    if ($name -match 'pipeline|finish_default') { $path = "rules/10-execution.md" }
    if ($label.Key -eq "work") {
      $text = Get-WorkFile -Path $path
    } else {
      $text = Get-GitFile -Commit $label.Value -Path $path
    }
    $row[$label.Key] = (Test-ContentMatch -Text $text -Pattern $pattern)
  }
  Write-AuditLog -HypothesisId "H1" -Location "audit:power-signals" -Message "Execution power signal" -Data $row
}

# Token budget always-load rules
foreach ($label in @{ base = $Base; mid = $Mid; new = $New }.GetEnumerator()) {
  $chars = 0
  $manifest = Get-GitFile -Commit $label.Value -Path "rules/manifest.yaml"
  if ($manifest -match '(?s)load_order:\s*\r?\n((?:[ \t]+-\s+\S+\r?\n)+)') {
    foreach ($line in ($Matches[1] -split "`n")) {
      if ($line -match '-\s*(\S+)') {
        $f = Get-GitFile -Commit $label.Value -Path ("rules/" + $Matches[1])
        if ($f) { $chars += $f.Length }
      }
    }
  }
  $tokens = [math]::Ceiling($chars / 3.6)
  $budgetLimit = 7000
  if ($manifest -match 'core_total_tokens:\s*(\d+)') { $budgetLimit = [int]$Matches[1] }
  Write-AuditLog -HypothesisId "H2" -Location "audit:token-budget" -Message "Core always-load token estimate" -Data @{
    commit = $label.Value; coreChars = $chars; coreTokensEst = $tokens; budgetLimit = $budgetLimit
  }
}

# New-commit regressions vs base
$baseExec = Get-GitFile -Commit $Base -Path "rules/10-execution.md"
$newExec = Get-GitFile -Commit $New -Path "rules/10-execution.md"
$baseLife = Get-GitFile -Commit $Base -Path "rules/25-task-lifecycle.md"
$newLife = Get-GitFile -Commit $New -Path "rules/25-task-lifecycle.md"

$regressions = @()
if ((Test-ContentMatch $baseExec 'Use finish-to-completion for execution tasks') -and (Test-ContentMatch $newExec 'plan-and-handoff \(khi normal/high-risk\)')) {
  $regressions += "pipeline_replaces_finish_default"
}
if ((Test-ContentMatch $baseLife 'bounded validation') -and (Test-ContentMatch $newLife 'require plan-and-handoff')) {
  $regressions += "normal_lane_now_requires_plan"
}
if ((Test-ContentMatch (Get-GitFile $Base "rules/05-critical-thinking.md") 'Proactively inspect') -and -not (Test-ContentMatch (Get-GitFile $New "rules/05-critical-thinking.md") 'Proactively inspect')) {
  $regressions += "critical_thinking_narrowed"
}
Write-AuditLog -HypothesisId "H3" -Location "audit:regressions" -Message "$New regressions vs $Base" -Data @{
  count = $regressions.Count; items = $regressions
}

# Gains from new commit
$gains = @()
if (Test-Path (Join-Path $Root "automation/audit-5fedu-template-purity.ps1")) { } else {
  $purity = Get-GitFile -Commit $New -Path "automation/audit-5fedu-template-purity.ps1"
  if ($purity) { $gains += "template_purity_audit" }
}
$newSkills = @(git diff --name-only $Base $New -- skills/ 2>$null)
if ($newSkills -match 'clean-code') { $gains += "clean_code_skill" }
$govBase = (Get-GitFile $Base "rules/40-harness-governance.md").Length
$govNew = (Get-GitFile $New "rules/40-harness-governance.md").Length
if ($govNew -lt $govBase) { $gains += "governance_slimmed_chars_saved=$($govBase - $govNew)" }

Write-AuditLog -HypothesisId "H4" -Location "audit:gains" -Message "$New gains vs $Base" -Data @{ items = $gains }

Write-Host "Audit complete. Log: $LogPath"
Write-Host "Regressions vs $Base in $New`: $($regressions -join ', ')"
Write-Host "Gains in $New`: $($gains -join ', ')"
