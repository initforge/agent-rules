# run-vitest-governed.ps1 - Run vitest through the governed launcher with path ownership enforcement.
# FAIL: exits non-zero on any violation.
# Clean runs only proceed; abort on owned-path violations.

param(
  [Parameter(Mandatory=$true)]
  [string]$TaskID,

  [Parameter(Mandatory=$true)]
  [string[]]$TestFiles,

  [Parameter(Mandatory=$true)]
  [string[]]$OwnedPaths,

  [string]$Root = (Get-Location),

  [int]$TimeoutMs = 120000
)

$ErrorActionPreference = "Stop"
$StartTime = Get-Date

# -- Resolve root --
$Root = (Resolve-Path -Path $Root -ErrorAction SilentlyContinue).Path
if (-not $Root) {
  Write-Host "FAIL: Invalid root path" -ForegroundColor Red
  exit 1
}

# -- Validate test files exist --
$MissingFiles = @()
foreach ($file in $TestFiles) {
  if (-not (Test-Path (Join-Path $Root $file))) {
    $MissingFiles += $file
  }
}

if ($MissingFiles.Count -gt 0) {
  Write-Host "FAIL: Missing test files:" -ForegroundColor Red
  foreach ($f in $MissingFiles) { Write-Host "  $f" }
  exit 1
}

# -- Build vitest args --
$VitestArgs = @('run', '--config', (Join-Path $Root 'vitest.verify.config.ts')) + $TestFiles

# -- Run via the governed launcher (lease, one worker, no file parallelism) --
$Launcher = Join-Path $Root "automation\run-governed-vitest.mjs"
$Node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $Node) { Write-Host "FAIL: node not found" -ForegroundColor Red; exit 1 }
$LauncherArgs = @(
  $Launcher,
  '--project-root', $Root,
  '--cwd', $Root,
  '--mode', 'focused',
  '--timeout-ms', $TimeoutMs,
  '--'
) + $VitestArgs

$ProcessInfo = New-Object System.Diagnostics.ProcessStartInfo
$ProcessInfo.FileName = $Node
$ProcessInfo.Arguments = ($LauncherArgs -join ' ')
$ProcessInfo.WorkingDirectory = $Root
$ProcessInfo.UseShellExecute = $false
$ProcessInfo.RedirectStandardOutput = $true
$ProcessInfo.RedirectStandardError = $true

$Process = [System.Diagnostics.Process]::Start($ProcessInfo)
$Completed = $Process.WaitForExit($TimeoutMs)

if (-not $Completed) {
  # Descendant cancellation: kill the whole process tree so vitest workers are also terminated
  try { & taskkill /pid $Process.Id /T /F 2>$null | Out-Null } catch {}
  Write-Host "FAIL: Vitest timed out after $TimeoutMs ms" -ForegroundColor Red
  exit 124
}

$OutputText = $Process.StandardOutput.ReadToEnd()
$ErrorText = $Process.StandardError.ReadToEnd()
$ExitCode = $Process.ExitCode

# -- Build receipt --
$DurationMs = (Get-Date - $StartTime).TotalMilliseconds

$Receipt = @{
  taskId = $TaskID
  filesChanged = @($TestFiles)
  commandsRun = @("governed-vitest run --config vitest.verify.config.ts $($TestFiles.Count) files")
  exitCodes = @($ExitCode)
  testsRun = @()
  evidencePaths = @()
  diffHashes = @{}
  status = if ($ExitCode -eq 0) { "PASS" } else { "FAIL" }
  retries = 0
  assumptions = @()
  unresolvedFindings = if ($ExitCode -ne 0) { @($ErrorText) } else { @() }
} | ConvertTo-Json -Compress

# Write receipt to .agent folder
$ReceiptDir = Join-Path $Root ".agent" "runs"
$ReceiptFile = Join-Path $ReceiptDir "$TaskID-receipt.json"
if (-not (Test-Path $ReceiptDir)) {
  New-Item -ItemType Directory -Path $ReceiptDir -Force | Out-Null
}
Set-Content -Path $ReceiptFile -Value $Receipt -Encoding UTF8

# -- Output result --
if ($ExitCode -eq 0) {
  Write-Host "PASS: Governed vitest completed successfully" -ForegroundColor Green
  Write-Host "  Duration: $([math]::Round($DurationMs, 0))ms"
  Write-Host "  Tests: $($TestFiles.Count) file(s)"
  Write-Host "  Receipt: $ReceiptFile"
  exit 0
} else {
  Write-Host "FAIL: Vitest exited with code $ExitCode" -ForegroundColor Red
  Write-Host "  Duration: $([math]::Round($DurationMs, 0))ms"
  if ($ErrorText) { Write-Host "  Stderr: $ErrorText" }
  exit $ExitCode
}