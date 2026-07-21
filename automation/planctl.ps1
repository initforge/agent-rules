[CmdletBinding()]
param(
  [ValidateSet("validate", "compile", "admit", "adopt", "init", "status", "focus", "start", "verify", "evidence", "block", "recover", "complete", "finalize", "handoff", "revise", "gate", "report")]
  [string]$Action = "validate",
  [string]$Root = (Split-Path -Parent $PSScriptRoot),
  [string]$PlanPath = "",
  [string]$PlanId = "",
  [string]$AdmissionPath = "",
  [ValidateSet("", "continuous", "phase")][string]$ExecutionMode = "",
  [string]$Phase = "",
  [string]$LeaseId = "",
  [string]$SliceId = "",
  [string]$LedgerPath = "",
  [string]$AcId = "",
  [string]$Evidence = "",
  [string]$Command = "",
  [string]$Expected = "",
  [string]$ReceiptPath = "",
  [string]$Reason = "",
  [string]$OutputPath = "",
  [switch]$Strict,
  [switch]$Quiet
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "path-compat.ps1")
$StateRoot = Join-Path $Root ".agent\plans"
$script:LockStream = $null
$script:LockPath = $null

function Assert-SafePath {
  param([string]$Path, [string]$Purpose = "path")
  if (-not $Path) { throw "$Purpose is empty" }
  $rootFull = [IO.Path]::GetFullPath($Root)
  $candidate = [IO.Path]::GetFullPath($Path)
  $prefix = $rootFull.TrimEnd([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
  if (-not ($candidate.Equals($rootFull, [StringComparison]::OrdinalIgnoreCase) -or $candidate.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase))) {
    throw "$Purpose must stay inside repository root: $candidate"
  }
  return $candidate
}

function Enter-PlanLock {
  param([string]$PlanId)
  if ($script:LockStream) { return }
  $dir = Join-Path $StateRoot (Normalize-Id $PlanId)
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  # Shared protocol with platforms/shared/scripts/plan_guard.py:
  # state.json is protected by the adjacent state.json.lock sentinel, created
  # with O_EXCL/CreateNew and reclaimed only after the common 10-minute stale
  # lease window.  Do not use a PowerShell-only lock name here: Python hooks
  # and planctl must serialize the same state transitions.
  $lockPath = Join-Path $dir "state.json.lock"
  $deadline = [DateTime]::UtcNow.AddSeconds(8)
  while ($true) {
    try {
      $script:LockStream = [IO.File]::Open($lockPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
      $metadata = "pid=$([Diagnostics.Process]::GetCurrentProcess().Id);owner=$([guid]::NewGuid().ToString());created_at=$([DateTime]::UtcNow.ToString('o'))`n"
      $bytes = [Text.Encoding]::ASCII.GetBytes($metadata)
      $script:LockStream.Write($bytes, 0, $bytes.Length)
      $script:LockStream.Flush($true)
      $script:LockPath = $lockPath
      return
    } catch [IO.IOException] {
      try {
        if ((Test-Path -LiteralPath $lockPath -PathType Leaf) -and (([DateTime]::UtcNow - [IO.File]::GetLastWriteTimeUtc($lockPath)).TotalSeconds -gt 600)) {
          Remove-Item -LiteralPath $lockPath -Force -ErrorAction SilentlyContinue
          continue
        }
      } catch { }
      if ([DateTime]::UtcNow -ge $deadline) { throw "Timed out acquiring plan lock for $PlanId" }
      Start-Sleep -Milliseconds 75
    }
  }
}

function Exit-PlanLock {
  if ($script:LockStream) { $script:LockStream.Dispose(); $script:LockStream = $null }
  if ($script:LockPath -and (Test-Path -LiteralPath $script:LockPath)) { Remove-Item -LiteralPath $script:LockPath -Force -ErrorAction SilentlyContinue }
  $script:LockPath = $null
}

function Get-RequestedLeaseId {
  if ($LeaseId) { return $LeaseId }
  if ($env:PLANCTL_LEASE_ID) { return [string]$env:PLANCTL_LEASE_ID }
  return ""
}

function Assert-LeaseOwner {
  param([object]$State)
  $requested = Get-RequestedLeaseId
  if ($requested -and $State.lease_id -and [string]$requested -ne [string]$State.lease_id) {
    throw "Lease mismatch: state lease belongs to another executor"
  }
}

function Normalize-Id {
  param([string]$Value)
  if ([string]::IsNullOrWhiteSpace($Value) -or $Value.Trim() -in @(".", "..")) { throw "Plan id is empty or reserved" }
  $safe = ($Value -replace "[^A-Za-z0-9._-]", "-").Trim("-")
  if (-not $safe -or $safe -in @(".", "..")) { throw "Plan id is empty or reserved" }
  return $safe.ToLowerInvariant()
}

function Read-TextUtf8 {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { throw "Missing file: $Path" }
  return [IO.File]::ReadAllText((Resolve-Path -LiteralPath $Path), [Text.Encoding]::UTF8)
}

function Normalize-Text {
  param([string]$Value)
  return (($Value -replace "\s+", " ").Trim())
}

function Get-TextHash {
  param([string]$Value)
  $bytes = [Text.Encoding]::UTF8.GetBytes((Normalize-Text $Value))
  $hash = [Security.Cryptography.SHA256]::Create().ComputeHash($bytes)
  return (($hash | ForEach-Object { $_.ToString("x2") }) -join "")
}

function Get-ExactHash {
  param([string]$Value)
  $canonical = ([string]$Value).Replace("`r`n", "`n").Replace("`r", "`n")
  $bytes = [Text.Encoding]::UTF8.GetBytes($canonical)
  $hash = [Security.Cryptography.SHA256]::Create().ComputeHash($bytes)
  return (($hash | ForEach-Object { $_.ToString("x2") }) -join "")
}

function Get-SectionBody {
  param([string]$Body, [string]$Title)
  $match = [regex]::Match($Body, "(?ms)^##\s+$([regex]::Escape($Title))\s*\r?\n(?<body>.*?)(?=^##\s+|\z)")
  return $(if ($match.Success) { $match.Groups["body"].Value } else { "" })
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

function Parse-ListValue {
  param([string]$Value)
  if (-not $Value) { return @() }
  $text = $Value.Trim()
  if ($text -match "^\[(.*)\]$") { $text = $Matches[1] }
  return @($text -split "," | ForEach-Object { $_.Trim().Trim("'").Trim('"') } | Where-Object { $_ })
}

function Get-ProofRegistry {
  $path = Join-Path $PSScriptRoot "evidence-profiles.json"
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Missing semantic proof registry: $path" }
  return Read-TextUtf8 $path | ConvertFrom-Json
}

function Get-ProfileDefinition {
  param([object]$Registry, [string]$Name)
  $property = $Registry.profiles.PSObject.Properties[$Name]
  if ($property) { return $property.Value }
  return $null
}

function Get-ProofMapRows {
  param([string]$Body)
  $rows = [System.Collections.Generic.List[object]]::new()
  foreach ($item in @(Get-Items (Get-IndentedBlock $Body "proof_map"))) {
    if ($item -notmatch "^(?<ac>AC[A-Za-z0-9_-]+)\s*->\s*(?<dimensions>[^|]+)(?:\s*\|\s*(?<fields>.*))?$") {
      $rows.Add([pscustomobject]@{ valid = $false; raw = $item; ac_id = ""; dimensions = @(); profiles = @(); kind = ""; environment = ""; artifacts = @(); manifest = $false; reason = "" })
      continue
    }
    $acId = $Matches["ac"].Trim()
    $dimensionText = $Matches["dimensions"].Trim()
    $fieldText = [string]$Matches["fields"]
    $dimensions = @(Parse-ListValue $dimensionText)
    $profiles = @($dimensions | ForEach-Object { if ($_ -match "^(?<profile>[a-z][a-z0-9-]*)\.(?<dimension>[a-z][a-z0-9-]*)$") { $Matches["profile"] } } | Select-Object -Unique)
    $fields = @{}
    foreach ($field in @($fieldText -split "\s*\|\s*")) {
      if ($field -match "^(?<key>[a-z_]+)\s*=\s*(?<value>.+)$") { $fields[$Matches["key"]] = $Matches["value"].Trim() }
    }
    $rows.Add([pscustomobject]@{
      valid = ($dimensions.Count -gt 0 -and @($dimensions | Where-Object { $_ -notmatch "^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$" }).Count -eq 0)
      raw = $item
      ac_id = $acId
      dimensions = @($dimensions)
      profiles = @($profiles)
      kind = [string]$fields["kind"]
      environment = $(if ($fields["env"]) { [string]$fields["env"] } else { "local" })
      artifacts = @(Parse-ListValue ([string]$fields["artifacts"]))
      manifest = ([string]$fields["manifest"] -match "^(?i:true|yes|1)$")
      reason = [string]$fields["reason"]
    })
  }
  return @($rows)
}

function Get-InferredProofProfiles {
  param([object]$Registry, [string]$Text)
  $normalized = Normalize-Text $Text
  $found = [System.Collections.Generic.List[string]]::new()
  foreach ($property in @($Registry.profiles.PSObject.Properties)) {
    if ($property.Name -in @("static-change", "custom")) { continue }
    foreach ($signal in @($property.Value.signals)) {
      if ($signal -and $normalized.IndexOf([string]$signal, [StringComparison]::OrdinalIgnoreCase) -ge 0) {
        if (-not $found.Contains($property.Name)) { $found.Add($property.Name) }
        break
      }
    }
  }
  return @($found)
}

function Test-OutputOnlyCommand {
  param([string]$Command)
  $value = (Normalize-Text $Command).Trim('"').Trim("'")
  if ($value -match "^(?i:true|false|exit\s+0)$") { return $true }
  if ($value -match "^(?i:echo|printf|write-output|write-host)\b") { return $true }
  if ($value -match '^(?i:pwsh|powershell)(?:\.exe)?\b.*\s-command\s+.*(?i:(echo|write-output|write-host))\b') { return $true }
  return $false
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
  $schemaVersion = if ([string]$meta.schema_version -match "^[0-9]+$") { [int]$meta.schema_version } else { 1 }
  $proofRegistry = Get-ProofRegistry
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
  $deliverableMatches = @([regex]::Matches($body, "(?m)^\s*-\s*(?<id>D[0-9]+)(?:\s*\[DERIVED\((?<reason>[^\]]+)\)\])?\s*:") )
  $deliverables = @($deliverableMatches | ForEach-Object { $_.Groups["id"].Value })
  $derivedDeliverables = @($deliverableMatches | Where-Object { $_.Groups["reason"].Success } | ForEach-Object { $_.Groups["id"].Value })
  $coverageBody = Get-SectionBody $body "Source coverage"
  $coverage = @([regex]::Matches($coverageBody, "(?m)^\s*-\s*(?<source>S[0-9]{3,})\s*->\s*(?<target>D[0-9]+|CONTEXT|OUT\((?<reason>[^)]*)\)|DUPLICATE_OF\((?<duplicate>S[0-9]{3,})\))\s*\|\s*(?<ref>\S.+)$") | ForEach-Object {
    $reference = Normalize-Text $_.Groups["ref"].Value
    $isHashReference = $reference -match "^(?i)@sha256:([0-9a-f]{64})$"
    $sourceHash = if ($isHashReference) { $Matches[1].ToLowerInvariant() } else { Get-TextHash $reference }
    [pscustomobject]@{
      source_id = $_.Groups["source"].Value
      target = $_.Groups["target"].Value
      reason = $_.Groups["reason"].Value.Trim()
      duplicate_of = $_.Groups["duplicate"].Value.Trim()
      text = if ($isHashReference) { "" } else { $reference }
      ref = $reference
      sha256 = $sourceHash
      hash_reference = [bool]$isHashReference
    }
  })
  $coverageIds = @($coverage | ForEach-Object source_id)
  foreach ($duplicate in @($coverageIds | Group-Object | Where-Object Count -gt 1)) {
    Add-Diagnostic $diagnostics "error" "duplicate-source-coverage" "Source item $($duplicate.Name) appears more than once"
  }
  foreach ($duplicateHash in @($coverage | Group-Object sha256 | Where-Object Count -gt 1)) {
    $items = @($duplicateHash.Group)
    $canonical = @($items | Where-Object { -not $_.duplicate_of })
    $invalidDuplicate = @($items | Where-Object { $_.duplicate_of -and ($canonical.Count -ne 1 -or $_.duplicate_of -ne $canonical[0].source_id) })
    if ($canonical.Count -ne 1 -or $invalidDuplicate.Count -gt 0) {
      Add-Diagnostic $diagnostics "error" "duplicate-source-hash" "Source hash $($duplicateHash.Name) must have one canonical S-ID and explicit DUPLICATE_OF(canonical) mappings"
    }
  }
  foreach ($item in $coverage) {
    if ($item.target -match "^D[0-9]+$" -and $deliverables -notcontains $item.target) {
      Add-Diagnostic $diagnostics "error" "coverage-unknown-deliverable" "Source $($item.source_id) maps unknown deliverable $($item.target)"
    }
    if ($item.target -match "^OUT" -and -not $item.reason) {
      Add-Diagnostic $diagnostics "error" "coverage-out-without-reason" "Source $($item.source_id) OUT disposition requires a reason"
    }
    if ($item.duplicate_of -and $item.duplicate_of -eq $item.source_id) {
      Add-Diagnostic $diagnostics "error" "self-duplicate-source" "Source $($item.source_id) cannot duplicate itself"
    }
  }
  $admission = $null
  if ($AdmissionPath) {
    $admission = Read-TextUtf8 $AdmissionPath | ConvertFrom-Json
    $expectedItems = @($admission.source_items)
    if (-not $coverageBody) { Add-Diagnostic $diagnostics "error" "missing-source-coverage" "Admission-backed plan requires ## Source coverage" }
    foreach ($source in $expectedItems) {
      $matches = @($coverage | Where-Object source_id -eq $source.id)
      if ($matches.Count -eq 0) { Add-Diagnostic $diagnostics "error" "uncovered-source-item" "Admission source $($source.id) is not covered" }
      elseif ($matches[0].sha256 -ne $source.sha256) { Add-Diagnostic $diagnostics "error" "source-hash-mismatch" "Source coverage text changed for $($source.id)" }
      elseif (-not $matches[0].hash_reference) { Add-Diagnostic $diagnostics "error" "raw-source-coverage-forbidden" "Admission source $($source.id) must use @sha256:<hash>; raw source text is not permitted" }
      elseif ($source.duplicate_of -and $matches[0].duplicate_of -ne [string]$source.duplicate_of) { Add-Diagnostic $diagnostics "error" "duplicate-source-disposition-mismatch" "Admission source $($source.id) must map DUPLICATE_OF($($source.duplicate_of))" }
      elseif (-not $source.duplicate_of -and $matches[0].duplicate_of) { Add-Diagnostic $diagnostics "error" "unexpected-duplicate-source" "Source $($source.id) is not marked duplicate in admission" }
    }
    foreach ($item in $coverage) {
      if (@($expectedItems | Where-Object id -eq $item.source_id).Count -eq 0) { Add-Diagnostic $diagnostics "error" "unknown-source-item" "Coverage contains unknown source $($item.source_id)" }
    }
    $coveredDeliverables = @($coverage | Where-Object { $_.target -match "^D[0-9]+$" } | ForEach-Object target | Select-Object -Unique)
    foreach ($deliverable in $deliverables) {
      if ($coveredDeliverables -notcontains $deliverable -and $derivedDeliverables -notcontains $deliverable) {
        Add-Diagnostic $diagnostics "error" "uncovered-deliverable" "Deliverable $deliverable needs a source mapping or DERIVED(reason)"
      }
    }
    if ($admission.source_set_hash) {
      $actualSourceSet = (($expectedItems | ForEach-Object { "$($_.id):$($_.sha256)" }) -join "|")
      if ((Get-TextHash $actualSourceSet) -ne [string]$admission.source_set_hash) {
        Add-Diagnostic $diagnostics "error" "source-set-hash-mismatch" "Admission source_set_hash does not match source inventory"
      }
    }
  }
  # Admission-backed, continuous, and explicitly high-risk plans use the
  # proof-bearing PAF contract.  Legacy schema v1 remains readable for
  # phase-level work, but it must never be able to reach PLAN_PASS.
  $riskValues = @(Parse-ListValue ([string]$meta.risk_flags))
  $isHighRisk = @($riskValues | Where-Object { $_ -match '(?i)^(high[-_ ]?risk|critical)$' }).Count -gt 0 -or
    ([string]$meta.risk_tier -match '(?i)^(high|critical)$')
  $requiresSchemaV2 = [bool]$admission -or ([string]$ExecutionMode -eq 'continuous') -or $isHighRisk -or
    ([string]$meta.workflow_mode -match '(?i)^(continuous|full[-_ ]?plan|execution[-_ ]?full)$')
  if ($requiresSchemaV2 -and $schemaVersion -lt 2) {
    $reason = if ($admission) { 'admission-backed' } elseif ([string]$ExecutionMode -eq 'continuous' -or [string]$meta.workflow_mode -match '(?i)continuous') { 'continuous execution' } else { 'high-risk' }
    Add-Diagnostic $diagnostics 'error' 'paf-schema-v2-required' "The $reason lifecycle requires schema_version: 2; schema v1 cannot be admitted or finalized"
  }
  $seenIds = @{}
  $seenAc = @{}
  $mappedDeliverables = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
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
    $criterionOrdinal = 0
    foreach ($criterion in $criteria) {
      $criterionOrdinal++
      if (-not (Get-CriterionVerifySpec $criterion $criterionOrdinal).command) {
        Add-Diagnostic $diagnostics "error" "missing-ac-verify" "Acceptance criterion $($phase.id)/AC$criterionOrdinal must declare an executable '| verify:' command" $phase.id
      }
    }
    $proofProfiles = @(Parse-ListValue (Get-KeyValue $phase.body "proof_profiles"))
    $proofMap = @(Get-ProofMapRows $phase.body)
    if ($schemaVersion -ge 2) {
      if ($proofProfiles.Count -eq 0) { Add-Diagnostic $diagnostics "error" "missing-proof-profile" "Phase $($phase.id) requires proof_profiles under PAF schema v2" $phase.id }
      if ($proofMap.Count -eq 0) { Add-Diagnostic $diagnostics "error" "missing-proof-map" "Phase $($phase.id) requires an AC-to-proof proof_map under PAF schema v2" $phase.id }
      $acSpecs = @{}
      $acIdCounts = @{}
      $criterionOrdinal = 0
      foreach ($criterion in $criteria) {
        $criterionOrdinal++
        if ($criterion -notmatch "^(?<id>AC[A-Za-z0-9_-]+)\b") {
          Add-Diagnostic $diagnostics "error" "implicit-ac-id" "Phase $($phase.id) acceptance criterion $criterionOrdinal needs an explicit unique AC-ID" $phase.id
          continue
        }
        $criterionId = $Matches["id"]
        $acIdCounts[$criterionId] = 1 + [int]$acIdCounts[$criterionId]
        $acSpecs[$criterionId] = Get-CriterionVerifySpec $criterion $criterionOrdinal
      }
      foreach ($entry in $acIdCounts.GetEnumerator() | Where-Object Value -gt 1) {
        Add-Diagnostic $diagnostics "error" "duplicate-ac-id" "Phase $($phase.id) repeats acceptance id $($entry.Key)" $phase.id
      }
      foreach ($profileName in $proofProfiles) {
        if (-not (Get-ProfileDefinition $proofRegistry $profileName)) {
          Add-Diagnostic $diagnostics "error" "unknown-proof-profile" "Phase $($phase.id) declares unknown proof profile '$profileName'" $phase.id
        }
      }
      $phaseProofText = "$($phase.title) $($phase.body) $(@($meta.risk_flags) -join ' ')"
      foreach ($requiredProfile in @(Get-InferredProofProfiles $proofRegistry $phaseProofText)) {
        if ($proofProfiles -notcontains $requiredProfile) {
          Add-Diagnostic $diagnostics "error" "missing-inferred-proof-profile" "Phase $($phase.id) semantics require proof profile '$requiredProfile'" $phase.id
        }
      }
      $proofRowsByAc = @{}
      $coveredDimensions = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
      foreach ($row in $proofMap) {
        if (-not $row.valid) { Add-Diagnostic $diagnostics "error" "invalid-proof-map-row" "Phase $($phase.id) has invalid proof_map row '$($row.raw)'" $phase.id; continue }
        if (-not $acSpecs.ContainsKey($row.ac_id)) { Add-Diagnostic $diagnostics "error" "proof-map-unknown-ac" "Phase $($phase.id) proof_map references unknown $($row.ac_id)" $phase.id }
        if ($proofRowsByAc.ContainsKey($row.ac_id)) { Add-Diagnostic $diagnostics "error" "duplicate-proof-map" "Phase $($phase.id) maps $($row.ac_id) more than once" $phase.id }
        $proofRowsByAc[$row.ac_id] = $row
        if (-not $row.kind) { Add-Diagnostic $diagnostics "error" "missing-evidence-kind" "Phase $($phase.id)/$($row.ac_id) needs kind=<evidence kind>" $phase.id }
        if ($row.environment -notin @("local", "ci", "staging", "production")) { Add-Diagnostic $diagnostics "error" "invalid-proof-environment" "Phase $($phase.id)/$($row.ac_id) has invalid env '$($row.environment)'" $phase.id }
        foreach ($dimensionRef in @($row.dimensions)) {
          [void]$coveredDimensions.Add($dimensionRef)
          $parts = $dimensionRef -split "\.", 2
          $profileName = $parts[0]
          $dimensionName = $parts[1]
          $definition = Get-ProfileDefinition $proofRegistry $profileName
          if (-not $definition) { Add-Diagnostic $diagnostics "error" "unknown-proof-profile" "Phase $($phase.id)/$($row.ac_id) maps unknown profile '$profileName'" $phase.id; continue }
          if ($proofProfiles -notcontains $profileName) { Add-Diagnostic $diagnostics "error" "undeclared-proof-profile" "Phase $($phase.id)/$($row.ac_id) uses undeclared profile '$profileName'" $phase.id }
          $knownDimensions = @($definition.required_dimensions)
          if ($definition.conditional_dimensions) { $knownDimensions += @($definition.conditional_dimensions.PSObject.Properties.Name) }
          if ($knownDimensions -notcontains $dimensionName) { Add-Diagnostic $diagnostics "error" "unknown-proof-dimension" "Phase $($phase.id)/$($row.ac_id) maps unknown dimension '$dimensionRef'" $phase.id }
          if ($row.kind -and @($definition.allowed_kinds) -notcontains $row.kind) { Add-Diagnostic $diagnostics "error" "incompatible-evidence-kind" "Evidence kind '$($row.kind)' cannot prove '$dimensionRef'" $phase.id }
          if ($row.kind -eq "build" -and $dimensionName -ne "regression") { Add-Diagnostic $diagnostics "error" "build-as-outcome-proof" "Build evidence cannot prove primary outcome '$dimensionRef'" $phase.id }
          if ($row.kind -eq "source-assertion" -and $profileName -ne "static-change") { Add-Diagnostic $diagnostics "error" "source-query-as-runtime-proof" "Source assertion cannot prove runtime outcome '$dimensionRef'" $phase.id }
          if ($profileName -eq "custom" -and -not $row.reason) { Add-Diagnostic $diagnostics "error" "custom-proof-without-reason" "Custom proof for $($phase.id)/$($row.ac_id) requires reason=<why built-ins do not fit>" $phase.id }
        }
        foreach ($artifact in @($row.artifacts)) {
          if ($artifact -notmatch "^(?:junit|playwright|json|text|screenshot):[^<>]+$") { Add-Diagnostic $diagnostics "error" "invalid-proof-artifact" "Phase $($phase.id)/$($row.ac_id) has invalid artifact '$artifact'" $phase.id }
        }
         if (@($proofRegistry.machine_evidence_kinds) -contains $row.kind -and -not $row.manifest -and $row.artifacts.Count -eq 0) {
           Add-Diagnostic $diagnostics "error" "machine-evidence-required" "Phase $($phase.id)/$($row.ac_id) kind '$($row.kind)' requires manifest=true or a machine artifact" $phase.id
         }
          if ($row.kind -in @("pipeline-run", "production-smoke") -and -not $row.manifest) {
            Add-Diagnostic $diagnostics "error" "external-manifest-required" "External evidence $($phase.id)/$($row.ac_id) requires manifest=true from a query-backed adapter; self-authored output is not release proof" $phase.id
          }
          if (($row.profiles -contains "external-release" -or $row.environment -eq "production") -and
              ($row.kind -notin @("pipeline-run", "production-smoke") -or -not $row.manifest)) {
            Add-Diagnostic $diagnostics "error" "external-release-proof-required" "Production/external-release evidence $($phase.id)/$($row.ac_id) must use a manifest-backed pipeline-run or production-smoke adapter receipt" $phase.id
          }
        if ($acSpecs.ContainsKey($row.ac_id)) {
          $spec = $acSpecs[$row.ac_id]
          if (Test-OutputOnlyCommand $spec.command) { Add-Diagnostic $diagnostics "error" "tautological-verify-command" "Phase $($phase.id)/$($row.ac_id) verify command only emits success" $phase.id }
          if ($spec.expected -notmatch "^(?i:exit=0|contains:.+|regex:.+|json:[A-Za-z0-9_.-]+=.+)$") { Add-Diagnostic $diagnostics "error" "untyped-expected-matcher" "Phase $($phase.id)/$($row.ac_id) expected must use exit=0, contains:, regex:, or json:<path>=<value>" $phase.id }
          if ($spec.expected -match "^(?i:contains:)(?<literal>.+)$") {
            if (@($row.profiles | Where-Object { $_ -ne "static-change" }).Count -gt 0) { Add-Diagnostic $diagnostics "error" "contains-only-deep-proof" "Phase $($phase.id)/$($row.ac_id) deep proof cannot rely on contains-only matching" $phase.id }
            $literal = [regex]::Escape($Matches["literal"].Trim())
            if ($spec.command -match ('(?i)(?:echo|printf|write-output|write-host)\s+' + $literal + '\b')) { Add-Diagnostic $diagnostics "error" "self-emitted-expected" "Phase $($phase.id)/$($row.ac_id) emits its own expected literal" $phase.id }
          }
        }
      }
      foreach ($acId in $acSpecs.Keys) {
        if (-not $proofRowsByAc.ContainsKey($acId)) { Add-Diagnostic $diagnostics "error" "unmapped-ac-proof" "Phase $($phase.id)/$acId has no proof_map row" $phase.id }
      }
      foreach ($profileName in $proofProfiles) {
        $definition = Get-ProfileDefinition $proofRegistry $profileName
        if (-not $definition) { continue }
        $requiredDimensions = @($definition.required_dimensions)
        if ($definition.conditional_dimensions) {
          foreach ($conditional in @($definition.conditional_dimensions.PSObject.Properties)) {
            foreach ($signal in @($conditional.Value)) {
              if ($phaseProofText.IndexOf([string]$signal, [StringComparison]::OrdinalIgnoreCase) -ge 0) { $requiredDimensions += $conditional.Name; break }
            }
          }
        }
        foreach ($dimensionName in @($requiredDimensions | Select-Object -Unique)) {
          $dimensionRef = "$profileName.$dimensionName"
          if (-not $coveredDimensions.Contains($dimensionRef)) { Add-Diagnostic $diagnostics "error" "uncovered-proof-dimension" "Phase $($phase.id) does not cover required proof dimension '$dimensionRef'" $phase.id }
        }
      }
    }
    $fileItems = Get-Items (Get-IndentedBlock $phase.body "files_touched")
    $scopeLock = Get-KeyValue $phase.body "scope_lock"
    if ($deliverables.Count -gt 0 -and -not ($scopeLock -match "\bD[0-9]+\b")) {
      Add-Diagnostic $diagnostics "error" "unmapped-phase-scope" "Phase $($phase.id) scope_lock must map at least one deliverable id" $phase.id
    }
    foreach ($scopeId in @([regex]::Matches($scopeLock, "\bD[0-9]+\b") | ForEach-Object { $_.Value })) {
      if ($deliverables -notcontains $scopeId) {
        Add-Diagnostic $diagnostics "error" "unknown-deliverable" "Phase $($phase.id) maps unknown deliverable $scopeId" $phase.id
      } else {
        [void]$mappedDeliverables.Add($scopeId)
      }
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
    $phaseContract = [ordered]@{
      id = $phase.id
      title = $phase.title
      goal = Get-KeyValue $phase.body "goal"
      scope_lock = $scopeLock
      depends_on = @($graph[$phase.id])
      files_touched = @($fileItems)
      context_files = @($contextItems)
      contracts_refs = @(Get-Items (Get-IndentedBlock $phase.body "contracts_refs"))
      edge_cases = @($edgeItems)
      regression_map = @($regressionItems)
      forbidden = Get-KeyValue $phase.body "forbidden"
      template_reference = Get-KeyValue $phase.body "template_reference"
      skills_active = @(Parse-ListValue (Get-KeyValue $phase.body "skills_active"))
      acceptance_criteria = @($criteria)
      proof_profiles = @($proofProfiles)
      proof_map = @($proofMap)
      verify_gate = ($verify -replace "\r?\n", " ").Trim()
      warnings = @($diagnostics | Where-Object { $_.phase -eq $phase.id -and $_.severity -eq "warning" } | ForEach-Object { $_.code })
    }
    $phaseContract["contract_hash"] = Get-ExactHash (($phaseContract | ConvertTo-Json -Depth 8 -Compress))
    $compiledPhases += [pscustomobject]$phaseContract
  }
  foreach ($deliverable in $deliverables) {
    if (-not $mappedDeliverables.Contains($deliverable)) {
      Add-Diagnostic $diagnostics "error" "unmapped-deliverable" "Deliverable $deliverable is not mapped to any phase"
    }
  }
  Test-DependencyCycles $graph $diagnostics
  $planIdValue = if ($meta.plan_id) { [string]$meta.plan_id } elseif ($PlanId) { $PlanId } else { [IO.Path]::GetFileNameWithoutExtension($Path) }
  # Plan-level contract is deliberately independent from phase prose.  This
  # lets a changed phase invalidate only itself and its downstream phases,
  # while source/deliverable/admission/topology changes invalidate the whole
  # execution graph.
  $planContract = [ordered]@{
    meta = $meta
    admission_id = $(if ($admission) { [string]$admission.admission_id } else { '' })
    admission_hash = $(if ($admission) { if ($admission.source_set_hash) { [string]$admission.source_set_hash } elseif ($admission.prompt_hash) { [string]$admission.prompt_hash } else { '' } } else { '' })
    execution_mode = $(if ($ExecutionMode) { $ExecutionMode } elseif ($admission) { [string]$admission.execution_mode } else { 'phase' })
    source_coverage = @($coverage)
    deliverables = @($deliverables)
    phase_topology = @($compiledPhases | ForEach-Object { [ordered]@{ id = $_.id; depends_on = @($_.depends_on) } })
  }
  $errors = @($diagnostics | Where-Object severity -eq "error")
  $warnings = @($diagnostics | Where-Object severity -eq "warning")
  return [pscustomobject]@{
    schema_version = 2
    paf_schema_version = $schemaVersion
    compiled_at = [DateTime]::UtcNow.ToString("o")
    source_plan = [IO.Path]::GetFullPath($Path)
    plan_hash = Get-ExactHash $body
    plan_contract_hash = Get-ExactHash (($planContract | ConvertTo-Json -Depth 12 -Compress))
    plan_id = (Normalize-Id $planIdValue)
    meta = $meta
    admission_id = $(if ($admission) { [string]$admission.admission_id } else { "" })
    admission_hash = $(if ($admission) {
      if ($admission.source_set_hash) { [string]$admission.source_set_hash }
      elseif ($admission.prompt_hash) { [string]$admission.prompt_hash }
      else { "" }
    } else { "" })
    execution_mode = $(if ($ExecutionMode) { $ExecutionMode } elseif ($admission) { [string]$admission.execution_mode } else { "phase" })
    source_coverage = @($coverage)
    deliverables = @($deliverables)
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
  $Path = Assert-SafePath $Path "JSON output path"
  $parent = Split-Path -Parent $Path
  New-Item -ItemType Directory -Force -Path $parent | Out-Null
  $tmp = "$Path.$([guid]::NewGuid().ToString('N')).tmp"
  try {
    [IO.File]::WriteAllText($tmp, (($Value | ConvertTo-Json -Depth 12) + "`n"), [Text.Encoding]::UTF8)
    if (Test-Path -LiteralPath $Path -PathType Leaf) {
      $backup = "$Path.$([guid]::NewGuid().ToString('N')).bak"
      [IO.File]::Replace($tmp, $Path, $backup, $true)
      if (Test-Path -LiteralPath $backup) { Remove-Item -LiteralPath $backup -Force -ErrorAction SilentlyContinue }
    } else {
      [IO.File]::Move($tmp, $Path)
    }
  } finally {
    if (Test-Path -LiteralPath $tmp) { Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue }
  }
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
      evidence = @(); receipts = @(); blockers = @(); history = @(); generation = 0; lease_id = ""; lease_expires_at = ""; enforcement_status = ""; updated_at = [DateTime]::UtcNow.ToString("o")
    }
  }
  return Get-Content -Raw -Encoding UTF8 $path | ConvertFrom-Json
}

function Save-State {
  param([object]$State)
  $dir = Get-StateDirectory $State.plan_id
  Enter-PlanLock $State.plan_id
  try {
    $path = Join-Path $dir "state.json"
    $currentGeneration = 0
    if (Test-Path -LiteralPath $path -PathType Leaf) {
      try { $currentGeneration = [int]((Get-Content -Raw -Encoding UTF8 $path | ConvertFrom-Json).generation) } catch { throw "Cannot read current plan state for generation check: $path" }
    }
    $expectedGeneration = if ($State.PSObject.Properties.Name -contains "generation") { [int]$State.generation } else { 0 }
    if ($expectedGeneration -ne $currentGeneration) {
      throw "Stale plan state generation for $($State.plan_id): expected $expectedGeneration, current $currentGeneration"
    }
    $State.generation = $currentGeneration + 1
    $State.updated_at = [DateTime]::UtcNow.ToString("o")
    Save-Json $path $State
    return $path
  } finally { Exit-PlanLock }
}

function Add-StateItem {
  param([object]$State, [string]$Property, [object]$Item)
  $existing = @($State.$Property)
  $State.$Property = @($existing + $Item)
}

function Ensure-StateProperty {
  param([object]$State, [string]$Name, [object]$DefaultValue)
  if (-not ($State.PSObject.Properties.Name -contains $Name)) {
    $State | Add-Member -NotePropertyName $Name -NotePropertyValue $DefaultValue
  }
}

function Ensure-StateShape {
  param([object]$State, [object]$Compiled)
  Ensure-StateProperty $State "phases" @()
  Ensure-StateProperty $State "plan_hash" ""
  Ensure-StateProperty $State "plan_contract_hash" ""
  Ensure-StateProperty $State "admission_id" ""
  Ensure-StateProperty $State "admission_hash" ""
  Ensure-StateProperty $State "admission_path" ""
  Ensure-StateProperty $State "execution_mode" "phase"
  Ensure-StateProperty $State "receipts" @()
  Ensure-StateProperty $State "generation" 0
  Ensure-StateProperty $State "lease_id" ""
  Ensure-StateProperty $State "lease_expires_at" ""
  Ensure-StateProperty $State "enforcement_status" ""
  Ensure-StateProperty $State "enforcement" ([pscustomobject]@{ no_progress_stops = 0; last_progress_hash = "" })
  $existing = @{}
  foreach ($item in @($State.phases)) { if ($item.id) { $existing[[string]$item.id] = $item } }
  $invalidated = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
  if ($State.plan_contract_hash -and [string]$State.plan_contract_hash -ne [string]$Compiled.plan_contract_hash) {
    foreach ($phase in @($Compiled.phases)) { [void]$invalidated.Add([string]$phase.id) }
  }
  foreach ($phase in @($Compiled.phases)) {
    $prior = $existing[[string]$phase.id]
    if (-not $prior -or [string]$prior.contract_hash -ne [string]$phase.contract_hash) {
      [void]$invalidated.Add([string]$phase.id)
    }
  }
  $changed = $true
  while ($changed) {
    $changed = $false
    foreach ($phase in @($Compiled.phases)) {
      if ($invalidated.Contains([string]$phase.id)) { continue }
      if (@($phase.depends_on | Where-Object { $invalidated.Contains([string]$_) }).Count -gt 0) {
        [void]$invalidated.Add([string]$phase.id)
        $changed = $true
      }
    }
  }
  $phaseState = @()
  foreach ($phase in @($Compiled.phases)) {
    $prior = $existing[[string]$phase.id]
    $preserve = $prior -and -not $invalidated.Contains([string]$phase.id)
    $phaseState += [pscustomobject]@{
      id = [string]$phase.id
      status = if ($preserve -and $prior.status) { [string]$prior.status } else { "PENDING" }
      contract_hash = [string]$phase.contract_hash
      started_at = if ($preserve -and $prior.started_at) { [string]$prior.started_at } else { "" }
      ledger_path = if ($preserve -and $prior.ledger_path) { [string]$prior.ledger_path } else { "" }
      completed_at = if ($preserve -and $prior.completed_at) { [string]$prior.completed_at } else { "" }
    }
  }
  $State.phases = @($phaseState)
  $State.plan_hash = [string]$Compiled.plan_hash
  $State.plan_contract_hash = [string]$Compiled.plan_contract_hash
  $State.revision = [int]$Compiled.meta.revision
  if ($Compiled.admission_id) {
    if ($State.admission_hash -and [string]$State.admission_hash -ne [string]$Compiled.admission_hash) {
      foreach ($phase in @($Compiled.phases)) {
        $phaseState = @($State.phases | Where-Object id -eq $phase.id)[0]
        if ($phaseState) {
          $phaseState.status = "PENDING"; $phaseState.started_at = ""; $phaseState.ledger_path = ""; $phaseState.completed_at = ""
        }
      }
      $State.current_phase = $null
    }
    $State.admission_id = [string]$Compiled.admission_id
    $State.admission_hash = [string]$Compiled.admission_hash
    $State.admission_path = [IO.Path]::GetFullPath($AdmissionPath)
  }
  if ($Compiled.execution_mode) { $State.execution_mode = [string]$Compiled.execution_mode }
  if ($invalidated.Count -gt 0 -and $State.current_phase -and $invalidated.Contains([string]$State.current_phase)) {
    $State.current_phase = $null
  }
  if ($invalidated.Count -gt 0 -and $State.status -in @("DONE", "READY_TO_FINALIZE", "BLOCKED")) {
    $State.status = "IN_PROGRESS"
  }
  return $State
}

function Get-PhaseState {
  param([object]$State, [string]$PhaseId)
  return @($State.phases | Where-Object id -eq $PhaseId)[0]
}

function Normalize-Criterion {
  param([string]$Text)
  $value = $Text -replace "(?i)\|?\s*verify\s*:.*$", ""
  $value = $value -replace "(?i)^AC[0-9A-Za-z_-]*\s*", ""
  return (($value -replace "[^A-Za-z0-9]+", " ").Trim().ToLowerInvariant())
}

function Assert-LedgerCoversPhase {
  param([object]$PhaseContract, [string]$Path)
  $body = Read-TextUtf8 $Path
  $ledgerCriteria = @([regex]::Matches($body, "(?im)^\s*-\s*\[[ x!]\]\s*(?<text>.+)$") | ForEach-Object { Normalize-Criterion $_.Groups["text"].Value })
  $planCriteria = @($PhaseContract.acceptance_criteria | ForEach-Object { Normalize-Criterion $_ })
  if ($ledgerCriteria.Count -ne $planCriteria.Count) {
    throw "Ledger coverage mismatch for $($PhaseContract.id): plan AC=$($planCriteria.Count), ledger AC=$($ledgerCriteria.Count)"
  }
  $missing = @($planCriteria | Where-Object { $_ -notin $ledgerCriteria })
  if ($missing.Count -gt 0) {
    throw "Ledger for $($PhaseContract.id) misses plan criteria: $($missing -join '; ')"
  }
}

function Invoke-PhaseLedgerGate {
  param([object]$PhaseContract, [string]$Path)
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { throw "Missing phase ledger: $Path" }
  $auditOutput = (& (Join-Path $PSScriptRoot "audit-slice-ledger.ps1") -Root $Root -LedgerPath $Path -Strict *>&1 | Out-String).Trim()
  if ($LASTEXITCODE -ne 0) { throw "Ledger gate failed for $($PhaseContract.id): $auditOutput" }
  Assert-LedgerCoversPhase $PhaseContract $Path
}

function Get-CriterionId {
  param([string]$Criterion, [int]$Ordinal)
  if ($Criterion -match "(?i)^AC([A-Za-z0-9_-]+)\b") { return ("AC" + $Matches[1]) }
  return ("AC{0}" -f $Ordinal)
}

function Get-CriterionVerifySpec {
  param([string]$Criterion, [int]$Ordinal)
  $id = Get-CriterionId $Criterion $Ordinal
  $command = ""
  $expected = ""
  if ($Criterion -match "(?is)\|\s*verify\s*:\s*(?<command>.*?)(?=\|\s*expected\s*:|$)") {
    $command = ([string]$Matches["command"]).Trim()
  }
  if ($Criterion -match "(?is)\|\s*expected\s*:\s*(?<expected>.*)$") {
    $expected = ([string]$Matches["expected"]).Trim()
  }
  return [pscustomobject]@{
    id = $id
    criterion = $Criterion
    command = $command
    expected = $expected
    ac_contract_hash = Get-ExactHash $Criterion
  }
}

function Get-AcProofContract {
  param([object]$PhaseContract, [string]$AcId)
  return @($PhaseContract.proof_map | Where-Object ac_id -eq $AcId | Select-Object -First 1)[0]
}

function Test-TypedExpected {
  param([string]$Expected, [string]$Output, [int]$ExitCode)
  if ($ExitCode -ne 0) { return $false }
  if (-not $Expected -or $Expected -eq "exit=0") { return $true }
  if ($Expected -match "^(?i:contains:)(?<value>.*)$") {
    return $Output.IndexOf($Matches["value"], [StringComparison]::OrdinalIgnoreCase) -ge 0
  }
  if ($Expected -match "^(?i:regex:)(?<value>.*)$") {
    try { return [regex]::IsMatch($Output, $Matches["value"], [Text.RegularExpressions.RegexOptions]::Multiline) } catch { return $false }
  }
  if ($Expected -match "^(?i:json:)(?<path>[A-Za-z0-9_.-]+)=(?<value>.*)$") {
    try {
      $json = $Output | ConvertFrom-Json
      $current = $json
      foreach ($part in $Matches["path"] -split "\.") {
        $property = $current.PSObject.Properties[$part]
        if (-not $property) { return $false }
        $current = $property.Value
      }
      return ([string]$current -eq $Matches["value"])
    } catch { return $false }
  }
  # Schema v1 compatibility: legacy expected values retain contains semantics.
  return $Output.IndexOf($Expected, [StringComparison]::OrdinalIgnoreCase) -ge 0
}

function Get-NormalizedEvidenceManifest {
  param([string]$Output, [string]$ExpectedKind)
  $line = @($Output -split "\r?\n" | Where-Object { $_ -match "^EVIDENCE_JSON:(?<json>\{.*\})\s*$" } | Select-Object -Last 1)
  if ($line.Count -eq 0) { return $null }
  if ($line[0] -notmatch "^EVIDENCE_JSON:(?<json>\{.*\})\s*$") { return $null }
  try { $manifest = $Matches["json"] | ConvertFrom-Json } catch { return $null }
  if ([string]$manifest.kind -ne $ExpectedKind -or [int]$manifest.assertions_total -le 0 -or [int]$manifest.assertions_failed -ne 0) { return $null }
  if ($ExpectedKind -in @("pipeline-run", "production-smoke")) {
    # External evidence is only admissible when emitted by a query-backed
    # adapter.  A command that merely prints a success-shaped JSON object is
    # not an external deployment or smoke result.
    $queryBacked = ([string]$manifest.query_backed -match "^(?i:true|yes|1)$")
    $adapterVerified = ([string]$manifest.adapter_verified -match "^(?i:true|yes|1)$")
    $adapterName = [string]$(if ($manifest.adapter) { $manifest.adapter } elseif ($manifest.adapter_id) { $manifest.adapter_id } else { "" })
    $sourceName = [string]$(if ($manifest.source) { $manifest.source } elseif ($manifest.provider) { $manifest.provider } else { "" })
    if (-not $queryBacked -or -not $adapterVerified -or -not $adapterName -or -not $sourceName) { return $null }
    if ($sourceName -match "(?i)^(?:agent|assistant|self|manual|prompt)$" -or $adapterName -match "(?i)^(?:self|manual|synthetic|stdout)$") { return $null }
    if (-not $manifest.target_sha -or -not $manifest.terminal_status -or [string]$manifest.terminal_status -notmatch "^(?i:success|passed|completed)$") { return $null }
    if ($ExpectedKind -eq "pipeline-run" -and -not ($manifest.run_id -or $manifest.run_url)) { return $null }
    if ($ExpectedKind -eq "production-smoke" -and -not $manifest.target_url) { return $null }
  }
  return $manifest
}

function Get-ProofArtifacts {
  param([object]$Proof, [DateTime]$StartedAt)
  $results = [System.Collections.Generic.List[object]]::new()
  foreach ($descriptor in @($Proof.artifacts)) {
    if ($descriptor -notmatch "^(?<kind>[^:]+):(?<path>.+)$") { throw "Invalid artifact descriptor: $descriptor" }
    $kind = $Matches["kind"]
    $reference = $Matches["path"]
    $path = if ([IO.Path]::IsPathRooted($reference)) { [IO.Path]::GetFullPath($reference) } else { [IO.Path]::GetFullPath((Join-Path $Root $reference)) }
    $rootPath = [IO.Path]::GetFullPath($Root).TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
    if (-not $path.StartsWith($rootPath, [StringComparison]::OrdinalIgnoreCase)) { throw "Proof artifact escapes workspace: $reference" }
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Missing proof artifact: $reference" }
    $item = Get-Item -LiteralPath $path
    if ($item.LastWriteTimeUtc -lt $StartedAt.AddSeconds(-2)) { throw "Stale proof artifact: $reference" }
    $tests = $null; $failures = $null
    if ($kind -eq "junit") {
      try {
        [xml]$xml = Read-TextUtf8 $path
        $suites = @($xml.SelectNodes("//testsuite"))
        $tests = [int](($suites | Measure-Object -Property tests -Sum).Sum)
        $failures = [int](($suites | Measure-Object -Property failures -Sum).Sum) + [int](($suites | Measure-Object -Property errors -Sum).Sum)
      } catch { throw "Invalid JUnit artifact: $reference" }
      if ($tests -le 0 -or $failures -ne 0) { throw "JUnit artifact has no passing assertion set: $reference" }
    }
    $results.Add([pscustomobject]@{
      kind = $kind; path = $path; sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $path).Hash.ToLowerInvariant()
      size = [int64]$item.Length; modified_at = $item.LastWriteTimeUtc.ToString("o"); tests = $tests; failures = $failures
    })
  }
  return @($results)
}

function Redact-RunnerText {
  param([string]$Value)
  if (-not $Value) { return "" }
  $redacted = $Value
  $redacted = $redacted -replace "(?i)(password|passwd|token|secret|api[_-]?key|ssh[_-]?key)\s*[:=]\s*[^\s,;]+", '$1=[REDACTED]'
  $redacted = $redacted -replace "(?i)(authorization\s*:\s*bearer\s+)[^\s]+", '$1[REDACTED]'
  $redacted = $redacted -replace "\b\d{12,19}\b", "[REDACTED-PAN]"
  if ($redacted.Length -gt 4096) { $redacted = $redacted.Substring(0, 4096) + "...[truncated]" }
  return $redacted
}

function Invoke-RunnerReceipt {
  param(
    [object]$Compiled,
    [object]$State,
    [object]$PhaseContract,
    [string]$AcId,
    [string]$Criterion,
    [string]$CommandOverride,
    [string]$ExpectedOverride,
    [string]$TargetPath = ""
  )
  $spec = Get-CriterionVerifySpec $Criterion 1
  $command = if ($CommandOverride) { $CommandOverride.Trim() } else { $spec.command }
  $expected = if ($ExpectedOverride) { $ExpectedOverride.Trim() } else { $spec.expected }
  if (-not $command) { throw "Acceptance $AcId in $($PhaseContract.id) has no executable verify command" }
  $runner = (Get-Command pwsh -ErrorAction SilentlyContinue | Select-Object -First 1).Source
  if (-not $runner) { $runner = (Get-Command powershell -ErrorAction SilentlyContinue | Select-Object -First 1).Source }
  if (-not $runner) { throw "No PowerShell runner available for receipt verification" }
  $started = [DateTime]::UtcNow
  $phaseState = Get-PhaseState $State $PhaseContract.id
  $phaseStartedAt = if ($phaseState.started_at) { [DateTime]::Parse([string]$phaseState.started_at).ToUniversalTime() } else { $started }
  $proof = Get-AcProofContract $PhaseContract $AcId
  $effectiveCommand = $command
  if ($runner -match "(?i)powershell" -and $effectiveCommand -match "(?i)^pwsh(?:\s|$)") {
    $effectiveCommand = '& "' + $runner + '"' + $effectiveCommand.Substring(4)
  }
  $encodedCommand = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($effectiveCommand))
  $output = (& $runner -NoLogo -NoProfile -EncodedCommand $encodedCommand 2>&1 | Out-String).Trim()
  $exitCode = if ($null -ne $LASTEXITCODE) { [int]$LASTEXITCODE } else { 0 }
  $safeOutput = Redact-RunnerText $output
  $safeCommand = Redact-RunnerText $command
  $expectedMatch = Test-TypedExpected $expected $safeOutput $exitCode
  $manifest = if ($proof -and $proof.manifest) { Get-NormalizedEvidenceManifest $output $proof.kind } else { $null }
  if ($proof -and $proof.manifest -and -not $manifest) { $expectedMatch = $false }
  $artifacts = if ($proof) { @(Get-ProofArtifacts $proof $started) } else { @() }
  $matcher = if ($expected -match "^(?<matcher>[A-Za-z]+)(?:=0|:)") { $Matches["matcher"].ToLowerInvariant() } elseif ($expected) { "legacy_contains" } else { "exit" }
  $receipt = [ordered]@{
    schema_version = 2
    receipt_id = [guid]::NewGuid().ToString()
    plan_id = [string]$Compiled.plan_id
    plan_hash = [string]$Compiled.plan_hash
    revision = [int]$State.revision
    phase = [string]$PhaseContract.id
    phase_id = [string]$PhaseContract.id
    contract_hash = [string]$PhaseContract.contract_hash
    ac_contract_hash = [string]$spec.ac_contract_hash
    ac = [string]$AcId
    ac_id = [string]$AcId
    command = $safeCommand
    command_hash = Get-ExactHash $command
    expected_matcher = $matcher
    expected = $expected
    expected_hash = Get-ExactHash $expected
    proof_profiles = @($(if ($proof) { $proof.profiles } else { @() }))
    proof_dimensions = @($(if ($proof) { $proof.dimensions } else { @() }))
    evidence_kind = $(if ($proof) { [string]$proof.kind } else { "legacy" })
    started_at = $started.ToString("o")
    finished_at = [DateTime]::UtcNow.ToString("o")
    completed_at = [DateTime]::UtcNow.ToString("o")
    phase_started_at = $phaseStartedAt.ToString("o")
    exit_code = $exitCode
    expected_match = [bool]$expectedMatch
    output_hash = Get-TextHash $safeOutput
    output_preview = $safeOutput
    redacted = ($safeOutput -ne $output)
    redactions = @(if ($safeOutput -ne $output) { "sensitive-output-pattern" })
    manifest = $manifest
    manifest_hash = $(if ($manifest) { Get-ExactHash ($manifest | ConvertTo-Json -Depth 8 -Compress) } else { "" })
    artifacts = @($artifacts)
    environment = $(if ($proof) { [string]$proof.environment } else { "local" })
  }
  $dir = Join-Path (Get-StateDirectory $Compiled.plan_id) (Join-Path "receipts" $PhaseContract.id)
  $path = if ($TargetPath) { [IO.Path]::GetFullPath($TargetPath) } else { Join-Path $dir ($AcId + ".json") }
  $path = Assert-SafePath $path "Receipt path"
  $allowedReceiptRoot = [IO.Path]::GetFullPath($dir).TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
  if (-not ([IO.Path]::GetFullPath($path)).StartsWith($allowedReceiptRoot, [StringComparison]::OrdinalIgnoreCase)) { throw "ReceiptPath must stay under $dir" }
  $receipt.receipt_path = [IO.Path]::GetFullPath($path)
  $receipt["receipt_hash"] = Get-ReceiptIntegrityHash ([pscustomobject]$receipt)
  Save-Json $path ([pscustomobject]$receipt)
  return [pscustomobject]@{ receipt = [pscustomobject]$receipt; path = [IO.Path]::GetFullPath($path); passed = ($exitCode -eq 0 -and $expectedMatch) }
}

