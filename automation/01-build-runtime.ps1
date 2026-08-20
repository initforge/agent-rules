param(
  [string]$Root = (Split-Path -Parent $PSScriptRoot),
  [string]$BuildRoot = (Join-Path $Root "generated\runtime-build"),
  [switch]$SkipContextGraph
)
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "path-compat.ps1")
if (Test-Path $BuildRoot) { Remove-Item -LiteralPath $BuildRoot -Recurse -Force }

$Core = Join-Path $Root "rules"
$SkillsRoot = Join-Path $Root "skills"
$SystemMap = Join-Path $Root "docs\guides"
$ManifestText = Get-Content -Raw -Encoding UTF8 (Join-Path $Core "manifest.yaml")
$ModelPolicy = Get-Content -Raw -Encoding UTF8 (Join-Path $Root "automation\model-policy.json") | ConvertFrom-Json
$PlatformContracts = Get-Content -Raw -Encoding UTF8 (Join-Path $Root "platforms\platform-contracts.json") | ConvertFrom-Json
$Platforms = @($PlatformContracts.platforms.PSObject.Properties.Name)
$ManifestRules = @([regex]::Matches($ManifestText, '(?m)^\s+-\s+(\S+\.md)\s*$') | ForEach-Object { $_.Groups[1].Value })
$UserHome = if ($env:USERPROFILE) { $env:USERPROFILE } elseif ($env:HOME) { $env:HOME } else { throw "Cannot resolve user home directory" }
$CodexHome = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $UserHome ".codex" }
$ContextGraphPath = Join-Path $Root "generated\context-graph.json"
if (-not $SkipContextGraph) {
  $ContextGraphScript = Join-Path $PSScriptRoot "build-context-graph.ps1"
  if (Test-Path -LiteralPath $ContextGraphScript) {
    & $ContextGraphScript -Root $Root -OutputPath $ContextGraphPath
  }
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
  if (-not ($PlatformContracts.platforms.PSObject.Properties.Name -contains $Platform)) { throw "Missing platform contract: $Platform" }
  [pscustomobject]@{ version = 1; platform = $Platform; source = "platforms/platform-contracts.json"; contract = $PlatformContracts.platforms.$Platform } |
    ConvertTo-Json -Depth 10 | ForEach-Object { [System.IO.File]::WriteAllText((Join-Path $Target "runtime-contract.json"), $_, [System.Text.UTF8Encoding]::new($false)) }

  # Portable orchestration must be available outside this repository after install.
  foreach ($ToolName in @("workctl.py", "workctl.ps1", "workctl.sh", "work-ledger.schema.json")) {
    $ToolPath = Join-Path $Root "automation\$ToolName"
    if (-not (Test-Path -LiteralPath $ToolPath)) { throw "Missing portable tool: $ToolPath" }
    Copy-Item -LiteralPath $ToolPath -Destination (Join-Path $Tools $ToolName) -Force
  }
  $PolicyPath = Join-Path $Root "automation\model-policy.json"
  if (-not (Test-Path -LiteralPath $PolicyPath)) { throw "Missing model policy: $PolicyPath" }
  Copy-Item -LiteralPath $PolicyPath -Destination (Join-Path $Target "model-policy.json") -Force

  # Native definitions are source templates. Whether an agents directory is
  # materialized is part of the canonical platform contract; host-native
  # platforms keep their own workflow/agent surface.
  $AgentMaterialization = [string]$PlatformContracts.platforms.$Platform.orchestration.agent_materialization
  if ($AgentMaterialization -eq "managed_directory") {
    $AgentSource = Join-Path $Root "platforms\$Platform\agents"
    if (-not (Test-Path -LiteralPath $AgentSource)) { throw "Missing managed agent definitions for $Platform" }
    Copy-Item -LiteralPath $AgentSource -Destination (Join-Path $Native "agents") -Recurse -Force
    Remove-Item -LiteralPath (Join-Path $Native "agents\README.md") -Force -ErrorAction SilentlyContinue
  } elseif ($AgentMaterialization -ne "host_native") {
    throw "Unknown agent materialization policy for ${Platform}: $AgentMaterialization"
  }
  if ($Platform -eq "grok") {
    $Personas = Join-Path $Root "platforms\grok\personas"
    if (Test-Path -LiteralPath $Personas) { Copy-Item -LiteralPath $Personas -Destination (Join-Path $Native "personas") -Recurse -Force }
  }

  $NativeTokens = @{
    "__CODEX_STANDARD_MODEL__" = $ModelPolicy.platforms.codex.adapter_defaults.model_selectors.standard.selector
    "__CODEX_STANDARD_EFFORT__" = $ModelPolicy.platforms.codex.adapter_defaults.model_selectors.standard.effort
    "__CURSOR_IMPLEMENTATION_MODEL__" = $ModelPolicy.platforms.cursor.adapter_defaults.model_selectors.implementation.selector
    "__CURSOR_RESEARCH_REVIEW_MODEL__" = $ModelPolicy.platforms.cursor.adapter_defaults.model_selectors.research_review.selector
    "__GROK_BASE_MODEL__" = $ModelPolicy.platforms.grok.adapter_defaults.model_selectors.base.selector
    "__GROK_MINIMUM_EFFORT__" = $ModelPolicy.platforms.grok.adapter_defaults.model_selectors.base.effort
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
    $PlatformHomeToken = switch ($Platform) {
      "codex"    { "__CODEX_HOME__" }
      "claude"   { "__CLAUDE_HOME__" }
      default    { $null }
    }
    $ResolvedHome = switch ($Platform) {
      "codex"    { $CodexHome.Replace('\', '/') }
      "claude"   { "`$CLAUDE_CONFIG_DIR" }
      default    { $null }
    }
    if ($PlatformHomeToken) {
      $PlatformImports = ($ManifestRules | ForEach-Object { "@$PlatformHomeToken/rules/$($_)" }) -join "`n"
      $AgentsBody = $AgentsBody.Replace("@__GENERATED_CORE_IMPORTS__", $PlatformImports)
      if ($ResolvedHome) { $AgentsBody = $AgentsBody.Replace($PlatformHomeToken, $ResolvedHome) }
    }
    $AgentsBody = $AgentsBody.Replace("__AGENT_RULES_ROOT__", $Root.Replace('\', '/'))
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

  # Profile-owned skills are excluded from public build (loaded via profiles/ mechanism)
$ProfileSkillPrefixes = @("5fedu-")
Get-ChildItem $SkillsRoot -Directory | ForEach-Object {
    $Skip = $false
    foreach ($Prefix in $ProfileSkillPrefixes) { if ($_.Name -like "$Prefix*") { $Skip = $true; break } }
    if ($Skip) { Write-Host "Skipping profile-owned skill: $($_.Name)"; return }
    $SkillFile = Join-Path $_.FullName "SKILL.md"
    if (-not (Test-Path $SkillFile)) { return }
    $Slug = $_.Name
    $Dest = Join-Path $Skills $Slug
    Copy-Item -LiteralPath $_.FullName -Destination $Dest -Recurse
  }

  Copy-Item -Path (Join-Path $SystemMap "*") -Destination (Join-Path $Target "docs") -Recurse -Force

  # Use Ordinal comparison for deterministic ordering across Windows locales
  $ManifestItems = Get-ChildItem $Target -Recurse -File | Sort-Object { $_.FullName } -Culture en-US | ForEach-Object {
    [pscustomobject]@{
      path = $_.FullName.Substring($Target.Length + 1).Replace('\', '/')
      sha256 = (Get-FileHash $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    }
  }

  $Inventory = [pscustomobject]@{
    version = 1
    platform = $Platform
    generated_from = [pscustomobject]@{
      docs = "docs/guides"
      core = "rules"
      skills = "skills"
      overlays = "platforms/$Platform"
    }
    files = $ManifestItems
  }

  # Use explicit UTF8-without-BOM so generated JSON is consistent across PowerShell versions
  $Inventory | ConvertTo-Json -Depth 5 | ForEach-Object { [System.IO.File]::WriteAllText((Join-Path $Target "manifest.json"), $_, [System.Text.UTF8Encoding]::new($false)) }
}

Write-Host "Runtime builds created: $BuildRoot"
