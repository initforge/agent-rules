# Regression guards for dual-tree, BOM, glossary, intentional-oversize - drives shipped validate.
param([string]$Root = (Split-Path -Parent $PSScriptRoot))
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "path-compat.ps1")
$Failed = 0

function Assert-True([bool]$Cond, [string]$Msg) {
  if (-not $Cond) { Write-Host "FAIL: $Msg"; $script:Failed++ } else { Write-Host "OK: $Msg" }
}

# 1) Drive real validate-context entrypoint
& (Join-Path $PSScriptRoot "03-validate-context.ps1")
Assert-True ($LASTEXITCODE -eq 0) "03-validate-context.ps1 exit 0"

# 2) docs-style BOM - read real file bytes
$Docs = Join-Path $Root "skills\docs-style\SKILL.md"
$Bytes = [System.IO.File]::ReadAllBytes($Docs)
$NoBom = -not ($Bytes.Length -ge 3 -and $Bytes[0] -eq 0xEF -and $Bytes[1] -eq 0xBB -and $Bytes[2] -eq 0xBF)
Assert-True $NoBom "docs-style SKILL.md has no UTF-8 BOM"

# 3) Canonical rules must not contain legacy dual-tree filenames
foreach ($L in @("00-index.md","01-agent-workflow-sop.md","07-finish-to-completion.md")) {
  Assert-True (-not (Test-Path (Join-Path $Root "rules\$L"))) "no legacy $L in rules/"
}

# 4) Intentional oversize list exists in budget rule
$Budget = Get-Content -Raw -Encoding UTF8 (Join-Path $Root "rules\50-context-budget.md")
Assert-True ($Budget -like "*docs-style*" -and $Budget -like "*plan-and-handoff*" -and $Budget -like "*Intentional oversize*") "intentional oversize documented"

# 5) No deprecated lifecycle labels ("lane normal", "lane high-risk") in rules/ or skills/
foreach ($File in @(Get-ChildItem (Join-Path $Root "rules") -Filter "*.md"; Get-ChildItem (Join-Path $Root "skills") -Recurse -Filter "*.md")) {
  $Body = Get-Content -Raw -Encoding UTF8 $File.FullName 2>$null
  if ($Body -and ($Body -match "\*\*Lane\s+`[nN]ormal`\*\*" -or $Body -match "\*\*Lane\s+`[hH]igh-risk`\*\*")) {
    Assert-True $false "Deprecated lifecycle label 'lane normal/high-risk' found in $($File.FullName)"
  }
}

# 6) No duplicate integrations/ directories by name normalization (hyphen vs underscore check)
$IntegrationDirs = Get-ChildItem (Join-Path $Root "integrations") -Directory
$IntegrationNorm = @{}
foreach ($Dir in $IntegrationDirs) {
  $Norm = $Dir.Name -replace '[_\-]', '-'
  if ($IntegrationNorm.ContainsKey($Norm)) { Assert-True $false "Duplicate integrations/ directory name '$($Dir.Name)' (conflicts with '$($IntegrationNorm[$Norm])')" }
  else { $IntegrationNorm[$Norm] = $Dir.Name }
}

# 7) No stale codebase_memory underscore directory
Assert-True (-not (Test-Path (Join-Path $Root "integrations\codebase_memory"))) "stale integrations/codebase_memory/ directory removed"

# 8) No stale runtime.yaml references in root READMEs
$ReadmeEn = Get-Content -Raw -Encoding UTF8 (Join-Path $Root "README.md")
Assert-True ($ReadmeEn -notlike "*runtime.yaml*") "README.md has no runtime.yaml reference"
$ReadmeVi = Get-Content -Raw -Encoding UTF8 (Join-Path $Root "README-vi.md")
Assert-True ($ReadmeVi -notlike "*runtime.yaml*") "README-vi.md has no runtime.yaml reference"

# 9) Budget key names: context-route-cases.json must not have legacy 'core_tokens' key, must have 'core_routing_tokens'
$RouteCases = Get-Content -Raw -Encoding UTF8 (Join-Path $Root "automation\context-route-cases.json") | ConvertFrom-Json
$BudgetKeys = @($RouteCases.budgets.PSObject.Properties.Name)
Assert-True ($BudgetKeys -notcontains "core_tokens") "context-route-cases.json budget key 'core_tokens' removed"
Assert-True ($BudgetKeys -contains "core_routing_tokens") "context-route-cases.json budget key 'core_routing_tokens' present"