function Get-ReceiptIntegrityHash {
  param([object]$Receipt)
  # Hash only stable scalar/ordered proof fields.  Hashing a re-serialized
  # PSCustomObject is not portable between Windows PowerShell and pwsh
  # (null-valued properties and array coercion differ), which used to make a
  # valid receipt disappear during complete/finalize on Linux CI.
  $artifactHashes = @($Receipt.artifacts | ForEach-Object { [string]$_.sha256 }) -join "|"
  $stable = @(
    [string]$Receipt.plan_id,
    [string]$Receipt.plan_hash,
    [string]$Receipt.revision,
    [string]$Receipt.phase_id,
    [string]$Receipt.contract_hash,
    [string]$Receipt.ac_contract_hash,
    [string]$Receipt.ac_id,
    [string]$Receipt.command_hash,
    [string]$Receipt.expected_hash,
    [string]$Receipt.expected_match,
    [string]$Receipt.exit_code,
    [string]$Receipt.output_hash,
    [string]$Receipt.evidence_kind,
    [string]$Receipt.environment,
    [string]$Receipt.manifest_hash,
    $artifactHashes
  ) -join "`n"
  return Get-ExactHash $stable
}

function Get-PhaseReceipt {
  param(
    [object]$State, [string]$PhaseId, [string]$AcId, [string]$PlanHash, [int]$Revision, [string]$ContractHash,
    [object]$Spec, [object]$Proof, [string]$PhaseStartedAt
  )
  $candidates = @($State.receipts | Where-Object {
    [string]$_.phase -eq $PhaseId -and [string]$_.ac -eq $AcId -and
    [string]$_.plan_hash -eq $PlanHash -and [int]$_.revision -eq $Revision -and
    [string]$_.contract_hash -eq $ContractHash -and $_.expected_match -eq $true -and [int]$_.exit_code -eq 0 -and $_.receipt_path
  })
  foreach ($candidate in @($candidates | Sort-Object finished_at -Descending)) {
    $path = [string]$candidate.receipt_path
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { continue }
    try {
      $fileReceipt = Get-Content -Raw -Encoding UTF8 -LiteralPath $path | ConvertFrom-Json
      if ([string]$fileReceipt.plan_hash -ne $PlanHash -or [int]$fileReceipt.revision -ne $Revision -or
          [string]$fileReceipt.contract_hash -ne $ContractHash -or [string]$fileReceipt.ac_id -ne $AcId -or
          [int]$fileReceipt.exit_code -ne 0 -or $fileReceipt.expected_match -ne $true) { continue }
      if ($Spec) {
        if ([string]$fileReceipt.ac_contract_hash -ne [string]$Spec.ac_contract_hash -or
            [string]$fileReceipt.command_hash -ne (Get-ExactHash $Spec.command) -or
            [string]$fileReceipt.expected_hash -ne (Get-ExactHash $Spec.expected)) { continue }
      }
      if ($Proof) {
        if ([string]$fileReceipt.evidence_kind -ne [string]$Proof.kind -or [string]$fileReceipt.environment -ne [string]$Proof.environment) { continue }
        if ((@($fileReceipt.proof_dimensions) -join "|") -ne (@($Proof.dimensions) -join "|")) { continue }
      }
      if ($PhaseStartedAt -and [DateTime]::Parse([string]$fileReceipt.started_at).ToUniversalTime() -lt [DateTime]::Parse($PhaseStartedAt).ToUniversalTime()) { continue }
      if ($fileReceipt.receipt_hash -and [string]$fileReceipt.receipt_hash -ne (Get-ReceiptIntegrityHash $fileReceipt)) { continue }
      $artifactsValid = $true
      foreach ($artifact in @($fileReceipt.artifacts)) {
        if (-not (Test-Path -LiteralPath $artifact.path -PathType Leaf) -or (Get-FileHash -Algorithm SHA256 -LiteralPath $artifact.path).Hash.ToLowerInvariant() -ne [string]$artifact.sha256) { $artifactsValid = $false; break }
      }
      if (-not $artifactsValid) { continue }
      if ($fileReceipt.manifest) {
        if ([string]$fileReceipt.manifest_hash -ne (Get-ExactHash ($fileReceipt.manifest | ConvertTo-Json -Depth 8 -Compress))) { continue }
      }
      return $candidate
    } catch { continue }
  }
  return $null
}

