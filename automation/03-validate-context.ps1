$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Problems = [System.Collections.Generic.List[string]]::new()
. (Join-Path $PSScriptRoot "path-compat.ps1")

$ManifestPath = Join-Path $Root "rules\manifest.yaml"
$BudgetYaml = if (Test-Path $ManifestPath) { Get-Content -Raw $ManifestPath } else { "" }
$CoreBudget = 4000
if ($BudgetYaml -match "core_total_tokens:\s*(\d+)") { $CoreBudget = [int]$Matches[1] }

$ManifestContent = if (Test-Path $ManifestPath) { Get-Content -Raw $ManifestPath } else { "" }
$LoadOrderFiles = [System.Collections.Generic.List[string]]::new()
if ($ManifestContent -match '(?s)load_order:\s*\r?\n((?:[ \t]+-\s+\S+\r?\n)+)') {
  $Block = $Matches[1]
  foreach ($Line in ($Block -split "`n")) {
    if ($Line -match "-\s*(\S+)") { $LoadOrderFiles.Add($Matches[1]) }
  }
}
$Core = $LoadOrderFiles | ForEach-Object { Join-Path $Root "rules\$_" } | Where-Object { Test-Path $_ }
$CoreChars = ($Core | ForEach-Object {
  (Get-Content -Raw -Encoding UTF8 $_).Replace("`r`n", "`n").Replace("`r", "`n").Length
} | Measure-Object -Sum).Sum
$CoreTokens = [math]::Ceiling($CoreChars / 3.6)
if ($CoreTokens -gt $CoreBudget) { $Problems.Add("Core token budget exceeded: $CoreTokens > $CoreBudget") }
if ($LoadOrderFiles.Count -lt 7) { $Problems.Add("manifest load_order parse incomplete: only $($LoadOrderFiles.Count) rule(s)") }

foreach ($Platform in @("codex", "grok", "antigravity", "cursor")) {
  $Overlay = Join-Path $Root "platforms\$Platform\$Platform-overlay.md"
  if (-not (Test-Path $Overlay)) { $Problems.Add("Missing overlay: $Overlay"); continue }
  $Tokens = [math]::Ceiling((Get-Content -Raw -Encoding UTF8 $Overlay).Length / 3.6)
  if ($Tokens -gt 600) { $Problems.Add("$Platform overlay budget exceeded: $Tokens") }
}

$SkillFiles = Get-ChildItem (Join-Path $Root "skills") -Directory | ForEach-Object {
  Join-Path $_.FullName "SKILL.md"
} | Where-Object { Test-Path $_ }

# Owner-intentional oversize packs (cohesion) - do not FAIL size-only (see rules/50-context-budget.md)
$IntentionalOversizeSkills = @("docs-style", "plan-and-handoff", "finish-to-completion", "code-review")

$Slugs = @()
foreach ($SkillPath in $SkillFiles) {
  $Slug = (Split-Path $SkillPath -Parent | Split-Path -Leaf)
  $Slugs += $Slug
  $RawBytes = [System.IO.File]::ReadAllBytes($SkillPath)
  if ($RawBytes.Length -ge 3 -and $RawBytes[0] -eq 0xEF -and $RawBytes[1] -eq 0xBB -and $RawBytes[2] -eq 0xBF) {
    $Problems.Add("UTF-8 BOM forbidden in skill frontmatter: $SkillPath")
  }
  $Tokens = [math]::Ceiling((Get-Content -Raw -Encoding UTF8 $SkillPath).Length / 3.6)
  if ($Tokens -gt 3500 -and $IntentionalOversizeSkills -notcontains $Slug) {
    $Problems.Add("Skill token budget exceeded: $SkillPath = $Tokens")
  } elseif ($Tokens -gt 3500) {
    Write-Host "Intentional oversize skill (allowed): $Slug ~$Tokens tokens"
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
  "skills\plan-and-handoff\SKILL.md",
  "skills\plan-and-handoff\references\adaptive-work-protocol.md",
  "skills\plan-and-handoff\references\plan-artifact-template.md",
  "skills\plan-and-handoff\references\capability-tier-routing.md",
  "skills\finish-to-completion\references\slice-gate-protocol.md",
  "automation\workctl.py",
  "automation\work-ledger.schema.json",
  "automation\test-workctl.py",
  "projects\5fedu\domains\references\pattern-inventory.yaml"
)
foreach ($Path in $RequiredPaths) {
  if (-not (Test-Path (Join-Path $Root $Path))) { $Problems.Add("Missing required path: $Path") }
}

$CodexAgentsTemplate = Join-Path $Root "platforms\codex\AGENTS.md"
if (Test-Path $CodexAgentsTemplate) {
  $CodexAgentsBody = Get-Content -Raw -Encoding UTF8 $CodexAgentsTemplate
  if ($CodexAgentsBody -notlike "*@__GENERATED_CORE_IMPORTS__*") {
    $Problems.Add("Codex AGENTS template missing generated core import marker")
  }
  if ($CodexAgentsBody -notlike "*@__CODEX_HOME__/rules/codex-overlay.md*" -or $CodexAgentsBody -notlike "*__AGENT_RULES_ROOT__*") {
    $Problems.Add("Codex AGENTS template missing runtime placeholders")
  }
  if ($CodexAgentsBody -match '(?i)[A-Z]:[\\/]') {
    $Problems.Add("Codex AGENTS template contains a machine-specific Windows path")
  }
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
    & $PlanArtifactAudit -Root $Root 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
      $Problems.Add("Plan artifact audit failed - run automation/audit-plan-artifact.ps1")
    }
  } catch {
    $Problems.Add("Plan artifact audit crashed - error: $_")
  }
} else {
  $Problems.Add("Missing plan artifact audit: automation/audit-plan-artifact.ps1")
}

