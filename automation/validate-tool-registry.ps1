param(
  [string]$Root = (Split-Path -Parent $PSScriptRoot),
  [string]$RegistryPath = (Join-Path (Split-Path -Parent $PSScriptRoot) "integrations\registry.json")
)

$ErrorActionPreference = "Stop"
function Fail([string]$Message) { throw "registry: $Message" }

if (-not (Test-Path -LiteralPath $RegistryPath)) { Fail "missing $RegistryPath" }
try {
  $Registry = Get-Content -Raw -LiteralPath $RegistryPath | ConvertFrom-Json
} catch {
  Fail "invalid JSON: $($_.Exception.Message)"
}
$Version = [int]$Registry.version
if ($Version -lt 1 -or $Version -gt 2) { Fail "expected version 1 or 2, got $Version" }
if (-not $Registry.integrations -or @($Registry.integrations).Count -eq 0) {
  Fail "integrations must be a non-empty array"
}

$RequiredV1 = @(
  "name", "policy", "path", "triggerClasses", "capabilityClass", "sideEffects",
  "tokenClass", "nativeHosts", "fallback", "proofStatus"
)
$RequiredV2 = @(
  "id", "displayName", "kind", "policy", "profiles", "source", "integrity",
  "trust", "capabilities", "triggers", "sideEffects", "tokenClass",
  "permissions", "install", "nativeHosts", "fallback", "deprecatedAliases"
)
$Policies = @("required", "recommended", "optional")
$Kinds = @("mcp", "tool", "adapter", "native")
$TokenClasses = @("low", "medium", "high")
$TrustStatuses = @("advisory-only", "declared", "adapter-verified", "native-live")
$SourceTypes = @("github", "npm", "git", "local")
$InstallTypes = @("binary", "npm-global", "npm-npx", "npx-github", "git", "local")
$Hosts = @("codex", "grok", "antigravity", "cursor")

$Ids = @{}
$AllAliases = @{}