function Ensure-PhaseReceipts {
  param([object]$Compiled, [object]$State, [object]$PhaseContract)
  $ordinal = 0
  foreach ($criterion in @($PhaseContract.acceptance_criteria)) {
    $ordinal++
    $spec = Get-CriterionVerifySpec $criterion $ordinal
    if (-not $spec.command) { throw "Acceptance $($spec.id) in $($PhaseContract.id) has no verify command" }
    $phaseState = Get-PhaseState $State $PhaseContract.id
    $proof = Get-AcProofContract $PhaseContract $spec.id
    $existing = Get-PhaseReceipt $State $PhaseContract.id $spec.id $Compiled.plan_hash ([int]$State.revision) $PhaseContract.contract_hash $spec $proof ([string]$phaseState.started_at)
    if ($existing) { continue }
    $run = Invoke-RunnerReceipt $Compiled $State $PhaseContract $spec.id $criterion "" ""
    Add-StateItem $State "receipts" ([pscustomobject]$run.receipt)
    if (-not $run.passed) { throw "Runner verification failed for $($PhaseContract.id)/$($spec.id): exit=$($run.receipt.exit_code), expected_match=$($run.receipt.expected_match)" }
  }
}

function Assert-PhaseReceipts {
  param([object]$Compiled, [object]$State, [object]$PhaseContract)
  $ordinal = 0
  foreach ($criterion in @($PhaseContract.acceptance_criteria)) {
    $ordinal++
    $spec = Get-CriterionVerifySpec $criterion $ordinal
    if (-not $spec.command) { throw "Acceptance $($spec.id) in $($PhaseContract.id) has no verify command" }
    $phaseState = Get-PhaseState $State $PhaseContract.id
    $proof = Get-AcProofContract $PhaseContract $spec.id
    if (-not (Get-PhaseReceipt $State $PhaseContract.id $spec.id $Compiled.plan_hash ([int]$State.revision) $PhaseContract.contract_hash $spec $proof ([string]$phaseState.started_at))) {
      throw "Missing verified receipt for $($PhaseContract.id)/$($spec.id); run planctl verify before complete/finalize"
    }
  }
}

