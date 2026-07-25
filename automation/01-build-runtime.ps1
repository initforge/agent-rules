param(
  [string]$Root = (Split-Path -Parent $PSScriptRoot),
  [string]$BuildRoot,
  [switch]$SkipContextGraph
)
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "path-compat.ps1")

if (-not $BuildRoot) { $BuildRoot = Join-Path $Root "05-generated\runtime-build" }
if (Test-Path $BuildRoot) { Remove-Item -LiteralPath $BuildRoot -Recurse -Force }

$Platforms = @("codex", "grok", "antigravity", "cursor")
$PlatformContractPath = Join-Path $Root "platforms\platform-contracts.json"
if (-not (Test-Path -LiteralPath $PlatformContractPath)) { throw "Missing platform contract: $PlatformContractPath" }
try {
  $PlatformContract = Get-Content -Raw -Encoding UTF8 $PlatformContractPath | ConvertFrom-Json
} catch {
  throw "Invalid platform contract JSON: $PlatformContractPath - $_"
}

function Require-ContractProperties {
  param(
    [Parameter(Mandatory = $true)] $Value,
    [Parameter(Mandatory = $true)] [string[]] $Required,
    [Parameter(Mandatory = $true)] [string] $Name
  )
  if ($null -eq $Value) { throw "Platform contract missing $Name" }
  $Actual = @($Value.PSObject.Properties.Name)
  $Missing = @($Required | Where-Object { $Actual -notcontains $_ })
  $Unexpected = @($Actual | Where-Object { $Required -notcontains $_ })
  if ($Missing.Count -or $Unexpected.Count) {
    throw "Platform contract $Name has invalid properties. Missing: $($Missing -join ', '); unexpected: $($Unexpected -join ', ')"
  }
  foreach ($Property in $Required) {
    $RawValue = $Value.$Property
    if ($RawValue -is [string] -and [string]::IsNullOrWhiteSpace($RawValue)) {
      throw "Platform contract $Name.$Property must not be blank"
    }
  }
}

Require-ContractProperties -Value $PlatformContract -Required @("version", "parity_contract", "platforms") -Name "root"
if ([int]$PlatformContract.version -ne 1) { throw "Unsupported platform contract version: $($PlatformContract.version)" }
Require-ContractProperties -Value $PlatformContract.parity_contract -Required @("required_live_invariants", "static_artifacts_are_sufficient", "aggregate_rule") -Name "parity_contract"
$RequiredInvariants = @("activation", "context_delivery", "orchestration", "role_permissions", "model_effort", "mcp_integration")
if ((@($PlatformContract.parity_contract.required_live_invariants | Sort-Object) -join '|') -ne (($RequiredInvariants | Sort-Object) -join '|')) {
  throw "Platform contract required_live_invariants drift"
}
if ($PlatformContract.parity_contract.static_artifacts_are_sufficient -ne $false) { throw "Platform contracts must require live evidence" }
if ($PlatformContract.parity_contract.aggregate_rule -ne "all_platforms_require_current_live_evidence") { throw "Platform contract aggregate evidence rule drift" }
Require-ContractProperties -Value $PlatformContract.platforms -Required $Platforms -Name "platforms"
foreach ($Platform in $Platforms) {
  $Contract = $PlatformContract.platforms.$Platform
  Require-ContractProperties -Value $Contract -Required @("runtime", "bootstrap", "routing", "orchestration", "mcp") -Name "platforms.$Platform"
  Require-ContractProperties -Value $Contract.runtime -Required @("home_env", "home_default", "global_entrypoint") -Name "platforms.$Platform.runtime"
  Require-ContractProperties -Value $Contract.bootstrap -Required @("strategy", "entrypoint", "restart_action") -Name "platforms.$Platform.bootstrap"
  Require-ContractProperties -Value $Contract.routing -Required @("hook_lifecycle", "context_delivery") -Name "platforms.$Platform.routing"
  Require-ContractProperties -Value $Contract.orchestration -Required @("native_spawn_tool", "agent_discovery", "model_attestation", "permission_capability", "isolation_capability") -Name "platforms.$Platform.orchestration"
  Require-ContractProperties -Value $Contract.mcp -Required @("config_path", "format", "native_inspect", "live_doctor") -Name "platforms.$Platform.mcp"
}
$Core = Join-Path $Root "rules"
$SkillsRoot = Join-Path $Root "skills"
$SystemMap = Join-Path $Root "guides"
$ManifestText = Get-Content -Raw -Encoding UTF8 (Join-Path $Core "manifest.yaml")
$ModelPolicy = Get-Content -Raw -Encoding UTF8 (Join-Path $Root "automation\model-policy.json") | ConvertFrom-Json
$ManifestRules = @([regex]::Matches($ManifestText, '(?m)^\s+-\s+(\S+\.md)\s*$') | ForEach-Object { $_.Groups[1].Value })
$GeneratedCoreImports = ($ManifestRules | ForEach-Object { "@__CODEX_HOME__/rules/$($_)" }) -join "`n"
$UserHome = if ($env:USERPROFILE) { $env:USERPROFILE } elseif ($env:HOME) { $env:HOME } else { throw "Cannot resolve user home directory" }
$CodexHome = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $UserHome ".codex" }
$ContextGraphScript = Join-Path $PSScriptRoot "build-context-graph.ps1"
$ContextGraphPath = Join-Path $Root "05-generated\context-graph.json"
if (-not $SkipContextGraph -and (Test-Path -LiteralPath $ContextGraphScript)) {
  & $ContextGraphScript -Root $Root -OutputPath $ContextGraphPath
}

