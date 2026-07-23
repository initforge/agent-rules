param(
  [string]$Root = (Split-Path -Parent $PSScriptRoot),
  [string]$RegistryPath = (Join-Path (Split-Path -Parent $PSScriptRoot) "integrations\registry.json")
)

$ErrorActionPreference = "Stop"
function Fail([string]$Message) { throw "tool registry: $Message" }

if (-not (Test-Path -LiteralPath $RegistryPath)) { Fail "missing $RegistryPath" }
try {
  $Registry = Get-Content -Raw -LiteralPath $RegistryPath | ConvertFrom-Json
} catch {
  Fail "invalid JSON: $($_.Exception.Message)"
}
if ([int]$Registry.version -ne 1) { Fail "expected version 1" }
if (-not $Registry.integrations -or @($Registry.integrations).Count -eq 0) {
  Fail "integrations must be a non-empty array"
}

$Required = @(
  "name", "policy", "path", "triggerClasses", "capabilityClass", "sideEffects",
  "tokenClass", "nativeHosts", "fallback", "proofStatus"
)
$Policies = @("required", "recommended", "optional")
$TokenClasses = @("low", "medium", "high")
$ProofStatuses = @("advisory-only", "declared", "adapter-verified", "native-live")
$Hosts = @("codex", "grok", "antigravity", "cursor")
$Ids = @{}

foreach ($Tool in @($Registry.integrations)) {
  foreach ($Field in $Required) {
    if ($null -eq $Tool.PSObject.Properties[$Field]) { Fail "tool is missing $Field" }
  }
  if ($Ids.ContainsKey($Tool.name)) { Fail "duplicate name '$($Tool.name)'" }
  $Ids[$Tool.name] = $true
  if ($Policies -notcontains $Tool.policy) { Fail "$($Tool.name) has invalid policy" }
  if ($TokenClasses -notcontains $Tool.tokenClass) { Fail "$($Tool.name) has invalid tokenClass" }
  if ($ProofStatuses -notcontains $Tool.proofStatus) { Fail "$($Tool.name) has invalid proofStatus" }
  if (-not @($Tool.triggerClasses).Count) { Fail "$($Tool.name) needs triggerClasses" }
  foreach ($NativeHost in @($Tool.nativeHosts)) {
    if ($Hosts -notcontains $NativeHost) { Fail "$($Tool.name) has invalid native host '$NativeHost'" }
  }
  $ToolPath = Join-Path $Root $Tool.path
  if (-not (Test-Path -LiteralPath $ToolPath)) { Fail "$($Tool.name) path is missing: $($Tool.path)" }
  if ($Tool.proofStatus -eq "native-live" -and -not @($Tool.nativeHosts).Count) {
    Fail "$($Tool.name) cannot be native-live without a native host"
  }
  if ($Tool.proofStatus -eq "adapter-verified") {
    foreach ($NativeHost in @($Tool.nativeHosts)) {
      $Extension = if ($NativeHost -eq "codex") { "toml" } else { "json" }
      $Adapter = Join-Path $ToolPath "adapters\$NativeHost.$Extension"
      if (-not (Test-Path -LiteralPath $Adapter)) {
        Fail "$($Tool.name) lacks $NativeHost adapter required by adapter-verified proof"
      }
    }
  }
}

Write-Host "PASS: tool registry ($(@($Registry.integrations).Count) tools)"
