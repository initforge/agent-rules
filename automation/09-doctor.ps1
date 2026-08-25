param(
  [string]$Root = (Split-Path -Parent $PSScriptRoot),
  [ValidateSet("codex","claude","grok","antigravity","cursor","all")][string]$Platform = "all",
  [switch]$SkipIntegrationVerify
)
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "path-compat.ps1")

function Assert-ScriptIntegrity {
  param([string]$ScriptPath, [string]$IntegrityManifestPath = (Join-Path $PSScriptRoot "source-integrity.json"))
  if (-not (Test-Path -LiteralPath $ScriptPath -PathType Leaf)) { throw "Script not found: $ScriptPath" }
  $Item = Get-Item -LiteralPath $ScriptPath -Force
  if ($Item.LinkType -in @("SymbolicLink", "HardLink") -or $Item.Target) { throw "Refusing linked script: $ScriptPath" }
  $RootFull = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
  $ScriptFull = [IO.Path]::GetFullPath($ScriptPath)
  if (-not $ScriptFull.StartsWith($RootFull, [StringComparison]::OrdinalIgnoreCase)) { throw "Script escapes repository root: $ScriptPath" }
  $Relative = $ScriptFull.Substring($RootFull.Length).TrimStart([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar).Replace('\', '/')
  $Manifest = Get-Content -Raw -LiteralPath $IntegrityManifestPath | ConvertFrom-Json
  $Expected = [string]$Manifest.files.$Relative
  if (-not $Expected) { throw "No integrity entry for $Relative" }
  $RawBytes = [IO.File]::ReadAllBytes($ScriptPath)
  $CanonicalText = [Text.Encoding]::UTF8.GetString($RawBytes) -replace "`r`n", "`n"
  $Actual = ([Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($CanonicalText)) | ForEach-Object ToString x2) -join ""
  if ($Actual -ne $Expected.ToLowerInvariant()) { throw "Integrity check failed for $Relative" }
}

$UserHome = if ($env:USERPROFILE) { $env:USERPROFILE } elseif ($env:HOME) { $env:HOME } else { throw "Cannot resolve user home" }
$PlatformHomes = @{
  codex = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $UserHome ".codex" }
  claude = if ($env:CLAUDE_CONFIG_DIR) { $env:CLAUDE_CONFIG_DIR } else { Join-Path $UserHome ".claude" }
  grok = if ($env:GROK_HOME) { $env:GROK_HOME } else { Join-Path $UserHome ".grok" }
  antigravity = Join-Path $UserHome ".gemini\config"
  cursor = Join-Path $UserHome ".cursor"
  opencode = Join-Path $UserHome ".config\opencode"
}
$McpConfigPaths = @{
  codex = Join-Path $PlatformHomes["codex"] "config.toml"
  claude = Join-Path $UserHome ".claude.json"
  grok = Join-Path $PlatformHomes["grok"] "mcp.json"
  antigravity = Join-Path $PlatformHomes["antigravity"] "mcp_config.json"
  cursor = Join-Path $PlatformHomes["cursor"] "mcp.json"
  opencode = Join-Path $PlatformHomes["opencode"] "opencode.json"
}
$Selected = if ($Platform -eq "all") { @("codex", "claude", "grok", "antigravity", "cursor", "opencode") } else { @($Platform) }

$Report = @()
$RegistryPath = Join-Path $Root "integrations\registry.json"
$Registry = if (Test-Path $RegistryPath) { Get-Content -Raw $RegistryPath | ConvertFrom-Json } else { $null }
$NativeContractOutput = @(& python (Join-Path $Root "automation\test-native-agent-policy.py") --build 2>&1 | ForEach-Object { "$_" })
$NativeContractOk = $LASTEXITCODE -eq 0

function Test-NativeStructure {
  param([string]$Name, [string]$RuntimeHome, [string]$Root, [bool]$ContractOk)
  $Problems = @()
  if ($Name -eq "claude") { return @() }
  if (-not $ContractOk) { $Problems += "source/build native schema contract failed" }
  $Groups = switch ($Name) {
    "grok" { @(
      [pscustomobject]@{ Build = "native\agents"; Destination = "agents"; Manifest = "agent-rules-native-agents.json" },
      [pscustomobject]@{ Build = "native\personas"; Destination = "personas"; Manifest = "agent-rules-native-personas.json" }
    ) }
    default { @([pscustomobject]@{ Build = "native\agents"; Destination = "agents"; Manifest = "agent-rules-native-agents.json" }) }
  }
  foreach ($Group in $Groups) {
    $BuildDir = Join-Path $Root "generated\runtime-build\$Name\$($Group.Build)"
    $Destination = Join-Path $RuntimeHome $Group.Destination
    $OwnershipManifest = Join-Path $RuntimeHome $Group.Manifest
    if (-not (Test-Path -LiteralPath $BuildDir)) { $Problems += "missing build $($Group.Build)"; continue }
    $ExpectedFiles = @(Get-ChildItem -LiteralPath $BuildDir -Recurse -File)
    $ExpectedRelative = @($ExpectedFiles | ForEach-Object { $_.FullName.Substring($BuildDir.Length + 1).Replace('\', '/') } | Sort-Object)
    if (-not (Test-Path -LiteralPath $OwnershipManifest)) { $Problems += "missing ownership $($Group.Manifest)"; continue }
    try {
      $ParsedOwnership = Get-Content -Raw -LiteralPath $OwnershipManifest | ConvertFrom-Json
      $OwnedItems = if ($ParsedOwnership -is [Array]) {
        @($ParsedOwnership | ForEach-Object { [string]$_ })
      } else {
        @([string]$ParsedOwnership)
      }
      $Owned = @($OwnedItems | Sort-Object)
    } catch { $Problems += "invalid ownership $($Group.Manifest)"; continue }
    if (@(Compare-Object $ExpectedRelative $Owned).Count -gt 0) { $Problems += "ownership mapping drift $($Group.Manifest)"; continue }
    foreach ($Expected in $ExpectedFiles) {
      $ExpectedFullName = [string]$Expected.FullName
      $Relative = $ExpectedFullName.Substring($BuildDir.Length + 1)
      $Installed = Join-Path $Destination $Relative
      if (-not (Test-Path -LiteralPath $Installed -PathType Leaf)) { $Problems += "missing $($Group.Destination)/$($Relative.Replace('\','/'))"; continue }
      if ((Get-FileHash -LiteralPath $Installed -Algorithm SHA256).Hash -ne (Get-FileHash -LiteralPath $ExpectedFullName -Algorithm SHA256).Hash) {
        $Problems += "hash drift $($Group.Destination)/$($Relative.Replace('\','/'))"
      }
    }
  }
  return @($Problems)
}

foreach ($Name in $Selected) {
  $RuntimeHome = $PlatformHomes[$Name]
  $ManifestPath = Join-Path $RuntimeHome "agent-rules-manifest.json"
  if (-not (Test-Path $ManifestPath)) {
    if ($Name -eq "opencode" -and (Test-Path (Join-Path $RuntimeHome "agent-rules-owned.json"))) {
      $Report += [pscustomobject]@{ platform = $Name; check = "runtime-manifest"; status = "ADAPTER_PASS"; detail = "OpenCode adapter ownership manifest is present; native runtime manifest is not required" }
      continue
    }
    $Report += [pscustomobject]@{ platform = $Name; check = "runtime-manifest"; status = "MISSING"; detail = $ManifestPath }
    continue
  }

  $Report += [pscustomobject]@{ platform = $Name; check = "install"; status = "INSTALL_PASS"; detail = "runtime manifest is present; this proves install copy only" }
  $NativeProblems = @(Test-NativeStructure -Name $Name -RuntimeHome $RuntimeHome -Root $Root -ContractOk $NativeContractOk)
  if ($NativeProblems.Count -eq 0) {
    $Report += [pscustomobject]@{ platform = $Name; check = "native-structure"; status = "NATIVE_CAPABLE"; detail = "required native files, ownership mapping, source schema, and build hashes match" }
  } else {
    $Report += [pscustomobject]@{ platform = $Name; check = "native-structure"; status = "NATIVE_PARTIAL"; detail = ($NativeProblems -join "; ") }
  }
  $NativeCli = switch ($Name) { "codex" { "codex" }; "claude" { "claude" }; "cursor" { "cursor" }; "grok" { "grok" }; "antigravity" { "gemini" } }
  $Cli = Get-Command $NativeCli -ErrorAction SilentlyContinue
  $NativeDetail = if ($Cli) { "$NativeCli binary is available, but no trusted host-activation receipt exists" } else { "$NativeCli binary is unavailable; Antigravity host activation is unobserved" }
  $Report += [pscustomobject]@{ platform = $Name; check = "native-activation"; status = "NATIVE_UNVERIFIED"; detail = $NativeDetail }
  $ToolsPath = Join-Path $RuntimeHome "agent-rules-tools"
  $ToolFiles = @("workctl.py", "workctl.ps1", "workctl.sh", "work-ledger.schema.json")
  $ToolsOk = @($ToolFiles | Where-Object { -not (Test-Path -LiteralPath (Join-Path $ToolsPath $_)) }).Count -eq 0
  # A copied workctl bundle proves only capability. Native subagent execution needs
  # a separate trusted host receipt before it can ever be called observed/pass.
  $Report += [pscustomobject]@{ platform = $Name; check = "orchestration"; status = $(if ($ToolsOk) { "ORCHESTRATION_CAPABLE" } else { "ORCHESTRATION_PARTIAL" }); detail = $(if ($ToolsOk) { "portable workctl bundle available; no trusted native subagent receipt" } else { "portable workctl bundle incomplete; no native execution claim" }) }
  $SourcePolicy = Join-Path $Root "automation\model-policy.json"
  $InstalledPolicy = Join-Path $RuntimeHome "model-policy.json"
  $PolicyStatus = if ((Test-Path $SourcePolicy) -and (Test-Path $InstalledPolicy) -and ((Get-FileHash $SourcePolicy -Algorithm SHA256).Hash -eq (Get-FileHash $InstalledPolicy -Algorithm SHA256).Hash)) { "MODEL_POLICY_MATCH" } elseif (Test-Path $InstalledPolicy) { "MODEL_POLICY_DRIFT" } else { "MODEL_POLICY_MISSING" }
  $Report += [pscustomobject]@{ platform = $Name; check = "model-policy-install"; status = $PolicyStatus; detail = "source-to-runtime policy hash only; effective host model remains receipt-gated" }

  $BuildManifest = Join-Path $Root "generated\runtime-build\$Name\manifest.json"
  if (Test-Path $BuildManifest) {
    $Installed = Get-Content -Raw $ManifestPath | ConvertFrom-Json
    $Expected = Get-Content -Raw $BuildManifest | ConvertFrom-Json
    $InstalledPaths = $Installed.files | ForEach-Object { $_.Path } | Sort-Object
    $ExpectedPaths = $Expected.files | ForEach-Object { $_.Path } | Sort-Object
    $Extra = Compare-Object $ExpectedPaths $InstalledPaths | Where-Object SideIndicator -eq "=>"
    $Missing = Compare-Object $ExpectedPaths $InstalledPaths | Where-Object SideIndicator -eq "<="
    if ($Extra) { $Report += [pscustomobject]@{ platform = $Name; check = "stale-files"; status = "WARN"; detail = ($Extra.InputObject -join ", ") } }
    if ($Missing) { $Report += [pscustomobject]@{ platform = $Name; check = "missing-files"; status = "MISSING"; detail = ($Missing.InputObject -join ", ") } }

    $HashMismatch = @()
    $RuntimeMissing = @()
    $RuntimeHashMismatch = @()
    foreach ($Exp in @($Expected.files | Where-Object { $_.Path -notlike "native/*" })) {
      $Ins = $Installed.files | Where-Object Path -EQ $Exp.Path | Select-Object -First 1
      if ($Ins -and $Ins.Sha256 -ne $Exp.Sha256) { $HashMismatch += $Exp.Path }
      $RuntimeRelative = if ($Name -eq "cursor" -and $Exp.Path -like "docs/*") {
        "agent-rules-docs/" + $Exp.Path.Substring(5)
      } elseif ($Name -eq "claude" -and $Exp.Path -eq "AGENTS.md") {
        "CLAUDE.md"
      } else { $Exp.Path }
      $LivePath = Join-Path $RuntimeHome ($RuntimeRelative -replace '/', [IO.Path]::DirectorySeparatorChar)
      if (-not (Test-Path -LiteralPath $LivePath)) {
        $RuntimeMissing += $Exp.Path
      } elseif ((Get-FileHash -LiteralPath $LivePath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $Exp.Sha256) {
        $RuntimeHashMismatch += $Exp.Path
      }
    }
    if ($HashMismatch) {
      $Report += [pscustomobject]@{ platform = $Name; check = "sha256-drift"; status = "NOT_LIVE"; detail = ($HashMismatch -join ", ") }
    }
    if ($RuntimeMissing) {
      $Report += [pscustomobject]@{ platform = $Name; check = "runtime-missing-files"; status = "MISSING"; detail = ($RuntimeMissing -join ", ") }
    }
    if ($RuntimeHashMismatch) {
      $Report += [pscustomobject]@{ platform = $Name; check = "runtime-hash-drift"; status = "NOT_LIVE"; detail = ($RuntimeHashMismatch -join ", ") }
    }
    if (-not $Extra -and -not $Missing -and -not $HashMismatch -and -not $RuntimeMissing -and -not $RuntimeHashMismatch) {
      $Report += [pscustomobject]@{ platform = $Name; check = "manifest-parity"; status = "OK"; detail = "paths and hashes match build" }
    }
  }

  $RoutingModePath = Join-Path $RuntimeHome "skill-state\routing-mode.json"
  $RoutingGraphPath = Join-Path $RuntimeHome "context-graph.json"
  $RoutingCasesPath = Join-Path $RuntimeHome "context-route-cases.json"
  $RoutingSchemaPath = Join-Path $RuntimeHome "context-route-cases.schema.json"
  if ((Test-Path -LiteralPath $RoutingModePath) -and (Test-Path -LiteralPath $RoutingGraphPath)) {
    try {
      $RoutingState = Get-Content -Raw -LiteralPath $RoutingModePath | ConvertFrom-Json
      $RoutingGraph = Get-Content -Raw -LiteralPath $RoutingGraphPath | ConvertFrom-Json
      $RoutingHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $RoutingGraphPath).Hash.ToLowerInvariant()
      $CasesHash = if (Test-Path -LiteralPath $RoutingCasesPath) { (Get-FileHash -Algorithm SHA256 -LiteralPath $RoutingCasesPath).Hash.ToLowerInvariant() } else { "" }
      $SchemaHash = if (Test-Path -LiteralPath $RoutingSchemaPath) { (Get-FileHash -Algorithm SHA256 -LiteralPath $RoutingSchemaPath).Hash.ToLowerInvariant() } else { "" }
      $ConformanceOk = [int]$RoutingState.conformance_version -ge 3 -and [string]$RoutingState.conformance_hash -eq $CasesHash -and [string]$RoutingState.conformance_schema_hash -eq $SchemaHash
      if ([int]$RoutingGraph.version -ge 2 -and [string]$RoutingState.graph_hash -eq $RoutingHash -and [string]$RoutingState.mode -eq "strict" -and $ConformanceOk) {
        $Report += [pscustomobject]@{ platform = $Name; check = "context-routing-mode"; status = "OK"; detail = "$($RoutingState.mode), graph + conformance hashes verified" }
      } else {
        $Report += [pscustomobject]@{ platform = $Name; check = "context-routing-mode"; status = "NOT_LIVE"; detail = "mode, graph or conformance contract does not match installed runtime" }
      }
    } catch {
      $Report += [pscustomobject]@{ platform = $Name; check = "context-routing-mode"; status = "NOT_LIVE"; detail = $_.Exception.Message }
    }
  } else {
    $Report += [pscustomobject]@{ platform = $Name; check = "context-routing-mode"; status = "NOT_LIVE"; detail = "missing strict graph-routing receipt" }
  }

  # Hook health: structural config plus a recent local smoke probe. A copied
  # JSON file alone is not reported as live.
  $HookConfig = $null
  $HookNeedle = $null
  $HookScript = $null
  switch ($Name) {
    "codex" {
      $HookConfig = Join-Path $RuntimeHome "hooks.json"
      $HookNeedle = "shell_command|apply_patch"
      $HookScript = Join-Path $RuntimeHome "scripts\skill-gate.py"
    }
    "antigravity" {
      $HookConfig = Join-Path $RuntimeHome "hooks.json"
      $HookNeedle = "antigravity-skill-gate"
      $HookScript = Join-Path $RuntimeHome "scripts\antigravity-skill-gate.py"
    }
    "grok" {
      $HookConfig = Join-Path $RuntimeHome "hooks\skill-orchestrator.json"
      $HookNeedle = "grok-skill-gate"
      $HookScript = Join-Path $RuntimeHome "hooks\bin\grok-skill-gate.py"
    }
    "claude" {
      $HookConfig = Join-Path $RuntimeHome "settings.json"
      $HookNeedle = "context-hook.py"
      $HookScript = Join-Path $RuntimeHome "scripts\context-hook.py"
    }
  }
  if ($Name -eq "cursor") {
    $HookConfig = Join-Path $RuntimeHome "hooks.json"
    $HookNeedle = "cursor-hook.py"
    $HookScript = Join-Path $RuntimeHome "scripts\cursor-hook.py"
  }
  if ($HookConfig) {
    if ($Name -eq "codex") {
      $CodexConfigPath = $McpConfigPaths[$Name]
      $HooksEnabled = (Test-Path $CodexConfigPath) -and (Select-String -Path $CodexConfigPath -Pattern '(?m)^\s*hooks\s*=\s*true\s*$' -Quiet)
      if ($HooksEnabled) {
        $Report += [pscustomobject]@{ platform = $Name; check = "hooks-feature"; status = "OK"; detail = "[features].hooks=true" }
      } else {
        $Report += [pscustomobject]@{ platform = $Name; check = "hooks-feature"; status = "NOT_LIVE"; detail = "Codex hooks feature is not explicitly enabled in config.toml" }
      }
    }
    $ConfigBody = if (Test-Path $HookConfig) { Get-Content -Raw -Encoding UTF8 $HookConfig } else { "" }
    if ((Test-Path $HookConfig) -and (Test-Path $HookScript) -and $ConfigBody -notmatch "__CODEX_HOME__|__ANTIGRAVITY_HOME__|__CURSOR_HOME__|__PYTHON__" -and $ConfigBody -match $HookNeedle) {
      $Report += [pscustomobject]@{ platform = $Name; check = "hook-config"; status = "OK"; detail = "hook config and gate script present" }
    } else {
      $Report += [pscustomobject]@{ platform = $Name; check = "hook-config"; status = "NOT_LIVE"; detail = "hook config/script missing, placeholder, or stale matcher" }
    }
    $HealthPath = Join-Path $RuntimeHome "skill-state\hook-health.json"
    $AdapterOk = $false
    $NativeObserved = $false
    $NativeUnobserved = $false
    if (Test-Path $HealthPath) {
      try {
        $Health = Get-Content -Raw -Encoding UTF8 $HealthPath | ConvertFrom-Json
        $When = [DateTimeOffset]::Parse([string]$Health.adapter_probe.at)
        $AdapterOk = ([string]$Health.adapter_probe.status -eq "PASS" -and (([DateTimeOffset]::UtcNow - $When).TotalDays -le 7))
        if ([bool]$Health.native_receipt) {
          $ReceiptAt = [DateTimeOffset]::Parse([string]$Health.native_receipt.at)
          $ReceiptHash = [string]$Health.native_receipt.script_hash
          $InstalledHash = if (Test-Path $HookScript) {
            (Get-FileHash -Algorithm SHA256 -LiteralPath $HookScript).Hash.ToLowerInvariant()
          } else { "" }
          $NativeObserved = (
            [string]$Health.status -eq "NATIVE_OBSERVED" -and
            [string]$Health.trust_state -eq "unattested" -and
            $ReceiptHash -eq $InstalledHash -and
            (([DateTimeOffset]::UtcNow - $ReceiptAt).TotalDays -le 7)
          )
        }
        $NativeUnobserved = $AdapterOk -and -not $NativeObserved
      } catch { $AdapterOk = $false }
    }
    if ($NativeObserved) {
      $Report += [pscustomobject]@{ platform = $Name; check = "hook-native-observed"; status = "NATIVE_OBSERVED"; detail = "matching hook observation exists; local state cannot independently prove host origin" }
    } elseif ($NativeUnobserved) {
      $Report += [pscustomobject]@{ platform = $Name; check = "hook-native-live"; status = "NATIVE_UNOBSERVED"; detail = "adapter smoke passed, but no host-delivered receipt; review hook trust or host lifecycle dispatch before claiming native enforcement" }
    } elseif ($AdapterOk) {
      $Report += [pscustomobject]@{ platform = $Name; check = "hook-adapter"; status = "ADAPTER_PASS"; detail = "direct adapter smoke passed; native delivery remains unproven" }
    } else {
      $Report += [pscustomobject]@{ platform = $Name; check = "hook-native-live"; status = "NOT_LIVE"; detail = "no current adapter probe or host receipt; rerun installer, then inspect trust and host lifecycle dispatch" }
    }
  }

  $McpPath = $McpConfigPaths[$Name]
  if ($Name -eq "codex") {
    $TomlChecks = @{
      "mcp-config-codebase-memory" = '\[mcp_servers\.codebase_memory\]'
      "mcp-config-context7"        = '\[mcp_servers\.context7\]'
      "mcp-config-playwright"      = '\[mcp_servers\.playwright\]'
      "mcp-config-chrome-devtools" = '\[mcp_servers\.chrome_devtools\]'
    }
    foreach ($Check in $TomlChecks.GetEnumerator()) {
      $Ok = (Test-Path $McpPath) -and (Select-String -Path $McpPath -Pattern $Check.Value -Quiet)
      if ($Ok) {
        $Report += [pscustomobject]@{ platform = $Name; check = $Check.Key; status = "OK"; detail = "present in config.toml" }
      } else {
        $Report += [pscustomobject]@{ platform = $Name; check = $Check.Key; status = "WARN"; detail = "missing - re-run install" }
      }
    }
    if ($SkipIntegrationVerify) {
      $Report += [pscustomobject]@{ platform = $Name; check = "mcp-config-parse"; status = "SKIP"; detail = "external codex mcp probe skipped by request" }
    } else {
      try {
        $CodexMcpOutput = (& codex mcp list 2>&1 | Out-String).Trim()
        if ($LASTEXITCODE -eq 0) {
          $Report += [pscustomobject]@{ platform = $Name; check = "mcp-config-parse"; status = "OK"; detail = "codex mcp list parsed config.toml" }
        } elseif ($CodexMcpOutput -match "Access is denied|UnauthorizedAccessException") {
          $Report += [pscustomobject]@{ platform = $Name; check = "mcp-config-parse"; status = "SKIP"; detail = "codex CLI is protected by WindowsApps; static config and integration probes passed" }
        } else {
          $Report += [pscustomobject]@{ platform = $Name; check = "mcp-config-parse"; status = "NOT_LIVE"; detail = $CodexMcpOutput }
        }
      } catch {
        $ErrorText = $_.Exception.Message
        if ($ErrorText -match "Access is denied|UnauthorizedAccessException") {
          $Report += [pscustomobject]@{ platform = $Name; check = "mcp-config-parse"; status = "SKIP"; detail = "codex CLI is protected by WindowsApps; static config and integration probes passed" }
        } else {
          $Report += [pscustomobject]@{ platform = $Name; check = "mcp-config-parse"; status = "NOT_LIVE"; detail = $ErrorText }
        }
      }
    }
  } elseif (Test-Path $McpPath) {
    $Mcp = Get-Content -Raw $McpPath | ConvertFrom-Json
    $Keys = @($Mcp.mcpServers.PSObject.Properties.Name)
    $JsonChecks = @{
      "mcp-config-codebase-memory" = "codebase-memory"
      "mcp-config-context7"        = "context7"
      "mcp-config-playwright"      = "playwright"
      "mcp-config-chrome-devtools" = "chrome-devtools"
    }
    foreach ($Check in $JsonChecks.GetEnumerator()) {
      if ($Keys -contains $Check.Value) {
        $Report += [pscustomobject]@{ platform = $Name; check = $Check.Key; status = "OK"; detail = "mcp.json has $($Check.Value)" }
      } else {
        $Report += [pscustomobject]@{ platform = $Name; check = $Check.Key; status = "WARN"; detail = "mcp.json missing $($Check.Value)" }
      }
    }
  } else {
    $Report += [pscustomobject]@{ platform = $Name; check = "mcp-config"; status = "WARN"; detail = "no mcp config at $McpPath" }
  }

  if ($Registry -and -not $SkipIntegrationVerify) {
    foreach ($Integration in $Registry.integrations) {
      if ($Integration.policy -eq "optional") { continue }
      if ($null -ne $Integration.PSObject.Properties["install"]) {
        $VerifyScript = Join-Path $Root ($Integration.install.verify)
      } else {
        $VerifyScript = Join-Path (Join-Path $Root $Integration.path) "verify.ps1"
      }
      if (-not (Test-Path $VerifyScript)) {
        $Status = if ($Integration.policy -eq "required") { "MISSING" } else { "WARN" }
        $Report += [pscustomobject]@{ platform = $Name; check = $Integration.id; status = $Status; detail = "no verify.ps1" }
        continue
      }
      try {
        Assert-ScriptIntegrity -ScriptPath $VerifyScript
        & $VerifyScript | Out-Null
        $Report += [pscustomobject]@{ platform = $Name; check = $Integration.id; status = "OK"; detail = "verify pass" }
      } catch {
        $Status = if ($Integration.policy -eq "required") { "NOT_LIVE" } else { "WARN" }
        $Report += [pscustomobject]@{ platform = $Name; check = $Integration.id; status = $Status; detail = $_.Exception.Message }
      }
    }
  }
  if ($Registry -and $SkipIntegrationVerify) {
    $Report += [pscustomobject]@{
      platform = $Name
      check    = "integration-verify"
      status   = "SKIP"
      detail   = "external MCP probes skipped by request; structural/runtime parity checks still ran"
    }
  }
}

# Grok: inject path must be lean-only (no legacy dual tree)
$GrokHome = $PlatformHomes["grok"]
$GrokInject = Join-Path (Join-Path $GrokHome ".grok") "rules"
$GrokManifestRules = Join-Path $GrokHome "rules"
$LegacyNames = @("00-index.md", "01-agent-workflow-sop.md", "00-universal-frontier-contract.md", "07-finish-to-completion.md", "antigravity-overlay.md", "platform-boundary.md", "08-ui-consistency-gate.md")
if (Test-Path $GrokInject) {
  $LegacyHits = @()
  foreach ($Ln in $LegacyNames) {
    if (Test-Path (Join-Path $GrokInject $Ln)) { $LegacyHits += $Ln }
  }
  if ($LegacyHits.Count -gt 0) {
    $Report += [pscustomobject]@{
      platform = "grok"
      check    = "legacy-inject-rules"
      status   = "NOT_LIVE"
      detail   = "Legacy dual-tree still at $GrokInject : $($LegacyHits -join ', ') - re-run 02-install-runtime"
    }
  } else {
    $LeanOk = (Test-Path (Join-Path $GrokInject "00-intent-scope-safety.md")) -and (Test-Path (Join-Path $GrokInject "10-execution-planning-delegation.md"))
    if (-not $LeanOk) {
      $Report += [pscustomobject]@{
        platform = "grok"
        check    = "inject-rules-lean"
        status   = "MISSING"
        detail   = "Inject path missing lean core: $GrokInject"
      }
    } else {
      # Hash sample: inject bootstrap must match installed rules/bootstrap when both exist
      if (Test-Path (Join-Path $GrokManifestRules "00-intent-scope-safety.md")) {
        $H1 = (Get-FileHash -Algorithm SHA256 (Join-Path $GrokInject "00-intent-scope-safety.md")).Hash
        $H2 = (Get-FileHash -Algorithm SHA256 (Join-Path $GrokManifestRules "00-intent-scope-safety.md")).Hash
        if ($H1 -ne $H2) {
          $Report += [pscustomobject]@{
            platform = "grok"
            check    = "inject-vs-rules-drift"
            status   = "NOT_LIVE"
            detail   = "Inject path drift vs $GrokManifestRules - re-run install"
          }
        } else {
          $Report += [pscustomobject]@{
            platform = "grok"
            check    = "inject-rules-lean"
            status   = "OK"
            detail   = "Lean inject path matches installed rules"
          }
        }
      } else {
        $Report += [pscustomobject]@{
          platform = "grok"
          check    = "inject-rules-lean"
          status   = "OK"
          detail   = "Lean inject path present"
        }
      }
    }
  }
} elseif (Test-Path (Join-Path $GrokHome "agent-rules-manifest.json")) {
  $Report += [pscustomobject]@{
    platform = "grok"
    check    = "inject-rules-lean"
    status   = "MISSING"
    detail   = "Grok installed but inject path missing: $GrokInject"
  }
}

# --- Runtime state: config hash/gen, roles/permissions, child/session, semantic cursor, queue age, ownership/orphan ---
foreach ($Name in $Selected) {
  $RuntimeHome = $PlatformHomes[$Name]
  $ManifestPath = Join-Path $RuntimeHome "agent-rules-manifest.json"
  if (-not (Test-Path $ManifestPath)) { continue }

  # 1. Loaded config hash/generation
  try {
    $M = Get-Content -Raw $ManifestPath | ConvertFrom-Json
    $ManifestHash = (Get-FileHash -LiteralPath $ManifestPath -Algorithm SHA256).Hash.Substring(0, 12).ToLowerInvariant()
    $MTime = (Get-Item -LiteralPath $ManifestPath).LastWriteTimeUtc
    $Gen = if ($M.PSObject.Properties["version"]) { [int]$M.version } else { 0 }
    $SrcCore = if ($M.generated_from) { $M.generated_from.core } else { "" }
    $SrcSkills = if ($M.generated_from) { $M.generated_from.skills } else { "" }
    $SrcDocs = if ($M.generated_from) { $M.generated_from.docs } else { "" }
    $Report += [pscustomobject]@{
      platform = $Name; check = "state-config-generation"
      status   = "INFO"
      detail   = "gen=$Gen hash=$ManifestHash mtime=$($MTime.ToString('yyyy-MM-ddTHH:mm:ssZ')) core=$SrcCore skills=$SrcSkills docs=$SrcDocs"
    }
  } catch { $Report += [pscustomobject]@{ platform = $Name; check = "state-config-generation"; status = "WARN"; detail = $_.Exception.Message } }

  # 2. Roles/permissions
  $PolicyPath = Join-Path $RuntimeHome "model-policy.json"
  $ContractPath = Join-Path $RuntimeHome "runtime-contract.json"
  $RoleDetail = ""; $PermDetail = ""
  if (Test-Path $PolicyPath) {
    try {
      $P = Get-Content -Raw $PolicyPath | ConvertFrom-Json
      $Roles = @($P.role_defaults.PSObject.Properties.Name)
      $RoleDetail = "roles=$($Roles.Count) [$($Roles -join ',')]"
    } catch { $RoleDetail = "roles-parse-error" }
  } else { $RoleDetail = "no-model-policy" }
  if (Test-Path $ContractPath) {
    try {
      $C = Get-Content -Raw $ContractPath | ConvertFrom-Json
      $Perm = $C.contract.orchestration.permission_capability
      $Attest = $C.contract.orchestration.model_attestation
      $PermDetail = "perm=$Perm attest=$Attest"
    } catch { $PermDetail = "perm-parse-error" }
  } else { $PermDetail = "no-runtime-contract" }
  $Report += [pscustomobject]@{
    platform = $Name; check = "state-roles-permissions"
    status   = "INFO"
    detail   = "$RoleDetail $PermDetail".Trim()
  }

  # 3. Child/session (claude projects store)
  $ProjectsPath = Join-Path $RuntimeHome "projects"
  $ChildCount = 0; $SessionCount = 0; $OldestSessionAge = ""
  if (Test-Path $ProjectsPath) {
    $AllSessions = @(Get-ChildItem -LiteralPath $ProjectsPath -Recurse -Filter "*.jsonl" -File -ErrorAction SilentlyContinue)
    $Children = $AllSessions | Where-Object { $_.FullName -match '[\\/]subagents[\\/]' }
    $Sessions = $AllSessions | Where-Object { $_.FullName -notmatch '[\\/]subagents[\\/]' }
    $ChildCount = $Children.Count; $SessionCount = $Sessions.Count
    if ($Sessions.Count -gt 0) {
      $Oldest = $Sessions | Sort-Object LastWriteTimeUtc | Select-Object -First 1
      $AgeH = [Math]::Round(([DateTimeOffset]::UtcNow - $Oldest.LastWriteTimeUtc).TotalHours, 1)
      $OldestSessionAge = "oldest=$($Oldest.LastWriteTimeUtc.ToString('u')) age=${AgeH}h"
    } else { $OldestSessionAge = "oldest=none" }
  } else { $OldestSessionAge = "no-projects-dir" }
  $Report += [pscustomobject]@{
    platform = $Name; check = "state-child-session"
    status   = "INFO"
    detail   = "sessions=$SessionCount children=$ChildCount $OldestSessionAge"
  }

  # 4. Semantic cursor/deadline: routing-mode graph hash + freshness
  $RoutingModePath = Join-Path $RuntimeHome "skill-state\routing-mode.json"
  $RoutingGraphPath = Join-Path $RuntimeHome "context-graph.json"
  $CursorDetail = ""; $CursorStatus = "INFO"
  if (Test-Path $RoutingModePath) {
    try {
      $RM = Get-Content -Raw $RoutingModePath | ConvertFrom-Json
      $GraphHash = [string]$RM.graph_hash
      $CheckedAt = if ([string]$RM.conformance_checked_at_utc) { [DateTimeOffset]::Parse([string]$RM.conformance_checked_at_utc) } else { $null }
      $UpdatedAt = if ([string]$RM.updated_at_utc) { [DateTimeOffset]::Parse([string]$RM.updated_at_utc) } else { $null }
      $CursorHashShort = $GraphHash.Substring(0, 12).ToLowerInvariant()
      $FreshHours = if ($UpdatedAt) { [Math]::Round(([DateTimeOffset]::UtcNow - $UpdatedAt).TotalHours, 1) } else { -1 }
      $IsStale = $FreshHours -gt 168  # 7 days
      $StaleFlag = if ($IsStale) { "STALE" } else { "fresh" }
      $CursorDetail = "cursor=$CursorHashShort mode=$($RM.mode) graph_v=$($RM.graph_version) updated=${FreshHours}h [$StaleFlag]"
      if ($IsStale) { $CursorStatus = "WARN" }
      # verify installed graph hash matches routing-mode reference
      if (Test-Path $RoutingGraphPath) {
        $InstalledGraphHash = (Get-FileHash -LiteralPath $RoutingGraphPath -Algorithm SHA256).Hash.Substring(0,12).ToLowerInvariant()
        if ($InstalledGraphHash -eq $CursorHashShort) { $CursorDetail += " graph=match" }
        else { $CursorDetail += " graph=DRIFT($InstalledGraphHash)"; $CursorStatus = "WARN" }
      } else { $CursorDetail += " graph=missing"; $CursorStatus = "WARN" }
    } catch { $CursorDetail = "parse-error=$($_.Exception.Message)"; $CursorStatus = "WARN" }
  } else { $CursorDetail = "no-routing-mode"; $CursorStatus = "SKIP" }
  $Report += [pscustomobject]@{ platform = $Name; check = "state-semantic-cursor"; status = $CursorStatus; detail = $CursorDetail }

  # 5. Queue age: oldest session transcript file age (claude only; others SKIP)
  if ((Test-Path $ProjectsPath) -and $SessionCount -gt 0) {
    $AllSessionsForQueue = @(Get-ChildItem -LiteralPath $ProjectsPath -Recurse -Filter "*.jsonl" -File -ErrorAction SilentlyContinue | Where-Object { $_.FullName -notmatch '[\\/]subagents[\\/]' })
    if ($AllSessionsForQueue.Count -gt 0) {
      $OldestQ = $AllSessionsForQueue | Sort-Object LastWriteTimeUtc | Select-Object -First 1
      $NewestQ = $AllSessionsForQueue | Sort-Object LastWriteTimeUtc | Select-Object -Last 1
      $QAgeH = [Math]::Round(([DateTimeOffset]::UtcNow - $OldestQ.LastWriteTimeUtc).TotalHours, 1)
      $QNewH = [Math]::Round(([DateTimeOffset]::UtcNow - $NewestQ.LastWriteTimeUtc).TotalHours, 1)
      $QStale = $QAgeH -gt 720  # 30 days
      $QFlag = if ($QStale) { "STALE" } else { "ok" }
      $Report += [pscustomobject]@{
        platform = $Name; check = "state-queue-age"
        status   = if ($QStale) { "WARN" } else { "INFO" }
        detail   = "sessions=$($AllSessionsForQueue.Count) oldest=${QAgeH}h newest=${QNewH}h [$QFlag]"
      }
    } else { $Report += [pscustomobject]@{ platform = $Name; check = "state-queue-age"; status = "SKIP"; detail = "no-session-files" } }
  } else { $Report += [pscustomobject]@{ platform = $Name; check = "state-queue-age"; status = "SKIP"; detail = "no-projects-or-sessions" } }

  # 6. Ownership and orphan: owned.json vs manifest files
  $OwnedPath = Join-Path $RuntimeHome "agent-rules-owned.json"
  $OrphanDetail = ""; $OrphanStatus = "OK"
  if (Test-Path $OwnedPath) {
    try {
      $OwnedList = @(Get-Content -Raw $OwnedPath | ConvertFrom-Json | ForEach-Object { [string]$_ })
      $ManifestFiles = @($M.files | ForEach-Object { [string]$_.path })
      $OwnedSet = @($OwnedList | Sort-Object)
      $ManifestSet = @($ManifestFiles | Sort-Object)
      $Orphaned = @($OwnedSet | Where-Object { $_ -notin $ManifestSet })
      $Unclaimed = @($ManifestSet | Where-Object { $_ -notin $OwnedSet })
      $OwnedCount = $OwnedSet.Count; $ManifestCount = $ManifestSet.Count
      if ($Orphaned.Count -gt 0) { $OrphanDetail += "owned-not-built=$($Orphaned.Count) "; $OrphanStatus = "WARN" }
      if ($Unclaimed.Count -gt 0) { $OrphanDetail += "built-not-owned=$($Unclaimed.Count) "; $OrphanStatus = "WARN" }
      if (-not $OrphanDetail) { $OrphanDetail = "owned=$OwnedCount manifest=$ManifestCount clean" }
      else { $OrphanDetail = "owned=$OwnedCount manifest=$ManifestCount " + $OrphanDetail.Trim() }
    } catch { $OrphanDetail = "parse-error"; $OrphanStatus = "WARN" }
  } else { $OrphanDetail = "no-owned-manifest"; $OrphanStatus = "SKIP" }
  $Report += [pscustomobject]@{ platform = $Name; check = "state-ownership-orphan"; status = $OrphanStatus; detail = $OrphanDetail }
}

# --- OpenCode-specific doctor (independent adapter, not in main install pipeline) ---
if ($Selected -contains "opencode") {
  $OpenCodeHome = $PlatformHomes["opencode"]
  $OpenCodeOwned = Join-Path $OpenCodeHome "agent-rules-owned.json"
  $OpenCodeAgents = Join-Path $OpenCodeHome "agents"
  if (Test-Path -LiteralPath $OpenCodeOwned) {
    $Report += [pscustomobject]@{ platform = "opencode"; check = "ownership-manifest"; status = "OK"; detail = "found at $OpenCodeOwned" }
    try {
      $Owned = Get-Content -Raw -LiteralPath $OpenCodeOwned | ConvertFrom-Json
      $OwnedCount = @($Owned).Count
      $Report += [pscustomobject]@{ platform = "opencode"; check = "owned-files"; status = "OK"; detail = "$OwnedCount entries" }
    } catch {
      $Report += [pscustomobject]@{ platform = "opencode"; check = "owned-files"; status = "NOT_LIVE"; detail = "unparseable manifest" }
    }
  } else {
    $Report += [pscustomobject]@{ platform = "opencode"; check = "ownership-manifest"; status = "NOT_LIVE"; detail = "adapter not installed; run platforms/opencode/scripts/install-adapter.ps1" }
  }
  $InitForgeAgents = @()
  if (Test-Path -LiteralPath $OpenCodeAgents) {
    $InitForgeAgents = @(Get-ChildItem -LiteralPath $OpenCodeAgents -File -Filter "initforge-*.md" | ForEach-Object { $_.Name })
    $UserNative = @(Get-ChildItem -LiteralPath $OpenCodeAgents -File -Filter "*.md" | Where-Object { $_.Name -notlike "initforge-*" -and $_.Name -ne "README.md" } | ForEach-Object { $_.Name })
    if ($InitForgeAgents.Count -ge 4) {
      $Report += [pscustomobject]@{ platform = "opencode"; check = "agents"; status = "INSTALL_PASS"; detail = "$($InitForgeAgents.Count) initforge agent(s)" }
    } else {
      $Report += [pscustomobject]@{ platform = "opencode"; check = "agents"; status = "PARTIAL"; detail = "only $($InitForgeAgents.Count) initforge agent(s)" }
    }
    if ($UserNative.Count -gt 0) {
      $Report += [pscustomobject]@{ platform = "opencode"; check = "user-native-agents"; status = "PRESERVED"; detail = "$($UserNative.Count) user-native agent(s)" }
    }
  }
  $NativeCli = Get-Command "opencode" -ErrorAction SilentlyContinue
  $Report += [pscustomobject]@{ platform = "opencode"; check = "native-activation"; status = $(if ($NativeCli) { "NATIVE_UNVERIFIED" } else { "NATIVE_UNVERIFIED" }); detail = $(if ($NativeCli) { "opencode CLI is available; no trusted host-activation receipt exists" } else { "opencode CLI is unavailable; host activation is unobserved" }) }
  $OpenCodeProbe = Join-Path $Root "platforms\opencode\scripts\adapter-probe.py"
  if (Test-Path -LiteralPath $OpenCodeProbe) {
    $PythonCmd = $env:AGENT_RULES_PYTHON
    if (-not $PythonCmd) { $PythonCmd = $env:HARNESS_PYTHON }
    if (-not $PythonCmd) {
      foreach ($Candidate in @("python", "python3")) {
        $Resolved = Get-Command $Candidate -ErrorAction SilentlyContinue
        if ($Resolved) { $PythonCmd = $Resolved.Source; break }
      }
    }
    if ($PythonCmd) {
      $ProbeOut = & $PythonCmd $OpenCodeProbe --opencode-home $OpenCodeHome 2>&1 | Out-String
      if ($LASTEXITCODE -eq 0) {
        $Report += [pscustomobject]@{ platform = "opencode"; check = "adapter-probe"; status = "ADAPTER_PASS"; detail = "probes passed" }
      } else {
        $Report += [pscustomobject]@{ platform = "opencode"; check = "adapter-probe"; status = "ADAPTER_FAIL"; detail = ($ProbeOut -split "`n")[-1].Trim() }
      }
    }
  }
}

if ($env:AGENT_RULES_SKIP_RUNTIME_HOOKS -eq "1") {
  foreach ($HookResult in @($Report | Where-Object { $_.check -like "hook*" -or $_.check -eq "hooks-feature" })) {
    $HookResult.status = "HOOK_UNVERIFIED"
    $HookResult.detail = "runtime hook installation was explicitly skipped; no activation claim"
  }
}

$Report | Format-Table -AutoSize
$Bad = $Report | Where-Object status -in @("MISSING", "NOT_LIVE", "MODEL_POLICY_DRIFT", "MODEL_POLICY_MISSING", "NATIVE_PARTIAL")
if ($Bad) {
  Write-Error "Doctor PARTIAL: $($Bad.Count) install/runtime failure(s); native and orchestration observations remain separately classified above"
  exit 1
}
$NativeObserved = @($Report | Where-Object status -eq "NATIVE_OBSERVED").Count
$NativeUnverified = @($Report | Where-Object status -eq "NATIVE_UNVERIFIED").Count
$OrchestrationObserved = @($Report | Where-Object status -eq "ORCHESTRATION_OBSERVED").Count
Write-Host "Doctor layered summary: install/parity checks have no blocking failures; native observed=$NativeObserved, native unverified=$NativeUnverified, orchestration observed=$OrchestrationObserved. Capability is not native execution evidence."
Write-Host "See docs/guides/06-platform-capability.md for the full capability matrix with requested/resolved/observed probe fields."