foreach ($Platform in $Platforms) {
  $Target = Join-Path $BuildRoot $Platform
  $Rules = Join-Path $Target "rules"
  $Skills = Join-Path $Target "skills"
  $Scripts = Join-Path $Target "scripts"
  $Docs = Join-Path $Target "docs"
  $Native = Join-Path $Target "native"
  $Tools = Join-Path $Target "agent-rules-tools"
  New-Item -ItemType Directory -Force -Path $Rules, $Skills, $Scripts, $Docs, $Native, $Tools | Out-Null

  $RuntimeContract = [ordered]@{
    version = 1
    platform = $Platform
    source = "platforms/platform-contracts.json"
    contract = $PlatformContract.platforms.$Platform
  }
  $RuntimeContract | ConvertTo-Json -Depth 8 | Set-Content -Encoding UTF8 (Join-Path $Target "runtime-contract.json")

  # Portable orchestration must be available outside this repository after install.
  foreach ($ToolName in @("workctl.py", "workctl.ps1", "workctl.sh", "work-ledger.schema.json")) {
    $ToolPath = Join-Path $Root "automation\$ToolName"
    if (-not (Test-Path -LiteralPath $ToolPath)) { throw "Missing portable tool: $ToolPath" }
    Copy-Item -LiteralPath $ToolPath -Destination (Join-Path $Tools $ToolName) -Force
  }
  $PolicyPath = Join-Path $Root "automation\model-policy.json"
  if (-not (Test-Path -LiteralPath $PolicyPath)) { throw "Missing model policy: $PolicyPath" }
  Copy-Item -LiteralPath $PolicyPath -Destination (Join-Path $Target "model-policy.json") -Force

  # Native definitions are source templates. Model selectors deliberately live
  # only in model-policy.json and are rendered into host-native definitions here.
  switch ($Platform) {
    "codex" {
      Copy-Item -LiteralPath (Join-Path $Root "platforms\codex\agents") -Destination (Join-Path $Native "agents") -Recurse -Force
      Remove-Item -LiteralPath (Join-Path $Native "agents\README.md") -Force -ErrorAction SilentlyContinue
    }
    "cursor" {
      Copy-Item -LiteralPath (Join-Path $Root "platforms\cursor\agents") -Destination (Join-Path $Native "agents") -Recurse -Force
      Remove-Item -LiteralPath (Join-Path $Native "agents\README.md") -Force -ErrorAction SilentlyContinue
    }
    "grok" {
      Copy-Item -LiteralPath (Join-Path $Root "platforms\grok\agents") -Destination (Join-Path $Native "agents") -Recurse -Force
      Copy-Item -LiteralPath (Join-Path $Root "platforms\grok\personas") -Destination (Join-Path $Native "personas") -Recurse -Force
    }
    "antigravity" {
      Copy-Item -LiteralPath (Join-Path $Root "platforms\antigravity\agents") -Destination (Join-Path $Native "agents") -Recurse -Force
      Remove-Item -LiteralPath (Join-Path $Native "agents\README.md") -Force -ErrorAction SilentlyContinue
    }
  }

  $NativeTokens = @{
    "__CODEX_STANDARD_MODEL__" = $ModelPolicy.platforms.codex.standard.selector
    "__CODEX_STANDARD_EFFORT__" = $ModelPolicy.platforms.codex.standard.effort
    "__CURSOR_IMPLEMENTATION_MODEL__" = $ModelPolicy.platforms.cursor.implementation.selector
    "__CURSOR_RESEARCH_REVIEW_MODEL__" = $ModelPolicy.platforms.cursor.research_review.selector
    "__GROK_BASE_MODEL__" = $ModelPolicy.platforms.grok.base.selector
    "__GROK_MINIMUM_EFFORT__" = $ModelPolicy.platforms.grok.minimum_effort
  }
  Get-ChildItem -LiteralPath $Native -Recurse -File | ForEach-Object {
    $Content = Get-Content -Raw -Encoding UTF8 $_.FullName
    foreach ($Token in $NativeTokens.Keys) { $Content = $Content.Replace($Token, [string]$NativeTokens[$Token]) }
    [System.IO.File]::WriteAllText($_.FullName, $Content, [System.Text.UTF8Encoding]::new($false))
  }

  $SharedScripts = Join-Path $Root "platforms\shared\scripts"
  if (Test-Path -LiteralPath $SharedScripts) {
    Get-ChildItem -LiteralPath $SharedScripts -File -Filter "*.py" | ForEach-Object {
      Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $Scripts $_.Name) -Force
    }
  }

  if (Test-Path -LiteralPath $ContextGraphPath) {
    Copy-Item -LiteralPath $ContextGraphPath -Destination (Join-Path $Target "context-graph.json") -Force
  }
  foreach ($RouteContract in @("context-route-cases.json", "context-route-cases.schema.json", "efficiency-policy.json")) {
    $RouteContractPath = Join-Path $Root "automation\$RouteContract"
    if (Test-Path -LiteralPath $RouteContractPath) {
      Copy-Item -LiteralPath $RouteContractPath -Destination (Join-Path $Target $RouteContract) -Force
    }
  }

  $PlatformAgents = Join-Path $Root "platforms\$Platform\AGENTS.md"
  if (Test-Path $PlatformAgents) {
    $AgentsBody = Get-Content -Raw -Encoding UTF8 $PlatformAgents
    if ($Platform -eq "codex") {
      $AgentsBody = $AgentsBody.Replace("@__GENERATED_CORE_IMPORTS__", $GeneratedCoreImports)
      $AgentsBody = $AgentsBody.Replace("__CODEX_HOME__", $CodexHome.Replace('\', '/'))
      $AgentsBody = $AgentsBody.Replace("__AGENT_RULES_ROOT__", $Root.Replace('\', '/'))
    }
    [System.IO.File]::WriteAllText((Join-Path $Target "AGENTS.md"), $AgentsBody)
  }

  Get-ChildItem $Core -File -Filter "*.md" | Where-Object { $_.Name -ne "README.md" } | ForEach-Object {
    Copy-Item $_.FullName (Join-Path $Rules $_.Name)
  }

  $CoreManifest = Join-Path $Core "manifest.yaml"
  if (Test-Path $CoreManifest) {
    Copy-Item $CoreManifest (Join-Path $Rules "manifest.yaml")
  }

  $Overlay = Join-Path $Root "platforms\$Platform\$Platform-overlay.md"
  if (Test-Path $Overlay) {
    Copy-Item $Overlay (Join-Path $Rules "$Platform-overlay.md")
  }

  Get-ChildItem $SkillsRoot -Directory | ForEach-Object {
    $SkillFile = Join-Path $_.FullName "SKILL.md"
    if (-not (Test-Path $SkillFile)) { return }
    $Slug = $_.Name
    $Dest = Join-Path $Skills $Slug
    Copy-Item -LiteralPath $_.FullName -Destination $Dest -Recurse
  }

  Copy-Item -Path (Join-Path $SystemMap "*") -Destination (Join-Path $Target "docs") -Recurse -Force

  $ManifestItems = Get-ChildItem $Target -Recurse -File | Sort-Object FullName | ForEach-Object {
    [pscustomobject]@{
      Path = $_.FullName.Substring($Target.Length + 1).Replace('\', '/')
      Sha256 = (Get-FileHash $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    }
  }

  $Inventory = [pscustomobject]@{
    version = 1
    platform = $Platform
    generatedFrom = [pscustomobject]@{
      docs = "guides"
      core = "rules"
      skills = "skills"
      overlays = "platforms/$Platform"
      platform_contract = "platforms/platform-contracts.json"
    }
    files = $ManifestItems
  }

  $Inventory | ConvertTo-Json -Depth 5 | Set-Content -Encoding UTF8 (Join-Path $Target "manifest.json")
}

Write-Host "Runtime builds created: $BuildRoot"