# 10) Grok overlay documents inject path
$GrokOv = Get-Content -Raw -Encoding UTF8 (Join-Path $Root "platforms\grok\grok-overlay.md")
Assert-True ($GrokOv -like "*.grok/rules*" -or $GrokOv -like "*.grok\\rules*") "grok-overlay documents inject path"

# 11) Codex TOML adapter merge must be idempotent and preserve array values.
. (Join-Path $PSScriptRoot "Merge-Mcp-Adapters.ps1")
$MergeTemp = Join-Path ([IO.Path]::GetTempPath()) ("agent-rules-mcp-" + [guid]::NewGuid().ToString("N") + ".toml")
try {
  [IO.File]::WriteAllText($MergeTemp, "model = 'test'`n`n[mcp_servers.playwright]`ncommand = 'old'`nargs = ['old']`nstartup_timeout_sec = 5`n")
  $Adapter = Join-Path $Root "integrations\recommended\playwright-mcp\adapters\codex.toml"
  Merge-CodexTomlAdapters -ConfigPath $MergeTemp -AdapterPaths @($Adapter) | Out-Null
  $Once = Get-Content -Raw $MergeTemp
  Merge-CodexTomlAdapters -ConfigPath $MergeTemp -AdapterPaths @($Adapter) | Out-Null
  $Twice = Get-Content -Raw $MergeTemp
  $SectionCount = ([regex]::Matches($Twice, '(?m)^\[mcp_servers\.playwright\]\r?$')).Count
  $BareArray = $Twice -match '(?m)^\s*\[''-y'''
  Assert-True ($Once -eq $Twice -and $SectionCount -eq 1 -and -not $BareArray) "Codex MCP TOML merge is idempotent"
} finally {
  Remove-Item -LiteralPath $MergeTemp -Force -ErrorAction SilentlyContinue
}

# 12) No stale "zero main-agent domain work" pattern in lifecycle or protocol
$Lifecycle = Get-Content -Raw -Encoding UTF8 (Join-Path $Root "rules\25-task-lifecycle.md")
Assert-True ($Lifecycle -notlike "*zero main-agent domain work*") "25-task-lifecycle.md: no 'zero main-agent domain work'"
$Protocol = Get-Content -Raw -Encoding UTF8 (Join-Path $Root "skills\plan-and-handoff\references\adaptive-work-protocol.md")
Assert-True ($Protocol -notlike "*zero main-agent domain work*") "adaptive-work-protocol.md: no 'zero main-agent domain work'"
$Ftc = Get-Content -Raw -Encoding UTF8 (Join-Path $Root "skills\finish-to-completion\SKILL.md")
Assert-True ($Ftc -notlike "*zero main-agent domain work*") "finish-to-completion/SKILL.md: no 'zero main-agent domain work'"

# 13) Required role definitions in lifecycle rule
Assert-True ($Lifecycle -match "Coordinator") "25-task-lifecycle.md: defines Coordinator role"
Assert-True ($Lifecycle -match "Architect/integrator") "25-task-lifecycle.md: defines Architect/integrator role"
Assert-True ($Lifecycle -match "Implementer") "25-task-lifecycle.md: defines Implementer role"
Assert-True ($Lifecycle -match "Reviewer") "25-task-lifecycle.md: defines Reviewer role"
Assert-True ($Lifecycle -match "Verifier") "25-task-lifecycle.md: defines Verifier role"

# 14) Required delegation receipts documented in lifecycle
Assert-True ($Lifecycle -match "subagent_requested") "25-task-lifecycle.md: subagent_requested receipt"
Assert-True ($Lifecycle -match "subagent_resolved") "25-task-lifecycle.md: subagent_resolved receipt"
Assert-True ($Lifecycle -match "subagent_started") "25-task-lifecycle.md: subagent_started receipt"
Assert-True ($Lifecycle -match "subagent_completed") "25-task-lifecycle.md: subagent_completed receipt"
Assert-True ($Lifecycle -match "result_consumed") "25-task-lifecycle.md: result_consumed receipt"
Assert-True ($Lifecycle -match "result_rejected") "25-task-lifecycle.md: result_rejected receipt"
Assert-True ($Lifecycle -match "delegation_skipped") "25-task-lifecycle.md: delegation_skipped receipt"

if ($Failed -gt 0) {
  Write-Error "Regression guards failed: $Failed"
  exit 1
}
Write-Host "Regression harness guards PASS"