foreach ($Tool in @($Registry.integrations)) {
  # v1 or v2 schema
  if ($null -ne $Tool.PSObject.Properties["id"]) {
    # v2 schema
    foreach ($Field in $RequiredV2) {
      if ($null -eq $Tool.PSObject.Properties[$Field]) { Fail "integration missing '$Field'" }
    }
    $Id = $Tool.id
    $Policy = $Tool.policy
    $ProofStatus = $Tool.trust
    $Triggers = @($Tool.triggers)
    $Capabilities = @($Tool.capabilities)
    $NativeHosts = @($Tool.nativeHosts)
    $Aliases = @($Tool.deprecatedAliases)
    $Source = $Tool.source
  } else {
    # v1 schema — auto-map to v2 fields for validation
    $Id = $Tool.name
    $Policy = $Tool.policy
    $ProofStatus = $Tool.proofStatus
    $Triggers = @($Tool.triggerClasses)
    $Capabilities = @($Tool.capabilityClass)
    $NativeHosts = @($Tool.nativeHosts)
    $Aliases = @()
    $Source = $null
  }

  if ($Ids.ContainsKey($Id)) { Fail "duplicate id '$Id'" }
  $Ids[$Id] = $true

  # Check deprecated aliases
  if ($Id) { $AllAliases[$Id] = $true }
  foreach ($Alias in $Aliases) {
    if (-not $Alias) { continue }
    if ($AllAliases.ContainsKey($Alias)) { Fail "alias '$Alias' of '$Id' conflicts with existing id/alias" }
    $AllAliases[$Alias] = $true
  }

  if ($Policies -notcontains $Policy) { Fail "$Id has invalid policy '$Policy'" }
  if ($TokenClasses -notcontains $Tool.tokenClass) { Fail "$Id has invalid tokenClass '$($Tool.tokenClass)'" }
  if ($TrustStatuses -notcontains $ProofStatus) { Fail "$Id has invalid trust '$ProofStatus'" }
  if ($Triggers.Count -eq 0) { Fail "$Id needs triggers" }

  # Validate kind for v2
  if ($null -ne $Tool.PSObject.Properties["kind"]) {
    if ($Kinds -notcontains $Tool.kind) { Fail "$Id has invalid kind '$($Tool.kind)'" }
  }

  # Validate source for v2
  if ($Source) {
    if ($SourceTypes -notcontains $Source.type) { Fail "$Id has invalid source type '$($Source.type)'" }
  }

  # Validate install type for v2
  if ($null -ne $Tool.PSObject.Properties["install"]) {
    $InstallType = $Tool.install.type
    if ($InstallTypes -notcontains $InstallType) { Fail "$Id has invalid install type '$InstallType'" }
    $InstallScript = Join-Path $Root $Tool.install.script
    if (-not (Test-Path -LiteralPath $InstallScript)) { Fail "$Id install script missing: $($Tool.install.script)" }
  }

  # Validate health check for v2
  if ($null -ne $Tool.PSObject.Properties["health"]) {
    if (-not $Tool.health.command) { Fail "$Id needs health.command" }
    if ($null -eq $Tool.health.expectedExitCodes -or @($Tool.health.expectedExitCodes).Count -eq 0) { Fail "$Id needs health.expectedExitCodes" }
  }

  # Validate schema source for v2
  if ($null -ne $Tool.PSObject.Properties["schema"]) {
    $SchemaSource = $Tool.schema.source
    if ($SchemaSource) {
      $SchemaSourcePath = Join-Path $Root ($SchemaSource -replace '/', '\')
      if (-not (Test-Path -LiteralPath $SchemaSourcePath)) { Fail "$Id schema.source path missing: $SchemaSource" }
    }
  }

  foreach ($NativeHost in $NativeHosts) {
    if ($Hosts -notcontains $NativeHost) { Fail "$Id has invalid native host '$NativeHost'" }
  }

  # Validate path for v1, v2 uses install.script
  if ($null -eq $Tool.PSObject.Properties["id"]) {
    # v1
    $ToolPath = Join-Path $Root $Tool.path
    if (-not (Test-Path -LiteralPath $ToolPath)) { Fail "$Id path is missing: $($Tool.path)" }
  }

  if ($ProofStatus -eq "native-live" -and $NativeHosts.Count -eq 0) {
    Fail "$Id cannot be native-live without a native host"
  }
  if ($ProofStatus -eq "adapter-verified") {
    foreach ($NativeHost in $NativeHosts) {
      $Extension = if ($NativeHost -eq "codex") { "toml" } else { "json" }
      $Path = $Tool.path
      if (-not $Path -and $Tool.install) {
        $Path = Split-Path $Tool.install.script -Parent
        $Path = $Path -replace '^\.\.?\\?', ''
      }
      if ($Path) {
        $Adapter = Join-Path (Join-Path $Root $Path) "adapters\$NativeHost.$Extension"
        if (-not (Test-Path -LiteralPath $Adapter)) {
          Fail "$Id lacks $NativeHost adapter required by adapter-verified proof"
        }
      }
    }
  }
}

# Validate profiles section
if ($Version -ge 2 -and $Registry.profiles) {
  $ProfileNames = @($Registry.profiles | Get-Member -MemberType Properties | Select-Object -ExpandProperty Name)
  foreach ($PName in $ProfileNames) {
    $Profile = $Registry.profiles.$PName
    foreach ($Ref in @($Profile.required)) {
      if ($Ref -and -not $Ids.ContainsKey($Ref)) { Fail "profile '$PName' references unknown integration '$Ref' in required" }
    }
    foreach ($Ref in @($Profile.recommended)) {
      if ($Ref -and -not $Ids.ContainsKey($Ref)) { Fail "profile '$PName' references unknown integration '$Ref' in recommended" }
    }
  }
}

Write-Host "PASS: tool registry v$Version ($(@($Registry.integrations).Count) integrations, $(($AllAliases.Keys | Where-Object { $_ -ne $null }).Count) total identifiers)"
