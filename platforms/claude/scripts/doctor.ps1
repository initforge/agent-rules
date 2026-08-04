param(
  [string]$Root = (Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))),
  [string]$ClaudeHome = ""
)

$ErrorActionPreference = "Stop"
$UserHome = if ($env:USERPROFILE) { $env:USERPROFILE } elseif ($env:HOME) { $env:HOME } else { throw "Cannot resolve user home" }
$TargetHome = if ($ClaudeHome) { [IO.Path]::GetFullPath($ClaudeHome) } elseif ($env:CLAUDE_CONFIG_DIR) { [IO.Path]::GetFullPath($env:CLAUDE_CONFIG_DIR) } else { Join-Path $UserHome ".claude" }
$BuildHome = Join-Path $Root "generated\runtime-build\claude"
$Report = @()

function Add-Check {
  param([string]$Check, [string]$Status, [string]$Detail)
  $script:Report += [pscustomobject]@{ check = $Check; status = $Status; detail = $Detail }
}

if (-not (Test-Path -LiteralPath $TargetHome -PathType Container)) {
  Add-Check "runtime-home" "MISSING" $TargetHome
  $Report | Format-Table -AutoSize
  return $Report
}
Add-Check "runtime-home" "OK" $TargetHome

$OwnershipPath = Join-Path $TargetHome "agent-rules-owned.json"
$Owned = @()
if (Test-Path -LiteralPath $OwnershipPath -PathType Leaf) {
  try {
    $Owned = @((Get-Content -Raw -Encoding UTF8 -LiteralPath $OwnershipPath | ConvertFrom-Json) | ForEach-Object { [string]$_ })
    Add-Check "ownership-manifest" "OK" "$($Owned.Count) entries"
  } catch { Add-Check "ownership-manifest" "NOT_LIVE" $_.Exception.Message }
} else { Add-Check "ownership-manifest" "MISSING" $OwnershipPath }

$BuildManifestPath = Join-Path $BuildHome "manifest.json"
$RuntimeManifestPath = Join-Path $TargetHome "agent-rules-manifest.json"
if (-not (Test-Path -LiteralPath $BuildManifestPath) -or -not (Test-Path -LiteralPath $RuntimeManifestPath)) {
  Add-Check "runtime-manifest" "MISSING" "build or installed manifest missing"
} else {
  $BuildManifest = Get-Content -Raw -Encoding UTF8 -LiteralPath $BuildManifestPath | ConvertFrom-Json
  $RuntimeManifest = Get-Content -Raw -Encoding UTF8 -LiteralPath $RuntimeManifestPath | ConvertFrom-Json
  $Expected = @($BuildManifest.files | ForEach-Object { [string]$_.path })
  $Installed = @($RuntimeManifest.files | ForEach-Object { [string]$_.path })
  $ManifestDrift = @(Compare-Object $Expected $Installed)
  Add-Check "manifest-parity" $(if ($ManifestDrift.Count -eq 0) { "OK" } else { "NOT_LIVE" }) $(if ($ManifestDrift.Count -eq 0) { "paths match generated Claude build" } else { ($ManifestDrift.InputObject -join ", ") })

  $Missing = @()
  $HashDrift = @()
  foreach ($ExpectedFile in @($BuildManifest.files)) {
    $Relative = [string]$ExpectedFile.path
    $RuntimeRelative = if ($Relative -eq "AGENTS.md") { "CLAUDE.md" } else { $Relative }
    $LivePath = Join-Path $TargetHome ($RuntimeRelative -replace '/', [IO.Path]::DirectorySeparatorChar)
    if (-not (Test-Path -LiteralPath $LivePath -PathType Leaf)) { $Missing += $RuntimeRelative; continue }
    $BuildPath = Join-Path $BuildHome ($Relative -replace '/', [IO.Path]::DirectorySeparatorChar)
    if ((Get-FileHash -LiteralPath $LivePath -Algorithm SHA256).Hash.ToLowerInvariant() -ne ([string]$ExpectedFile.sha256).ToLowerInvariant()) { $HashDrift += $RuntimeRelative }
    if ($Relative -eq "AGENTS.md" -and (Get-FileHash -LiteralPath $LivePath -Algorithm SHA256).Hash.ToLowerInvariant() -ne (Get-FileHash -LiteralPath $BuildPath -Algorithm SHA256).Hash.ToLowerInvariant()) { $HashDrift += $RuntimeRelative }
  }
  Add-Check "runtime-files" $(if ($Missing.Count -eq 0 -and $HashDrift.Count -eq 0) { "OK" } else { "NOT_LIVE" }) $(if ($Missing.Count -eq 0 -and $HashDrift.Count -eq 0) { "all generated files present and hashes match" } else { "missing=$($Missing -join ','); drift=$($HashDrift -join ',')" })
}

$HookPath = Join-Path $TargetHome "scripts\context-hook.py"
$SettingsPath = Join-Path $TargetHome "settings.json"
if (-not (Test-Path -LiteralPath $HookPath -PathType Leaf) -or -not (Test-Path -LiteralPath $SettingsPath -PathType Leaf)) {
  Add-Check "hook-config" "NOT_LIVE" "context-hook.py or settings.json missing"
} else {
  $Settings = Get-Content -Raw -Encoding UTF8 -LiteralPath $SettingsPath | ConvertFrom-Json
  $HookEntries = if ($Settings.hooks -and $Settings.hooks.UserPromptSubmit) { @($Settings.hooks.UserPromptSubmit) } else { @() }
  $HookFound = @($HookEntries | Where-Object { $_.hooks -and (@($_.hooks) | Where-Object { [string]$_.command -match "context-hook\.py" }) }).Count -gt 0
  Add-Check "hook-config" $(if ($HookFound) { "OK" } else { "NOT_LIVE" }) $(if ($HookFound) { "UserPromptSubmit -> context-hook.py" } else { "UserPromptSubmit hook missing" })
}

$PythonName = if ($env:AGENT_RULES_PYTHON) { $env:AGENT_RULES_PYTHON } else { "python" }
$Python = Get-Command $PythonName -ErrorAction SilentlyContinue
if ($Python -and (Test-Path -LiteralPath $HookPath)) {
  $ProbeInput = '{"hook_event_name":"UserPromptSubmit","prompt":"doctor"}'
  $ProbeOutput = $ProbeInput | & $Python.Source $HookPath 2>&1 | Out-String
  $ProbeOk = $LASTEXITCODE -eq 0 -and $ProbeOutput -match 'additionalContext'
  Add-Check "hook-probe" $(if ($ProbeOk) { "ADAPTER_PASS" } else { "ADAPTER_FAIL" }) $(if ($ProbeOk) { "hook returned additionalContext" } else { $ProbeOutput.Trim() })
} else { Add-Check "hook-probe" "SKIP" "Python or hook script unavailable" }

$Claude = Get-Command claude -ErrorAction SilentlyContinue
if ($Claude) {
  $DoctorOutput = claude doctor 2>&1 | Out-String
  Add-Check "native-doctor" $(if ($LASTEXITCODE -eq 0 -and $DoctorOutput -match "No installation issues found\.") { "OK" } else { "NOT_LIVE" }) $DoctorOutput.Trim()
} else { Add-Check "native-doctor" "NOT_LIVE" "claude binary unavailable" }

$Report | Format-Table -AutoSize
$Failures = @($Report | Where-Object status -in @("MISSING", "NOT_LIVE", "ADAPTER_FAIL"))
Write-Host "Doctor: $(if ($Failures.Count -eq 0) { 'All checks pass.' } else { "$($Failures.Count) issue(s) found." })"
return $Report