function Assert-NoActiveBlockers {
  param([object]$State, [string]$PhaseId = "")
  $active = @($State.blockers | Where-Object {
    $hasEvidence = [bool]([string]$_.reason).Trim() -and [bool]([string]$_.evidence).Trim()
    $resolved = ($_.resolved -eq $true) -or [bool]([string]$_.resolved_at).Trim()
    $samePhase = (-not $PhaseId) -or (-not [string]$_.phase) -or ([string]$_.phase -eq $PhaseId)
    $hasEvidence -and -not $resolved -and $samePhase
  })
  if ($active.Count -gt 0) { throw "Plan has active blockers; recover them before completion/finalize" }
}

function Get-ActiveBlockers {
  param([object]$State)
  return @($State.blockers | Where-Object {
    $hasEvidence = [bool]([string]$_.reason).Trim() -and [bool]([string]$_.evidence).Trim()
    $resolved = ($_.resolved -eq $true) -or [bool]([string]$_.resolved_at).Trim()
    $hasEvidence -and -not $resolved
  })
}

function Set-BlockerDerivedStatus {
  param([object]$State)
  $open = @($State.phases | Where-Object { [string]$_.status -ne "DONE" })
  $active = @(Get-ActiveBlockers $State)
  if ($active.Count -eq 0) {
    $State.status = if ($open.Count -eq 0) { "READY_TO_FINALIZE" } else { "IN_PROGRESS" }
    return
  }
  $globalBlocker = @($active | Where-Object { -not [string]$_.phase }).Count -gt 0
  $blockedIds = @($active | Where-Object { [string]$_.phase } | ForEach-Object { [string]$_.phase })
  $allOpenBlocked = $open.Count -gt 0 -and @($open | Where-Object { [string]$_.id -notin $blockedIds }).Count -eq 0
  $State.status = if ($globalBlocker -or $allOpenBlocked) { "BLOCKED" } else { "IN_PROGRESS" }
}

