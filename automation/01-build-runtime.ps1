param(
  [string]$Root = (Split-Path -Parent $PSScriptRoot),
  [string]$BuildRoot = (Join-Path $Root "generated\runtime-build"),
  [switch]$SkipContextGraph
)
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "path-compat.ps1")
if (Test-Path $BuildRoot) { Remove-Item -LiteralPath $BuildRoot -Recurse -Force }

$Core = Join-Path $Root "rules"
$ManifestText = Get-Content -Raw -Encoding UTF8 (Join-Path $Core "manifest.yaml")
$PlatformContracts = Get-Content -Raw -Encoding UTF8 (Join-Path $Root "platforms\platform-contracts.json") | ConvertFrom-Json
$Platforms = @($PlatformContracts.native_contracts.PSObject.Properties.Name)
$ManifestRules = @([regex]::Matches($ManifestText, '(?m)^\s+-\s+(\S+\.md)\s*$') | ForEach-Object { $_.Groups[1].Value })
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
  New-Item -ItemType Directory -Force -Path $Rules | Out-Null
  if (-not ($PlatformContracts.native_contracts.PSObject.Properties.Name -contains $Platform)) { throw "Missing platform contract: $Platform" }
  [pscustomobject]@{ version = 1; platform = $Platform; source = "platforms/platform-contracts.json"; contract = $PlatformContracts.native_contracts.$Platform } |
    ConvertTo-Json -Depth 10 | ForEach-Object { [System.IO.File]::WriteAllText((Join-Path $Target "runtime-contract.json"), $_, [System.Text.UTF8Encoding]::new($false)) }

  # The running host/session owns model and agent selection. The portable
  # runtime installs rules, skills and host adapters only; it never creates a
  # role zoo or model-routing policy.

  $PlatformAgents = Join-Path $Root "platforms\$Platform\AGENTS.md"
  if (Test-Path $PlatformAgents) {
    $AgentsBody = Get-Content -Raw -Encoding UTF8 $PlatformAgents
    $PlatformHomeToken = switch ($Platform) {
      "codex"    { "__CODEX_HOME__" }
      "claude"   { "__CLAUDE_HOME__" }
      default    { $null }
    }
    $ResolvedHome = switch ($Platform) {
      "codex"    { "." }
      "claude"   { "." }
      default    { $null }
    }
    if ($PlatformHomeToken) {
      $PlatformImports = ($ManifestRules | ForEach-Object { "@$PlatformHomeToken/rules/$($_)" }) -join "`n"
      $AgentsBody = $AgentsBody.Replace("@__GENERATED_CORE_IMPORTS__", $PlatformImports)
      if ($ResolvedHome) { $AgentsBody = $AgentsBody.Replace($PlatformHomeToken, $ResolvedHome) }
    }
    $AgentsBody = $AgentsBody.Replace("__AGENT_RULES_ROOT__", ".")
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

  # Skills are packaged once at runtime-assets/skills and projected by the
  # native installer. Per-host runtime builds contain only host activation and
  # canonical rules, avoiding nine duplicate skill trees.

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
      core = "rules"
      overlays = "platforms/$Platform"
    }
    files = $ManifestItems
  }

  # Use explicit UTF8-without-BOM so generated JSON is consistent across PowerShell versions
  $Inventory | ConvertTo-Json -Depth 5 | ForEach-Object { [System.IO.File]::WriteAllText((Join-Path $Target "manifest.json"), $_, [System.Text.UTF8Encoding]::new($false)) }
}

Write-Host "Runtime builds created: $BuildRoot"
