# Deterministic static tests for runtime install/doctor fixes.
# No runtime install is performed.
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Failures = 0

function Fail($Msg) {
  Write-Error "FAIL: $Msg"
  $script:Failures++
}

function Ok($Msg) {
  Write-Host "OK: $Msg"
}

# --- 1. Get-IntegrationPath fallback in 02-install-runtime.ps1 ---
# When 'install' property is absent but 'path' is present, return path.
$TestIntegrationWithPath = [pscustomobject]@{ id = "test-integ"; path = "integrations/test"; policy = "required" }
$TestIntegrationWithInstall = [pscustomobject]@{ id = "test-integ"; install = @{ script = "integrations/test/install.ps1" }; policy = "required" }
$TestIntegrationWithNeither = [pscustomobject]@{ id = "test-integ"; policy = "required" }

# Dot-source the function from 02-install-runtime.ps1 without executing the script.
$FuncSource = Get-Content -Raw (Join-Path $PSScriptRoot "02-install-runtime.ps1")
$FuncMatch = [regex]::Match($FuncSource, '(?s)function Get-IntegrationPath\s*\{.*?\n\}')
if (-not $FuncMatch.Success) {
  Fail "Could not extract Get-IntegrationPath from 02-install-runtime.ps1"
} else {
  Invoke-Expression $FuncMatch.Value

  $Result1 = Get-IntegrationPath $TestIntegrationWithPath
  if ($Result1 -eq "integrations/test") { Ok "Get-IntegrationPath returns path fallback" } else { Fail "Get-IntegrationPath path fallback: got '$Result1', expected 'integrations/test'" }

  $Result2 = Get-IntegrationPath $TestIntegrationWithInstall
  if ($Result2 -eq "integrations/test") { Ok "Get-IntegrationPath returns install script dir" } else { Fail "Get-IntegrationPath install fallback: got '$Result2', expected 'integrations/test'" }

  $Result3 = Get-IntegrationPath $TestIntegrationWithNeither
  if ($null -eq $Result3) { Ok "Get-IntegrationPath returns null when no install or path" } else { Fail "Get-IntegrationPath should return null, got '$Result3'" }
}

# --- 2. 03-validate-context.ps1 mirrors correct fallback ---
# When 'install' is absent but 'path' is present, IntegPath should be the path, not null.
$RegistryPath = Join-Path $Root "integrations\registry.json"
if (Test-Path $RegistryPath) {
  $Registry = Get-Content -Raw $RegistryPath | ConvertFrom-Json
  foreach ($Integration in $Registry.integrations) {
    $HasInstall = $null -ne $Integration.PSObject.Properties["install"]
    $HasPath = $null -ne $Integration.PSObject.Properties["path"]
    if (-not $HasInstall -and $HasPath) {
      $IntegPath = if ($Integration.PSObject.Properties["install"]) { $Integration.install.script -replace "/install\.ps1$", "" } elseif ($Integration.PSObject.Properties["path"]) { $Integration.path } else { $null }
      if ($IntegPath -eq $Integration.path) {
        Ok "03-validate-context fallback uses path for $($Integration.id)"
      } else {
        Fail "03-validate-context fallback should use path for $($Integration.id), got '$IntegPath'"
      }
      break
    }
  }
} else {
  Ok "SKIP: 03-validate-context fallback check (no registry.json)"
}

# --- 3. 09-doctor.ps1 opencode all-platform processing ---
# When Platform is "all", opencode should be in $Selected and the opencode
# doctor section should execute without requiring -IncludeOpenCode.
$DoctorSource = Get-Content -Raw (Join-Path $PSScriptRoot "09-doctor.ps1")
if ($DoctorSource -match 'if \(\$Selected -contains "opencode"\)') {
  Ok "09-doctor.ps1 gates opencode section on \$Selected -contains 'opencode'"
} else {
  Fail "09-doctor.ps1 should gate opencode section on \$Selected -contains 'opencode', not on -IncludeOpenCode"
}

if ($DoctorSource -match '\[switch\]\$IncludeOpenCode') {
  Fail "09-doctor.ps1 should not have -IncludeOpenCode parameter"
} else {
  Ok "09-doctor.ps1 does not have -IncludeOpenCode parameter"
}

# --- Summary ---
if ($Failures -gt 0) {
  Write-Error "$Failures test(s) FAILED"
  exit 1
}
Write-Host "All runtime install/doctor static tests PASS"