$PythonExe = $env:AGENT_RULES_PYTHON
if (-not $PythonExe) { $PythonExe = $env:HARNESS_PYTHON }
if (-not $PythonExe) { $PythonExe = (Get-Command python -ErrorAction SilentlyContinue).Source }
foreach ($ContractTest in @("test-workctl.py", "test-skill-gate-stack.py", "test-external-receipt.py")) {
  $TestPath = Join-Path $Root "automation\$ContractTest"
  if (-not $PythonExe -or -not (Test-Path $TestPath)) {
    $Problems.Add("Missing Python or workflow fixture: $TestPath")
    continue
  }
  try {
    & $PythonExe $TestPath 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { $Problems.Add("Workflow fixture failed: $ContractTest") }
  } catch {
    $Problems.Add("Workflow fixture crashed: $ContractTest - error: $_")
  }
}

$WorkflowAudit = Join-Path $Root "automation\audit-workflow-clarity.ps1"
if (-not (Test-Path $WorkflowAudit)) {
  $Problems.Add("Missing workflow clarity audit: automation/audit-workflow-clarity.ps1")
} else {
  & $WorkflowAudit -Root $Root 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) { $Problems.Add("Adaptive workflow clarity audit failed") }
}

$ToolRegistryAudit = Join-Path $Root "automation\validate-tool-registry.ps1"
if (-not (Test-Path $ToolRegistryAudit)) {
  $Problems.Add("Missing tool registry validator")
} else {
  & $ToolRegistryAudit -Root $Root 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) { $Problems.Add("Tool registry validation failed") }
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

# Always-on must not reintroduce legacy dual-tree filenames in canonical rules/
$LegacyAlwaysOn = @("00-index.md", "01-agent-workflow-sop.md", "07-finish-to-completion.md", "08-ui-consistency-gate.md")
foreach ($Legacy in $LegacyAlwaysOn) {
  if (Test-Path (Join-Path $Root "rules\$Legacy")) {
    $Problems.Add("Legacy always-on rule must not live in canonical rules/: $Legacy")
  }
}

# Intentional oversize declarations remain explicit.
$BudgetBody = Get-Content -Raw -Encoding UTF8 (Join-Path $Root "rules\50-context-budget.md")
if ($BudgetBody -notlike "*Intentional oversize*" -or $BudgetBody -notlike "*docs-style*" -or $BudgetBody -notlike "*plan-and-handoff*") {
  $Problems.Add("rules/50-context-budget.md missing intentional oversize owner intent for docs-style/plan-and-handoff")
}

