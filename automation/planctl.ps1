[CmdletBinding()]
param(
  [ValidateSet("validate", "compile", "init", "status", "start", "evidence", "block", "complete", "handoff", "revise", "gate", "report")]
  [string]$Action = "validate",
  [string]$Root = (Split-Path -Parent $PSScriptRoot),
  [string]$PlanPath = "",
  [string]$PlanId = "",
  [string]$Phase = "",
  [string]$SliceId = "",
  [string]$LedgerPath = "",
  [string]$AcId = "",
  [string]$Evidence = "",
  [string]$Command = "",
  [string]$Expected = "",
  [string]$Reason = "",
  [string]$OutputPath = "",
  [switch]$Strict,
  [switch]$Quiet
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "path-compat.ps1")
$StateRoot = Join-Path $Root ".agent\plans"

function Normalize-Id {
  param([string]$Value)
  $safe = ($Value -replace "[^A-Za-z0-9._-]", "-").Trim("-")
  if (-not $safe) { throw "Plan id is empty" }
  return $safe.ToLowerInvariant()
}

function Read-TextUtf8 {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { throw "Missing file: $Path" }
  return [IO.File]::ReadAllText((Resolve-Path -LiteralPath $Path), [Text.Encoding]::UTF8)
}

function Get-FrontMatter {
  param([string]$Body)
  $result = [ordered]@{}
  $match = [regex]::Match($Body, "(?ms)^---\s*\r?\n(?<yaml>.*?)\r?\n---\s*(?:\r?\n|$)")
  if (-not $match.Success) { return [pscustomobject]$result }
  foreach ($line in ($match.Groups["yaml"].Value -split "\r?\n")) {
    if ($line -match "^\s*([A-Za-z0-9_/-]+)\s*:\s*(.*?)\s*$") {
      $key = $Matches[1]
      $value = $Matches[2].Trim()
      if ($value -match "^\[(.*)\]$") {
        $items = $Matches[1]
        $result[$key] = @($items -split "," | ForEach-Object { $_.Trim().Trim("'").Trim('"') } | Where-Object { $_ })
      } else {
        $result[$key] = $value.Trim("'").Trim('"')
      }
    }
  }
  return [pscustomobject]$result
}

function Get-KeyValue {
  param([string]$Body, [string]$Key)
  $match = [regex]::Match($Body, "(?m)^\s*$([regex]::Escape($Key))\s*:\s*(?<value>[^\r\n]*)")
  if (-not $match.Success) { return "" }
  return $match.Groups["value"].Value.Trim()
}

function Get-IndentedBlock {
  param([string]$Body, [string]$Key)
  $lines = @($Body -split "\r?\n")
  $start = -1
  for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match "^\s*$([regex]::Escape($Key))\s*:") { $start = $i; break }
  }
  if ($start -lt 0) { return "" }
  $captured = [System.Collections.Generic.List[string]]::new()
  for ($j = $start + 1; $j -lt $lines.Count; $j++) {
    if ($lines[$j] -match "^\s*$" -or $lines[$j] -match "^\s+") {
      $captured.Add($lines[$j])
    } else {
      break
    }
  }
  return ($captured -join "`n")
}

function Get-Items {
  param([string]$Block)
  if (-not $Block) { return @() }
  return @($Block -split "\r?\n" | Where-Object { $_ -match "^\s+-\s+(.+)$" } | ForEach-Object { $Matches[1].Trim() })
}

function Get-PathReference {
  param([string]$Item)
  if (-not $Item) { return "" }
  if ($Item -match "\x60(?<path>[^\x60]+)\x60") { return $Matches["path"].Trim() }
  $candidate = ($Item -split "\s+\(")[0].Trim()
  return ($candidate -replace "^[-*]\s*", "").Trim()
}