function Assert-LeaseValid {
  param([object]$State)
  if ($State.current_phase -and $State.lease_expires_at) {
    try {
      if ([DateTime]::Parse([string]$State.lease_expires_at).ToUniversalTime() -le [DateTime]::UtcNow) {
        throw "Plan lease expired; start the active phase again to reclaim it"
      }
    } catch [FormatException] { throw "Invalid plan lease timestamp; reconcile state before continuing" }
  }
  if ($State.current_phase -and $State.lease_id) {
    $provided = if ($LeaseId) { $LeaseId } elseif ($env:PLANCTL_LEASE_ID) { [string]$env:PLANCTL_LEASE_ID } else { "" }
    if (-not $provided) { throw "Active phase requires -LeaseId (or PLANCTL_LEASE_ID) returned by planctl start" }
    if ($provided -ne [string]$State.lease_id) { throw "Lease mismatch for active phase $($State.current_phase)" }
  }
}

function Require-Compiled {
  $path = Get-PlanPathResolved
  # Resolve the admission artifact before compiling.  Previously the first
  # compile ran without admission context, which let an admitted v1 plan slip
  # through validation and only gained coverage semantics on a later call.
  if ($AdmissionPath) { $script:AdmissionPath = Assert-SafePath $AdmissionPath "Admission path" }
  $compiled = Compile-Plan $path
  if (-not $AdmissionPath) {
    $priorState = Load-State $compiled.plan_id
    if (($priorState.PSObject.Properties.Name -contains "admission_path") -and $priorState.admission_path) {
      $script:AdmissionPath = [string]$priorState.admission_path
      if (-not $ExecutionMode -and ($priorState.PSObject.Properties.Name -contains "execution_mode")) {
        $script:ExecutionMode = [string]$priorState.execution_mode
      }
    }
  }
  $compiled = Compile-Plan $path
  $compiledPath = Save-Compiled $compiled
  $requiresStrictInit = ($Action -eq "init" -and ([bool]$compiled.admission_id -or [string]$compiled.execution_mode -eq "continuous"))
  if (($Action -in @("start", "verify", "complete", "finalize") -or $requiresStrictInit) -and -not $compiled.valid) {
    $codes = (@($compiled.diagnostics | Where-Object severity -eq "error" | ForEach-Object { $_.code } | Select-Object -Unique) -join ",")
    throw "Plan validation failed [$codes]; inspect $compiledPath before changing state"
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
    Write-Host "VALIDATION_PASS: plan semantic validation ($($Compiled.plan_id)); warnings=$($Compiled.warnings)"
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
    "admit" {
      if (-not $AdmissionPath) { throw "-AdmissionPath is required for admit" }
      $admission = Read-TextUtf8 $AdmissionPath | ConvertFrom-Json
      if (-not $admission.admission_id -or @($admission.source_items).Count -eq 0) { throw "Admission artifact must contain admission_id and source_items" }
      foreach ($item in @($admission.source_items)) {
        if ($item.text -or $item.prompt -or $item.content) { throw "Admission artifact must not contain raw prompt/source text" }
        if (-not $item.id -or $item.sha256 -notmatch '^[0-9a-fA-F]{64}$') { throw "Admission source item has invalid id/hash" }
      }
      Write-Host "ADMITTED: $($admission.admission_id); source_items=$(@($admission.source_items).Count); mode=$($admission.execution_mode)"
      exit 0
    }
    "init" {
      $compiled = Require-Compiled
      $loadedState = Load-State $compiled.plan_id
      $priorStatus = [string]$loadedState.status
      $priorPlanHash = [string]$loadedState.plan_hash
      $state = Ensure-StateShape $loadedState $compiled
      $phaseCount = @($state.phases).Count
      $doneCount = @($state.phases | Where-Object status -eq "DONE").Count
      $hasActivePhase = @($state.phases | Where-Object status -eq "IN_PROGRESS").Count -gt 0 -or [bool]$state.current_phase
      $planUnchanged = $priorPlanHash -and $priorPlanHash -eq [string]$compiled.plan_hash
      if (-not $compiled.valid) {
        $state.status = "DRAFT"
      } elseif ($priorStatus -eq "DONE" -and $planUnchanged -and $phaseCount -gt 0 -and $doneCount -eq $phaseCount) {
        # init is idempotent: re-running it must not reopen a completed plan.
        $state.status = "DONE"
      } elseif ($hasActivePhase) {
        $state.status = "IN_PROGRESS"
      } elseif ($priorStatus -eq "BLOCKED" -and $doneCount -lt $phaseCount) {
        $state.status = "BLOCKED"
      } elseif ($doneCount -eq $phaseCount -and $phaseCount -gt 0) {
        $state.status = "READY_TO_FINALIZE"
      } elseif ($priorStatus -in @("RECONCILE_REQUIRED", "REVISE")) {
        $state.status = $priorStatus
      } else {
        $state.status = "READY"
      }
      $state.revision = [int]($state.revision)
      Add-StateItem $state "history" ([pscustomobject]@{ at = [DateTime]::UtcNow.ToString("o"); event = "init"; valid = $compiled.valid })
      Save-State $state | Out-Null
      Write-Host "$(if ($compiled.valid) { 'STATE_READY' } else { 'STATE_PARTIAL' }): plan state initialized for $($compiled.plan_id)"
      if ($compiled.valid) { exit 0 } else { exit 1 }
    }
    "adopt" {
      $compiled = Require-Compiled
      $state = Ensure-StateShape (Load-State $compiled.plan_id) $compiled
      $state.status = "RECONCILE_REQUIRED"
      $state.enforcement_status = ""
      $state.current_phase = $null
      foreach ($phaseState in @($state.phases)) {
        $phaseState.status = "PENDING"
        $phaseState.started_at = ""
        $phaseState.ledger_path = ""
        $phaseState.completed_at = ""
      }
      Add-StateItem $state "history" ([pscustomobject]@{ at = [DateTime]::UtcNow.ToString("o"); event = "adopt"; reason = "legacy state/progress requires reconciliation" })
      Save-State $state | Out-Null
      Write-Host "RECONCILE_REQUIRED: legacy plan adopted $($compiled.plan_id); prior completion claims are not trusted"
      exit 0
    }
    "status" {
      $id = if ($PlanId) { Normalize-Id $PlanId } else { (Require-Compiled).plan_id }
      $state = Load-State $id
      $state | ConvertTo-Json -Depth 12
      exit 0
    }
    "focus" {
      if (-not $PlanId) { throw "-PlanId is required for focus" }
      $id = Normalize-Id $PlanId
      $statePath = Join-Path (Get-StateDirectory $id) "state.json"
      if (-not (Test-Path -LiteralPath $statePath -PathType Leaf)) { throw "Cannot focus plan without initialized state: $id" }
      $focusPath = Join-Path $StateRoot "active-plan.json"
      Save-Json $focusPath ([pscustomobject]@{ plan_id = $id; focused_at = [DateTime]::UtcNow.ToString("o") })
      Write-Host "PLAN_FOCUSED: $id"
      exit 0
    }
    "start" {
      $compiled = Require-Compiled
      $state = Ensure-StateShape (Load-State $compiled.plan_id) $compiled
      $phaseId = if ($Phase) { $Phase } else { $compiled.phases[0].id }
      if (-not @($compiled.phases.id) -contains $phaseId) { throw "Unknown phase: $phaseId" }
      $phaseContract = @($compiled.phases | Where-Object id -eq $phaseId)[0]
      $phaseState = Get-PhaseState $state $phaseId
      if ($phaseState.status -eq "DONE") { throw "Phase $phaseId is already complete" }
      if ($state.current_phase -and [string]$state.current_phase -ne $phaseId) {
        $expired = $false
        if ($state.lease_expires_at) { try { $expired = [DateTime]::Parse([string]$state.lease_expires_at).ToUniversalTime() -le [DateTime]::UtcNow } catch { throw "Invalid plan lease timestamp; reconcile state before continuing" } }
        if (-not $expired) { throw "Phase $($state.current_phase) is already active" }
        $oldPhase = Get-PhaseState $state ([string]$state.current_phase)
        if ($oldPhase -and $oldPhase.status -eq "IN_PROGRESS") { $oldPhase.status = "PENDING" }
        Add-StateItem $state "history" ([pscustomobject]@{ at = [DateTime]::UtcNow.ToString("o"); event = "lease_reclaimed"; phase = $state.current_phase })
        $state.current_phase = $null
      }
      $openDependencies = @($phaseContract.depends_on | Where-Object { (Get-PhaseState $state $_).status -ne "DONE" })
      if ($openDependencies.Count -gt 0) { throw "Phase $phaseId has incomplete dependencies: $($openDependencies -join ', ')" }
      $state.status = "IN_PROGRESS"; $state.current_phase = $phaseId; $state.session_id = [guid]::NewGuid().ToString()
      $state.lease_id = [string]$state.session_id
      $state.lease_expires_at = [DateTime]::UtcNow.AddMinutes(30).ToString("o")
      $phaseState.status = "IN_PROGRESS"
      $phaseState.started_at = [DateTime]::UtcNow.ToString("o")
      Add-StateItem $state "history" ([pscustomobject]@{ at = [DateTime]::UtcNow.ToString("o"); event = "start"; phase = $phaseId; session_id = $state.session_id })
      Save-State $state | Out-Null
      Write-Host "LEASE_ACQUIRED: started $($compiled.plan_id) phase $phaseId; lease=$($state.lease_id)"
      exit 0
    }
    "verify" {
      $compiled = Require-Compiled
      $state = Ensure-StateShape (Load-State $compiled.plan_id) $compiled
      $phaseId = if ($Phase) { $Phase } elseif ($state.current_phase) { [string]$state.current_phase } else { throw "-Phase is required when no phase is active" }
      $phaseContract = @($compiled.phases | Where-Object id -eq $phaseId)[0]
      if (-not $phaseContract) { throw "Unknown phase: $phaseId" }
      $phaseState = Get-PhaseState $state $phaseId
      if (-not $phaseState -or $phaseState.status -ne "IN_PROGRESS") { throw "Phase $phaseId must be IN_PROGRESS before verify" }
      Assert-LeaseValid $state
      Assert-LeaseOwner $state
      if (-not $AcId) { throw "-AcId is required for verify" }
      $ordinal = 0; $criterion = $null
      foreach ($candidate in @($phaseContract.acceptance_criteria)) {
        $ordinal++; $spec = Get-CriterionVerifySpec $candidate $ordinal
        if ($spec.id -eq $AcId) { $criterion = $candidate; break }
      }
      if (-not $criterion) { throw "Unknown acceptance criterion $AcId in phase $phaseId" }
      $declared = Get-CriterionVerifySpec $criterion $ordinal
      if ($Command -and $declared.command -and (Get-ExactHash $Command) -ne (Get-ExactHash $declared.command)) {
        throw "Verify command for $phaseId/$AcId does not match the phase contract"
      }
      if ($Expected -and (Get-ExactHash $Expected) -ne (Get-ExactHash $declared.expected)) {
        throw "Expected matcher for $phaseId/$AcId does not match the phase contract"
      }
      $run = Invoke-RunnerReceipt $compiled $state $phaseContract $AcId $criterion $Command $Expected $ReceiptPath
      Add-StateItem $state "receipts" ([pscustomobject]$run.receipt)
      Save-State $state | Out-Null
      if (-not $run.passed) {
        Write-Host "VERIFY_FAIL: $($phaseId)/$AcId receipt=$($run.path) exit=$($run.receipt.exit_code) expected_match=$($run.receipt.expected_match)"
        exit 1
      }
      Write-Host "VERIFY_PASS: $($phaseId)/$AcId receipt=$($run.path)"
      exit 0
    }
    "evidence" {
      $compiled = Require-Compiled
      $id = if ($PlanId) { Normalize-Id $PlanId } else { $compiled.plan_id }
      if (-not $AcId -or -not $Evidence) { throw "-AcId and -Evidence are required for evidence" }
      if (-not $Phase) { throw "-Phase is required for evidence; text evidence never substitutes for a runner receipt" }
      $evidencePhase = @($compiled.phases | Where-Object id -eq $Phase)[0]
      if (-not $evidencePhase) { throw "Unknown phase for evidence: $Phase" }
      $evidenceProof = Get-AcProofContract $evidencePhase $AcId
      if ($evidenceProof -and [string]$evidenceProof.kind -in @("pipeline-run", "production-smoke")) {
        throw "External evidence cannot be self-authored with -Action evidence; run planctl verify through a query-backed adapter"
      }
      $state = Load-State $id
      Add-StateItem $state "evidence" ([pscustomobject]@{ ac = $AcId; phase = $Phase; command = $Command; expected = $Expected; evidence = $Evidence; at = [DateTime]::UtcNow.ToString("o"); authoritative = $false })
      Save-State $state | Out-Null
      Write-Host "EVIDENCE_RECORDED: evidence recorded for $AcId"
      exit 0
    }
    "block" {
      $id = Normalize-Id $PlanId
      if (-not $Reason -or -not $Evidence) { throw "-Reason and -Evidence are required for block" }
      if (-not $Phase) { throw "-Phase is required; blockers are phase-scoped (use a plan-wide blocker only through an explicit reconciled state)" }
      $state = Load-State $id
      if (-not @($state.phases | Where-Object { [string]$_.id -eq [string]$Phase })) { throw "Unknown phase for blocker: $Phase" }
      Add-StateItem $state "blockers" ([pscustomobject]@{ reason = $Reason; evidence = $Evidence; phase = $Phase; at = [DateTime]::UtcNow.ToString("o"); resolved = $false; resolved_at = ""; resolved_reason = "" })
      Set-BlockerDerivedStatus $state
      Save-State $state | Out-Null
      Write-Host "PHASE_BLOCKED: blocker recorded for $id phase $Phase; plan=$($state.status)"
      exit 1
    }
    "recover" {
      $id = Normalize-Id $PlanId
      if (-not $Reason) { throw "-Reason is required for recover" }
      $state = Load-State $id
      $candidate = @($state.blockers | Where-Object {
        $samePhase = (-not $Phase) -or ([string]$_.phase -eq $Phase)
        $unresolved = ($_.resolved -ne $true) -and -not [string]$_.resolved_at
        $samePhase -and $unresolved
      } | Select-Object -Last 1)[0]
      if (-not $candidate) { throw "No unresolved blocker found for $id" }
      if (-not ($candidate.PSObject.Properties.Name -contains "resolved")) { $candidate | Add-Member -NotePropertyName resolved -NotePropertyValue $true } else { $candidate.resolved = $true }
      if (-not ($candidate.PSObject.Properties.Name -contains "resolved_at")) { $candidate | Add-Member -NotePropertyName resolved_at -NotePropertyValue ([DateTime]::UtcNow.ToString("o")) } else { $candidate.resolved_at = [DateTime]::UtcNow.ToString("o") }
      if (-not ($candidate.PSObject.Properties.Name -contains "resolved_reason")) { $candidate | Add-Member -NotePropertyName resolved_reason -NotePropertyValue $Reason } else { $candidate.resolved_reason = $Reason }
      Set-BlockerDerivedStatus $state
      Add-StateItem $state "history" ([pscustomobject]@{ at = [DateTime]::UtcNow.ToString("o"); event = "blocker_recovered"; phase = $candidate.phase; reason = $Reason })
      Save-State $state | Out-Null; Write-Host "BLOCKER_RECOVERED: blocker recovered for $id"; exit 0
    }
    "complete" {
      $compiled = Require-Compiled
      $state = Ensure-StateShape (Load-State $compiled.plan_id) $compiled
      $phaseId = if ($Phase) { $Phase } elseif ($state.current_phase) { [string]$state.current_phase } else { throw "-Phase is required when no phase is active" }
      $phaseContract = @($compiled.phases | Where-Object id -eq $phaseId)[0]
      if (-not $phaseContract) { throw "Unknown phase: $phaseId" }
      $phaseState = Get-PhaseState $state $phaseId
      if (-not $phaseState -or $phaseState.status -ne "IN_PROGRESS" -or [string]$state.current_phase -ne $phaseId) {
        throw "Phase $phaseId must be the active IN_PROGRESS phase before complete"
      }
      Assert-LeaseOwner $state
      Assert-LeaseValid $state
      if (-not $LedgerPath) { $LedgerPath = Join-Path $StateRoot "$($compiled.plan_id)\ledger\$phaseId.md" }
      $LedgerPath = Assert-SafePath $LedgerPath "Ledger path"
      Invoke-PhaseLedgerGate $phaseContract $LedgerPath
      Assert-NoActiveBlockers $state $phaseId
      Assert-PhaseReceipts $compiled $state $phaseContract
      $phaseState.status = "DONE"
      $phaseState.ledger_path = [IO.Path]::GetFullPath($LedgerPath)
      $phaseState.completed_at = [DateTime]::UtcNow.ToString("o")
      $state.current_phase = $null
      $state.lease_id = ""
      $state.lease_expires_at = ""
      $doneCount = @($state.phases | Where-Object status -eq "DONE").Count
      $totalCount = @($state.phases).Count
      $state.status = if ($doneCount -eq $totalCount) { "READY_TO_FINALIZE" } else { "IN_PROGRESS" }
      Add-StateItem $state "history" ([pscustomobject]@{ at = [DateTime]::UtcNow.ToString("o"); event = "phase_complete"; phase = $phaseId; ledger = $phaseState.ledger_path })
      Save-State $state | Out-Null
      Write-Host "SLICE_PASS: $($compiled.plan_id) phase $phaseId completed ($doneCount/$totalCount); plan=$($state.status)"
      exit 0
    }
    "finalize" {
      $compiled = Require-Compiled
      $state = Ensure-StateShape (Load-State $compiled.plan_id) $compiled
      if ([int]$compiled.paf_schema_version -lt 2) {
        throw "Plan cannot finalize with PAF schema v1; add schema_version: 2 and complete proof_map/typed evidence"
      }
      if ([string]$state.enforcement_status -eq "ENFORCEMENT_EXHAUSTED") { throw "Plan cannot finalize after ENFORCEMENT_EXHAUSTED; recover/reconcile the plan first" }
      Assert-NoActiveBlockers $state
      $openPhases = @($state.phases | Where-Object status -ne "DONE" | ForEach-Object id)
      if ($openPhases.Count -gt 0) { throw "Plan cannot finalize; open phases: $($openPhases -join ', ')" }
      foreach ($phaseContract in @($compiled.phases)) {
        $phaseState = Get-PhaseState $state $phaseContract.id
        if (-not $phaseState.ledger_path) { throw "Plan cannot finalize; $($phaseContract.id) has no recorded ledger" }
        Invoke-PhaseLedgerGate $phaseContract $phaseState.ledger_path
        Assert-PhaseReceipts $compiled $state $phaseContract
      }
      $state.status = "DONE"; $state.current_phase = $null
      Add-StateItem $state "history" ([pscustomobject]@{ at = [DateTime]::UtcNow.ToString("o"); event = "plan_finalize"; phases = @($compiled.phases.id) })
      Save-State $state | Out-Null
      Write-Host "PLAN_PASS: plan finalized $($compiled.plan_id); phases=$(@($compiled.phases).Count)/$(@($compiled.phases).Count)"
      exit 0
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
      $target = Assert-SafePath $target "Handoff output path"
      [IO.File]::WriteAllText($target, $text, [Text.Encoding]::UTF8)
      Write-Host "HANDOFF_READY: generated at $out"; exit 0
    }
    "revise" {
      $id = Normalize-Id $PlanId; $state = Load-State $id; $state.status = "REVISE"; $state.enforcement_status = ""; $state.revision = [int]$state.revision + 1
      Add-StateItem $state "history" ([pscustomobject]@{ at = [DateTime]::UtcNow.ToString("o"); event = "revise"; reason = $Reason; phase = $Phase })
      Save-State $state | Out-Null; Write-Host "REVISION_RECORDED: revision $($state.revision) recorded for $id"; exit 0
    }
    "gate" {
      if (-not $LedgerPath) { throw "-LedgerPath is required for gate" }
      & (Join-Path $PSScriptRoot "audit-slice-ledger.ps1") -Root $Root -LedgerPath $LedgerPath -Strict
      exit $LASTEXITCODE
    }
    "report" {
      $compiled = Require-Compiled
      $state = Ensure-StateShape (Load-State $compiled.plan_id) $compiled
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
        $phaseState = Get-PhaseState $state $phase.id
        $lines.Add("## $($phase.id) - $($phase.title)")
        $lines.Add("- Status: $($phaseState.status)")
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
      Write-Host "REPORT_READY: generated at $out"; exit 0
    }
  }
} catch {
  $message = if ($_ -and $_.Exception) { $_.Exception.Message } else { "planctl failed" }
  Write-Host "ERROR: $message"
  if ($_ -and $_.ScriptStackTrace) { Write-Host $_.ScriptStackTrace }
  exit 1
}
