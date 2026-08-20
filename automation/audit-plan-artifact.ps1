param(
  [string]$Root = (Split-Path -Parent $PSScriptRoot),
  [string]$PlanPath = ""
)
$ErrorActionPreference = "Stop"

$Problems = [System.Collections.Generic.List[string]]::new()

function Test-Contains {
  param([string]$RelativePath, [string[]]$Patterns)
  $Path = Join-Path $Root $RelativePath
  if (-not (Test-Path -LiteralPath $Path)) {
    $Problems.Add("Missing file: $RelativePath")
    return
  }
  $Body = Get-Content -Raw -Encoding UTF8 -LiteralPath $Path
  foreach ($Pattern in $Patterns) {
    if ($Body -notmatch $Pattern) {
      $Problems.Add("$RelativePath missing contract pattern: $Pattern")
    }
  }
}

Test-Contains "skills\plan-and-handoff\SKILL.md" @(
  "executable intent contract",
  "Ask only a question",
  "risk-triggered independent reviewer",
  "Source coverage",
  "automatically classify and begin execution",
  "portable-plan-contract"
)
Test-Contains "skills\plan-and-handoff\references\adaptive-work-protocol.md" @(
  "Small",
  "Standard",
  "Resumable",
  "Context capsule",
  "main agent",
  "economy",
  "standard",
  "expert",
  "acknowledgment",
  "semantic budgets",
  "subagent_requested",
  "subagent_completed",
  "Independent review is mandatory"
)
Test-Contains "skills\plan-and-handoff\references\portable-plan-contract.md" @(
  "small",
  "standard",
  "resumable",
  "acceptance",
  "execution_contract",
  "requirements",
  "decisions",
  "change_graph",
  "verification_matrix",
  "task_graph",
  "amendments",
  "checkpoints",
  "evidence_ledger",
  "supersedes",
  "fact",
  "assumption",
  "unknown",
  "user_decision"
)
Test-Contains "skills\finish-to-completion\references\completion-ledger.md" @(
  "workctl.py",
  "source requirement",
  "per-assignment usage",
  "Self-reported PASS",
  "semantic",
  "pending",
  "acknowledged"
)
Test-Contains "automation\workctl.py" @(
  "def classify",
  "active_slices",
  "acceptance_contract_hash",
  "command_verify",
  "independent PASS review",
  "command_resume",
  "command_finalize"
)
Test-Contains "automation\work-ledger.schema.json" @(
  '"schema_version"',
  '"source_history"',
  '"assignments"',
  '"reviews"',
  '"artifact_evidence"',
  '"usageRecord"'
)
Test-Contains "rules\25-task-lifecycle.md" @(
  "Assign clear roles",
  "Coordinator",
  "Architect/integrator",
  "Implementer",
  "Reviewer",
  "Verifier",
  "Researcher/utility",
  "Delegate when it adds value",
  "stable boundary",
  "clear ACs",
  "non-overlapping writes",
  "sufficient context",
  "meaningful parallelism",
  "Record what you delegated",
  "delegated",
  "outcome"
)
Test-Contains "skills\plan-and-handoff\references\adaptive-work-protocol.md" @(
  "Coordinator",
  "Architect/integrator",
  "Implementer",
  "Researcher/utility",
  "Reviewer",
  "Verifier",
  "stable boundary",
  "non-overlapping write ownership",
  "meaningful benefit",
  "subagent_requested",
  "subagent_resolved",
  "subagent_started",
  "subagent_completed",
  "result_consumed",
  "result_rejected",
  "delegation_skipped"
)

foreach ($Required in @(
  "automation\test-workctl.py",
  "skills\plan-and-handoff\references\capability-tier-routing.md"
)) {
  if (-not (Test-Path -LiteralPath (Join-Path $Root $Required))) {
    $Problems.Add("Missing executable-plan component: $Required")
  }
}

if ($PlanPath) {
  if (-not (Test-Path -LiteralPath $PlanPath)) {
    $Problems.Add("Plan file not found: $PlanPath")
  } else {
    $Plan = Get-Content -Raw -Encoding UTF8 -LiteralPath $PlanPath
    foreach ($Pattern in @(
      "Outcome|Kết quả",
      "scope|phạm vi",
      "Acceptance|nghiệm thu",
      "proof|bằng chứng|verify",
      "rollback|khôi phục",
      "file|interface|API|schema|entity"
    )) {
      if ($Plan -notmatch $Pattern) {
        $Problems.Add("Plan lacks executable detail: $Pattern")
      }
    }
  }
}

if ($Problems.Count -gt 0) {
  $Problems | ForEach-Object { Write-Host "FAIL: $_" }
  exit 1
}

Write-Host "PASS: adaptive executable-plan audit$(if ($PlanPath) { ' + plan file' })"