function Resolve-PlanReference {
  param([string]$Reference)
  if (-not $Reference -or $Reference -match "^(?:null|none|https?://|<|\.\.\.)") { return $null }
  if ([IO.Path]::IsPathRooted($Reference)) { return $Reference }
  return (Join-Path $Root ($Reference -replace "/", "\"))
}

function Get-PhaseBlocks {
  param([string]$Body)
  $matches = [regex]::Matches($Body, "(?ms)^###\s+Phase\s+(?<id>P[0-9A-Za-z_-]+)\s*(?<title>[^\r\n]*)\r?\n(?<body>.*?)(?=^###\s+Phase\s+|\z)")
  return @($matches | ForEach-Object {
    [pscustomobject]@{
      id = $_.Groups["id"].Value.Trim()
      title = $_.Groups["title"].Value.Trim()
      body = $_.Groups["body"].Value
    }
  })
}

function Add-Diagnostic {
  param([System.Collections.Generic.List[object]]$List, [string]$Severity, [string]$Code, [string]$Message, [string]$PhaseId = "")
  $List.Add([pscustomobject]@{ severity = $Severity; code = $Code; phase = $PhaseId; message = $Message })
}

function Parse-Dependencies {
  param([string]$Value)
  if (-not $Value -or $Value -match "^\[\s*\]$") { return @() }
  if ($Value -match "^\[(.*)\]$") {
    return @($Matches[1] -split "," | ForEach-Object { $_.Trim().Trim("'").Trim('"') } | Where-Object { $_ -match "^P[0-9A-Za-z_-]+$" })
  }
  return @($Value -split "[ ,]+" | Where-Object { $_ -match "^P[0-9A-Za-z_-]+$" })
}

function Test-DependencyCycles {
  param([hashtable]$Graph, [System.Collections.Generic.List[object]]$Diagnostics)
  $visiting = @{}
  $visited = @{}
  function Visit([string]$Node, [string[]]$Stack) {
    if ($visiting[$Node]) {
      Add-Diagnostic $Diagnostics "error" "dependency-cycle" ("Dependency cycle detected: " + (($Stack + $Node) -join " -> "))
      return
    }
    if ($visited[$Node]) { return }
    $visiting[$Node] = $true
    foreach ($dependency in @($Graph[$Node])) {
      if ($Graph.ContainsKey($dependency)) { Visit $dependency ($Stack + $Node) }
      else { Add-Diagnostic $Diagnostics "error" "unknown-dependency" "Phase $Node depends on unknown phase $dependency" $Node }
    }
    $visiting.Remove($Node)
    $visited[$Node] = $true
  }
  foreach ($node in $Graph.Keys) { Visit $node @() }
}

function Compile-Plan {
  param([string]$Path)
  $body = Read-TextUtf8 $Path
  $meta = Get-FrontMatter $body
  $diagnostics = [System.Collections.Generic.List[object]]::new()
  foreach ($metaKey in @("plan_id", "revision", "workflow_mode", "status", "repo", "lane", "primary_skills", "preferred_tier", "plan_author_min_tier")) {
    if (-not ($meta.PSObject.Properties.Name -contains $metaKey)) {
      Add-Diagnostic $diagnostics "error" "missing-meta" "Plan metadata is missing '$metaKey'"
    }
  }
  foreach ($section in @("Scope lock", "Context routing", "Phases", "Known-unknowns", "Plan QA", "HANDOFF")) {
    if ($body -notmatch [regex]::Escape($section)) {
      Add-Diagnostic $diagnostics "error" "missing-section" "Plan is missing required section: $section"
    }
  }

  $phases = Get-PhaseBlocks $body
  if ($phases.Count -eq 0) { Add-Diagnostic $diagnostics "error" "no-phases" "Plan must contain at least one '### Phase Pn' block" }
  $deliverables = @([regex]::Matches($body, "(?m)^\s*-\s*(?<id>D[0-9]+)\s*:") | ForEach-Object { $_.Groups["id"].Value })
  $seenIds = @{}
  $seenAc = @{}
  $graph = @{}
  $compiledPhases = @()
  foreach ($phase in $phases) {
    if ($seenIds.ContainsKey($phase.id)) { Add-Diagnostic $diagnostics "error" "duplicate-phase" "Duplicate phase id $($phase.id)" $phase.id }
    $seenIds[$phase.id] = $true
    $graph[$phase.id] = @(Parse-Dependencies (Get-KeyValue $phase.body "depends_on"))
    $phaseErrorsBefore = $diagnostics.Count
    foreach ($key in @("goal", "depends_on", "preferred_tier", "min_tier", "allowed_tiers", "context_files", "files_touched", "contracts_refs", "edge_cases", "regression_map", "forbidden", "verify_gate", "exit_criteria")) {
      if ($phase.body -notmatch "(?m)^\s*$([regex]::Escape($key))\s*:") {
        Add-Diagnostic $diagnostics "error" "missing-phase-field" "Phase $($phase.id) is missing field '$key'" $phase.id
      }
    }
    $criteriaBlock = Get-IndentedBlock $phase.body "exit_criteria"
    $criteria = @([regex]::Matches($criteriaBlock, "(?m)^\s*-\s*\[[ x!]\]\s*(?<text>.+)$") | ForEach-Object { $_.Groups["text"].Value.Trim() })
    if ($criteria.Count -eq 0) { Add-Diagnostic $diagnostics "error" "no-acceptance-criteria" "Phase $($phase.id) needs at least one checkbox in exit_criteria" $phase.id }
    if ($criteria.Count -gt 8) { Add-Diagnostic $diagnostics "error" "too-many-acceptance-criteria" "Phase $($phase.id) has $($criteria.Count) AC; hard limit is 8" $phase.id }
    $fileItems = Get-Items (Get-IndentedBlock $phase.body "files_touched")
    $scopeLock = Get-KeyValue $phase.body "scope_lock"
    if ($deliverables.Count -gt 0 -and -not ($scopeLock -match "\bD[0-9]+\b")) {
      Add-Diagnostic $diagnostics "error" "unmapped-phase-scope" "Phase $($phase.id) scope_lock must map at least one deliverable id" $phase.id
    }
    if ($fileItems.Count -gt 5) { Add-Diagnostic $diagnostics "warning" "large-phase-file-scope" "Phase $($phase.id) names $($fileItems.Count) file entries; split unless this is one registry chain" $phase.id }
    $contextItems = Get-Items (Get-IndentedBlock $phase.body "context_files")
    if ($contextItems.Count -eq 0) { Add-Diagnostic $diagnostics "error" "empty-context-routing" "Phase $($phase.id) must name context_files" $phase.id }
    foreach ($item in $contextItems) {
      $reference = Get-PathReference $item
      if ($reference -match "^(?:path|file|<|\.\.\.)") { Add-Diagnostic $diagnostics "error" "context-placeholder" "Phase $($phase.id) has a placeholder context path" $phase.id; continue }
      $resolved = Resolve-PlanReference $reference
      if ($resolved -and -not (Test-Path -LiteralPath $resolved)) { Add-Diagnostic $diagnostics "error" "missing-context-file" "Phase $($phase.id) routes to missing context file: $reference" $phase.id }
    }
    $edgeItems = Get-Items (Get-IndentedBlock $phase.body "edge_cases")
    $regressionItems = Get-Items (Get-IndentedBlock $phase.body "regression_map")
    if ($edgeItems.Count -eq 0) { Add-Diagnostic $diagnostics "error" "empty-edge-cases" "Phase $($phase.id) must list edge_cases" $phase.id }
    if ($regressionItems.Count -eq 0) { Add-Diagnostic $diagnostics "error" "empty-regression-map" "Phase $($phase.id) must list regression_map" $phase.id }
    foreach ($item in $fileItems) {
      $reference = Get-PathReference $item
      $operation = if ($item -match "(?i)\((?<op>create|modify|delete)\b") { $Matches["op"].ToLowerInvariant() } else { "modify" }
      if ($reference -match "^(?:path|file|<|\.\.\.)") { Add-Diagnostic $diagnostics "error" "file-placeholder" "Phase $($phase.id) has a placeholder file path" $phase.id; continue }
      $resolved = Resolve-PlanReference $reference
      if ($operation -in @("modify", "delete") -and $resolved -and -not (Test-Path -LiteralPath $resolved)) {
        Add-Diagnostic $diagnostics "error" "missing-touched-file" "Phase $($phase.id) plans to $operation missing file: $reference" $phase.id
      }
    }
    foreach ($criterion in $criteria) {
      if ($criterion -notmatch "(?i)\bverify\s*:") { Add-Diagnostic $diagnostics "error" "ac-without-verify" "AC in $($phase.id) has no verify: command" $phase.id }
      if ($criterion -notmatch "(?i)\bexpected\s*:") { Add-Diagnostic $diagnostics "error" "ac-without-expected" "AC in $($phase.id) has no expected: result" $phase.id }
      if ($criterion -match "(?i)<(?:cmd|command|expected|path|description|verif)\b|\.\.\.") { Add-Diagnostic $diagnostics "error" "ac-placeholder" "AC in $($phase.id) still contains a placeholder" $phase.id }
      if ($criterion -match "(?i)\bverify\s*:\s*(?<cmd>[^|]+)") {
        $commandText = $Matches["cmd"].Trim()
        if (-not $commandText -or $commandText -match "^<") { Add-Diagnostic $diagnostics "error" "empty-verify-command" "AC in $($phase.id) has an empty verify command" $phase.id }
        elseif ($commandText -match "^(?<exe>[A-Za-z][A-Za-z0-9_.-]*)\b" -and -not (Get-Command $Matches["exe"] -ErrorAction SilentlyContinue)) {
          Add-Diagnostic $diagnostics "warning" "verify-executable-not-on-host" "Verify executable '$($Matches['exe'])' is not on the current host; run in the target repo/runtime" $phase.id
        }
      }
      $normalized = ($criterion -replace "(?i)\bverify\s*:.*$", "" -replace "[^a-z0-9]+", " ").Trim().ToLowerInvariant()
      if ($normalized -and $seenAc.ContainsKey($normalized)) { Add-Diagnostic $diagnostics "error" "duplicate-ac" "Duplicate acceptance criterion '$normalized' in $($phase.id) and $($seenAc[$normalized])" $phase.id }
      if ($normalized) { $seenAc[$normalized] = $phase.id }
    }
    $verify = Get-IndentedBlock $phase.body "verify_gate"
    if (-not $verify -or $verify -match "(?i)<(?:cmd|command|expected)") { Add-Diagnostic $diagnostics "error" "invalid-verify-gate" "Phase $($phase.id) needs a concrete verify_gate command" $phase.id }
    $compiledPhases += [pscustomobject]@{
      id = $phase.id
      title = $phase.title
      goal = Get-KeyValue $phase.body "goal"
      scope_lock = $scopeLock
      depends_on = @($graph[$phase.id])
      files_touched = @($fileItems)
      context_files = @($contextItems)
      acceptance_criteria = @($criteria)
      verify_gate = ($verify -replace "\r?\n", " ").Trim()
      warnings = @($diagnostics | Where-Object { $_.phase -eq $phase.id -and $_.severity -eq "warning" } | ForEach-Object { $_.code })
    }
  }
  Test-DependencyCycles $graph $diagnostics
  $planIdValue = if ($meta.plan_id) { [string]$meta.plan_id } elseif ($PlanId) { $PlanId } else { [IO.Path]::GetFileNameWithoutExtension($Path) }
  $errors = @($diagnostics | Where-Object severity -eq "error")
  $warnings = @($diagnostics | Where-Object severity -eq "warning")
  return [pscustomobject]@{
    schema_version = 1
    compiled_at = [DateTime]::UtcNow.ToString("o")
    source_plan = [IO.Path]::GetFullPath($Path)
    plan_id = (Normalize-Id $planIdValue)
    meta = $meta
    phases = @($compiledPhases)
    diagnostics = @($diagnostics)
    errors = $errors.Count
    warnings = $warnings.Count
    valid = ($errors.Count -eq 0)
  }
}

function Get-PlanPathResolved {
  if ($PlanPath) { return (Resolve-Path -LiteralPath $PlanPath).Path }
  if (-not $PlanId) { throw "Provide -PlanPath or -PlanId" }
  $candidate = Join-Path (Join-Path $StateRoot (Normalize-Id $PlanId)) "plan.md"
  if (Test-Path -LiteralPath $candidate) { return (Resolve-Path -LiteralPath $candidate).Path }
  $legacy = Join-Path $Root ".cursor\plans\$PlanId.plan.md"
  if (Test-Path -LiteralPath $legacy) { return (Resolve-Path -LiteralPath $legacy).Path }
  throw "Plan not found for id '$PlanId' (looked in $candidate and $legacy)"
}

function Get-StateDirectory {
  param([string]$Id)
  $dir = Join-Path $StateRoot (Normalize-Id $Id)
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  return $dir
}

function Save-Json {
  param([string]$Path, [object]$Value)
  $parent = Split-Path -Parent $Path
  New-Item -ItemType Directory -Force -Path $parent | Out-Null
  [IO.File]::WriteAllText($Path, ($Value | ConvertTo-Json -Depth 12), [Text.Encoding]::UTF8)
}

function Save-Compiled {
  param([object]$Compiled)
  $dir = Get-StateDirectory $Compiled.plan_id
  $path = Join-Path $dir "compiled.json"
  Save-Json $path $Compiled
  return $path
}

function Load-State {
  param([string]$Id)
  $path = Join-Path (Get-StateDirectory $Id) "state.json"
  if (-not (Test-Path -LiteralPath $path)) {
    return [pscustomobject]@{
      plan_id = (Normalize-Id $Id); status = "DRAFT"; revision = 0; current_phase = $null; session_id = $null
      evidence = @(); blockers = @(); history = @(); updated_at = [DateTime]::UtcNow.ToString("o")
    }
  }
  return Get-Content -Raw -Encoding UTF8 $path | ConvertFrom-Json
}

function Save-State {
  param([object]$State)
  $State.updated_at = [DateTime]::UtcNow.ToString("o")
  $path = Join-Path (Get-StateDirectory $State.plan_id) "state.json"
  Save-Json $path $State
  return $path
}

function Add-StateItem {
  param([object]$State, [string]$Property, [object]$Item)
  $existing = @($State.$Property)
  $State.$Property = @($existing + $Item)
}

function Require-Compiled {
  $path = Get-PlanPathResolved
  $compiled = Compile-Plan $path
  $compiledPath = Save-Compiled $compiled
  if ($Action -in @("start", "complete") -and -not $compiled.valid) {
    throw "Plan validation failed; inspect $compiledPath before changing state"
  }
  return $compiled
}

function Emit-Validation {
  param([object]$Compiled)
  if ($Quiet) {
    return [int](-not $Compiled.valid)
  }
  foreach ($item in @($Compiled.diagnostics)) {
    $prefix = $item.severity.ToString().ToUpperInvariant()
    $where = if ($item.phase) { " [$($item.phase)]" } else { "" }
    Write-Host ("{0}: {1}{2} - {3}" -f $prefix, $item.code, $where, $item.message)
  }
  if ($Compiled.valid) {
    Write-Host "PASS: plan semantic validation ($($Compiled.plan_id)); warnings=$($Compiled.warnings)"
    return 0
  }
  Write-Host "FAIL: plan semantic validation ($($Compiled.plan_id)); errors=$($Compiled.errors), warnings=$($Compiled.warnings)"
  return 1
}

$compiled = $null
try {
  switch ($Action) {
    { $_ -in @("validate", "compile") } {
      $compiled = Require-Compiled
      $code = Emit-Validation $compiled
      if ($Action -eq "compile") { Write-Host "Compiled artifact: $(Save-Compiled $compiled)" }
      exit $code
    }
    "init" {
      $compiled = Require-Compiled
      $state = Load-State $compiled.plan_id
      $state.status = if ($compiled.valid) { "READY" } else { "DRAFT" }
      $state.revision = [int]($state.revision)
      Add-StateItem $state "history" ([pscustomobject]@{ at = [DateTime]::UtcNow.ToString("o"); event = "init"; valid = $compiled.valid })
      Save-State $state | Out-Null
      Write-Host "$(if ($compiled.valid) { 'PASS' } else { 'PARTIAL' }): plan state initialized for $($compiled.plan_id)"
      if ($compiled.valid) { exit 0 } else { exit 1 }
    }
    "status" {
      $id = if ($PlanId) { Normalize-Id $PlanId } else { (Require-Compiled).plan_id }
      $state = Load-State $id
      $state | ConvertTo-Json -Depth 12
      exit 0
    }
    "start" {
      $compiled = Require-Compiled
      $state = Load-State $compiled.plan_id
      $phaseId = if ($Phase) { $Phase } else { $compiled.phases[0].id }
      if (-not @($compiled.phases.id) -contains $phaseId) { throw "Unknown phase: $phaseId" }
      $state.status = "IN_PROGRESS"; $state.current_phase = $phaseId; $state.session_id = [guid]::NewGuid().ToString()
      Add-StateItem $state "history" ([pscustomobject]@{ at = [DateTime]::UtcNow.ToString("o"); event = "start"; phase = $phaseId; session_id = $state.session_id })
      Save-State $state | Out-Null
      Write-Host "PASS: started $($compiled.plan_id) phase $phaseId; session=$($state.session_id)"
      exit 0
    }
    "evidence" {
      $id = if ($PlanId) { Normalize-Id $PlanId } else { (Require-Compiled).plan_id }
      if (-not $AcId -or -not $Evidence) { throw "-AcId and -Evidence are required for evidence" }
      $state = Load-State $id
      Add-StateItem $state "evidence" ([pscustomobject]@{ ac = $AcId; command = $Command; expected = $Expected; evidence = $Evidence; at = [DateTime]::UtcNow.ToString("o") })
      Save-State $state | Out-Null
      Write-Host "PASS: evidence recorded for $AcId"
      exit 0
    }
    "block" {
      $id = Normalize-Id $PlanId
      if (-not $Reason) { throw "-Reason is required for block" }
      $state = Load-State $id; $state.status = "BLOCKED"
      Add-StateItem $state "blockers" ([pscustomobject]@{ reason = $Reason; phase = $Phase; at = [DateTime]::UtcNow.ToString("o") })
      Save-State $state | Out-Null; Write-Host "PARTIAL: blocker recorded for $id"; exit 1
    }
    "complete" {
      $compiled = Require-Compiled
      $state = Load-State $compiled.plan_id
      if (-not $LedgerPath) { $LedgerPath = Join-Path $Root ".agent\ledger\$($compiled.plan_id).md" }
      & (Join-Path $PSScriptRoot "audit-slice-ledger.ps1") -Root $Root -LedgerPath $LedgerPath -Strict
      if ($LASTEXITCODE -ne 0) { throw "Ledger gate failed; cannot complete plan" }
      $state.status = "DONE"; $state.current_phase = $null
      Add-StateItem $state "history" ([pscustomobject]@{ at = [DateTime]::UtcNow.ToString("o"); event = "complete" })
      Save-State $state | Out-Null; Write-Host "PASS: plan completed $($compiled.plan_id)"; exit 0
    }
    "handoff" {
      $compiled = Require-Compiled
      $phaseId = if ($Phase) { $Phase } else { $compiled.phases[0].id }
      $phase = $compiled.phases | Where-Object id -eq $phaseId | Select-Object -First 1
      if (-not $phase) { throw "Unknown phase: $phaseId" }
      $dir = Get-StateDirectory $compiled.plan_id
      $out = if ($OutputPath) { $OutputPath } else { Join-Path $dir "$phaseId-HANDOFF.md" }
      $text = @"
---
HANDOFF - Plan ID: $($compiled.plan_id)
Phase: $phaseId — $($phase.title)
Execute: $phaseId ONLY
Scope: $($phase.goal)
Files: $($phase.files_touched -join '; ')
Context: $($phase.context_files -join '; ')
Verify: $($phase.verify_gate)
Acceptance criteria: $($phase.acceptance_criteria.Count)
Forbidden: scope creep; silent plan rewrite; claiming PASS without ledger evidence
State: .agent/plans/$($compiled.plan_id)/state.json
---
"@
      $target = if ([IO.Path]::IsPathRooted($out)) { $out } else { Join-Path (Get-Location) $out }
      [IO.File]::WriteAllText($target, $text, [Text.Encoding]::UTF8)
      Write-Host "PASS: handoff generated at $out"; exit 0
    }
    "revise" {
      $id = Normalize-Id $PlanId; $state = Load-State $id; $state.status = "REVISE"; $state.revision = [int]$state.revision + 1
      Add-StateItem $state "history" ([pscustomobject]@{ at = [DateTime]::UtcNow.ToString("o"); event = "revise"; reason = $Reason; phase = $Phase })
      Save-State $state | Out-Null; Write-Host "PASS: revision $($state.revision) recorded for $id"; exit 0
    }
    "gate" {
      if (-not $LedgerPath) { throw "-LedgerPath is required for gate" }
      & (Join-Path $PSScriptRoot "audit-slice-ledger.ps1") -Root $Root -LedgerPath $LedgerPath -Strict
      exit $LASTEXITCODE
    }
    "report" {
      $compiled = Require-Compiled
      $state = Load-State $compiled.plan_id
      $dir = Get-StateDirectory $compiled.plan_id
      $out = if ($OutputPath) { $OutputPath } else { Join-Path $dir "REPORT.md" }
      $lines = [System.Collections.Generic.List[string]]::new()
      $lines.Add("# Plan report: $($compiled.plan_id)")
      $lines.Add("")
      $lines.Add("Status: $(if ($compiled.valid) { $state.status } else { 'REVISE' })")
      $lines.Add("Revision: $($state.revision)")
      $lines.Add("Validation: errors=$($compiled.errors), warnings=$($compiled.warnings)")
      $lines.Add("")
      foreach ($phase in $compiled.phases) {
        $lines.Add("## $($phase.id) - $($phase.title)")
        $lines.Add("- Goal: $($phase.goal)")
        $lines.Add("- Files: $($phase.files_touched -join '; ')")
        $lines.Add("- Acceptance criteria: $($phase.acceptance_criteria.Count)")
        $lines.Add("- Verify gate: $($phase.verify_gate)")
      }
      if (@($compiled.diagnostics).Count -gt 0) {
        $lines.Add(""); $lines.Add("## Diagnostics")
        foreach ($d in $compiled.diagnostics) { $lines.Add("- $($d.severity.ToUpperInvariant()): $($d.code) - $($d.message)") }
      }
      $target = if ([IO.Path]::IsPathRooted($out)) { $out } else { Join-Path (Get-Location) $out }
      [IO.File]::WriteAllLines($target, $lines, [Text.Encoding]::UTF8)
      Write-Host "PASS: report generated at $out"; exit 0
    }
  }
} catch {
  Write-Error $_.Exception.Message
  exit 1
}