$RouteCasesPath = Join-Path $Root "automation\context-route-cases.json"
$RouteCasesSchemaPath = Join-Path $Root "automation\context-route-cases.schema.json"
if (-not (Test-Path $RouteCasesPath)) {
  $Problems.Add("Missing progressive context route cases: automation/context-route-cases.json")
} else {
  try {
    $RouteCases = Get-Content -Raw -Encoding UTF8 $RouteCasesPath | ConvertFrom-Json
    if ([int]$RouteCases.version -lt 3) { $Problems.Add("Progressive route cases must use schema version 3+") }
    if (-not (Test-Path -LiteralPath $RouteCasesSchemaPath)) { $Problems.Add("Missing route case schema: automation/context-route-cases.schema.json") }
    foreach ($Case in @($RouteCases.cases)) {
      if (-not $Case.id -or -not $Case.prompt -or -not $Case.workspace -or -not $Case.expect) {
        $Problems.Add("Progressive route case missing id/prompt/workspace/expect")
        break
      }
    }
    foreach ($BudgetName in @("core_tokens", "normal_execution_tokens", "uncertain_execution_tokens", "plan_authoring_tokens", "harness_edit_tokens", "5fedu_ui_base_tokens")) {
      if (-not $RouteCases.budgets.PSObject.Properties.Name -contains $BudgetName) {
        $Problems.Add("Progressive route budget missing: $BudgetName")
      }
    }
    if (@($RouteCases.cases).Count -lt 8) { $Problems.Add("Progressive route cases are incomplete") }
    if (-not $RouteCases.routes) {
      $Problems.Add("Progressive route definitions missing")
    } else {
      foreach ($RouteName in @($RouteCases.routes.PSObject.Properties.Name)) {
        $RouteChars = 0
        foreach ($RouteFile in @($RouteCases.routes.$RouteName)) {
          $RoutePath = Join-Path $Root ($RouteFile -replace '/', '\')
          if (-not (Test-Path -LiteralPath $RoutePath)) {
            $Problems.Add("Progressive route file missing: $RouteFile")
            continue
          }
          $RouteChars += (Get-Content -Raw -Encoding UTF8 -LiteralPath $RoutePath).Replace("`r`n", "`n").Replace("`r", "`n").Length
        }
        $RouteTokens = [math]::Ceiling($RouteChars / 3.6)
        $BudgetKey = switch ($RouteName) {
          "normal_execution" { "normal_execution_tokens" }
          "uncertain_execution" { "uncertain_execution_tokens" }
          "plan_authoring" { "plan_authoring_tokens" }
          "harness_edit" { "harness_edit_tokens" }
          "5fedu_ui_base" { "5fedu_ui_base_tokens" }
          default { $null }
        }
        if ($BudgetKey -and $RouteCases.budgets.$BudgetKey -and $RouteTokens -gt [int]$RouteCases.budgets.$BudgetKey) {
          $Problems.Add("Progressive route budget exceeded: $RouteName = $RouteTokens > $($RouteCases.budgets.$BudgetKey)")
        }
        Write-Host "Route tokens ($RouteName): $RouteTokens / $($RouteCases.budgets.$BudgetKey)"
      }
    }
  } catch {
    $Problems.Add("Progressive route cases invalid JSON: $RouteCasesPath")
  }
}

$RouterTest = Join-Path $Root "automation\test-context-router.py"
$GraphBuilderForRoute = Join-Path $Root "automation\build-context-graph.ps1"
if (Test-Path -LiteralPath $GraphBuilderForRoute) {
  & $GraphBuilderForRoute -Root $Root -OutputPath (Join-Path $Root "05-generated\context-graph.json") 2>&1 | ForEach-Object { Write-Host $_ }
  if ($LASTEXITCODE -ne 0) { $Problems.Add("Context graph rebuild failed before conformance") }
}
$PythonCommand = $env:AGENT_RULES_PYTHON
if (-not $PythonCommand) { $PythonCommand = $env:HARNESS_PYTHON }
if (-not $PythonCommand) {
  foreach ($Candidate in @("python", "python3")) {
    $Resolved = Get-Command $Candidate -ErrorAction SilentlyContinue
    if ($Resolved) { $PythonCommand = $Resolved.Source; break }
  }
}
if (-not (Test-Path -LiteralPath $RouterTest)) {
  $Problems.Add("Missing graph routing conformance test: automation/test-context-router.py")
} elseif (-not $PythonCommand) {
  $Problems.Add("Cannot execute graph routing conformance: set AGENT_RULES_PYTHON or install python")
} else {
  & $PythonCommand $RouterTest 2>&1 | ForEach-Object { Write-Host $_ }
  if ($LASTEXITCODE -ne 0) { $Problems.Add("Graph routing conformance failed: automation/test-context-router.py") }
}

$QualityBenchmarkTest = Join-Path $Root "automation\test-agent-quality-benchmark.py"
if (-not (Test-Path -LiteralPath $QualityBenchmarkTest)) {
  $Problems.Add("Missing evidence-first benchmark test: automation/test-agent-quality-benchmark.py")
} elseif ($PythonCommand) {
  & $PythonCommand $QualityBenchmarkTest --contracts-only 2>&1 | ForEach-Object { Write-Host $_ }
  if ($LASTEXITCODE -ne 0) { $Problems.Add("Agent quality benchmark contracts failed") }
}

$LiveAdapterTest = Join-Path $Root "automation\test-live-agent-adapter.py"
if (-not (Test-Path -LiteralPath $LiveAdapterTest)) {
  $Problems.Add("Missing live-agent adapter test: automation/test-live-agent-adapter.py")
} elseif ($PythonCommand) {
  & $PythonCommand $LiveAdapterTest --contracts-only 2>&1 | ForEach-Object { Write-Host $_ }
  if ($LASTEXITCODE -ne 0) { $Problems.Add("Live-agent adapter contracts failed") }
}

$ContextGraphScript = Join-Path $Root "automation\build-context-graph.ps1"
if (-not (Test-Path $ContextGraphScript)) {
  $Problems.Add("Missing context graph builder: automation/build-context-graph.ps1")
}
$ContextGraphSchema = Join-Path $Root "automation\context-graph.schema.json"
if (-not (Test-Path $ContextGraphSchema)) {
  $Problems.Add("Missing context graph schema: automation/context-graph.schema.json")
}
$ContextGraphPath = Join-Path $Root "05-generated\context-graph.json"
if (Test-Path $ContextGraphPath) {
  try {
    $ContextGraph = Get-Content -Raw -Encoding UTF8 $ContextGraphPath | ConvertFrom-Json
    if ([int]$ContextGraph.version -lt 2 -or @($ContextGraph.nodes).Count -lt $Slugs.Count) {
      $Problems.Add("Context graph is incomplete: expected skill/project nodes")
    }
    $GraphIds = @($ContextGraph.nodes | ForEach-Object { [string]$_.id })
    foreach ($Node in @($ContextGraph.nodes)) {
      if (-not $Node.id -or -not $Node.source -or -not $Node.load_policy -or -not $Node.owner -or -not $Node.routing -or -not $Node.source_hash) {
        $Problems.Add("Context graph node missing id/source/load_policy/owner/routing/source_hash")
        break
      }
      $RoutingProperties = @($Node.routing.PSObject.Properties.Name)
      if (("signals", "excludes", "priority", "loads" | Where-Object { $RoutingProperties -notcontains $_ }).Count -gt 0) {
        $Problems.Add("Context graph node has incomplete routing metadata: $($Node.id)")
        break
      }
      foreach ($EdgeName in @("requires", "supports")) {
        foreach ($Edge in @($Node.routing.$EdgeName | Where-Object { $_ })) {
          if ($GraphIds -notcontains ("skill:$Edge")) {
            $Problems.Add("Context graph node '$($Node.id)' has missing $EdgeName target '$Edge'")
          }
        }
      }
    }
    if (($GraphIds | Sort-Object -Unique).Count -ne $GraphIds.Count) {
      $Problems.Add("Context graph contains duplicate node ids")
    }
    $SourceGroups = @($ContextGraph.nodes | Group-Object source | Where-Object { @($_.Group | Select-Object -ExpandProperty owner -Unique).Count -gt 1 })
    if ($SourceGroups.Count -gt 0) {
      $Problems.Add("Context graph contains conflicting owners for sources: $($SourceGroups.Name -join ', ')")
    }
  } catch {
    $Problems.Add("Context graph invalid JSON: $ContextGraphPath")
  }
}
$Researcher = Get-Content -Raw -Encoding UTF8 (Join-Path $Root "skills\researcher\SKILL.md")
if ($Researcher -match "when Codex needs") {
  $Problems.Add("skills/researcher/SKILL.md must be platform-neutral (not 'when Codex needs')")
}
$CleanCode = Get-Content -Raw -Encoding UTF8 (Join-Path $Root "skills\clean-code\SKILL.md")
if ($CleanCode -match '"review code"' -or $CleanCode -match 'Trigger on.*"review code"') {
  $Problems.Add("skills/clean-code must not claim generic 'review code' (belongs to code-review)")
}
$KnowledgeSystem = Get-Content -Raw -Encoding UTF8 (Join-Path $Root "guides\02-knowledge-system.md")
if (
  $KnowledgeSystem -notlike "*routing*" -or
  $KnowledgeSystem -notlike "*Boundary*" -or
  $KnowledgeSystem -notlike "*small/medium/large/resumable*"
) {
  $Problems.Add("guides/02-knowledge-system.md is out of sync with structured routing and lazy boundaries")
}
if ($Problems.Count) {
  $Problems | ForEach-Object { Write-Error $_ }
  exit 1
}

Write-Host "Context validation PASS"
Write-Host "Core tokens (estimated): $CoreTokens"
Write-Host "Skills: $($Slugs.Count)"
Write-Host "Trigger audit cases: $((Get-Content -Raw $TriggerAuditPath | ConvertFrom-Json).Count)"
