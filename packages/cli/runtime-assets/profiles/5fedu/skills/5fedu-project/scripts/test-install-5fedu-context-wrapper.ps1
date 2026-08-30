param()

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$Wrapper = Join-Path $ScriptRoot "install-5fedu-context.ps1"
$SkillRoot = Split-Path -Parent $ScriptRoot
$Reference = Join-Path $SkillRoot "references/5fedu-context-map.md"
$Skill = Join-Path $SkillRoot "SKILL.md"
$PowerShell = (Get-Process -Id $PID).Path
$Assertions = 0

function Assert-True {
  param(
    [Parameter(Mandatory=$true)][bool]$Condition,
    [Parameter(Mandatory=$true)][string]$Message
  )
  $script:Assertions++
  if (-not $Condition) { throw "Assertion failed: $Message" }
}

function Invoke-Wrapper {
  param([Parameter(Mandatory=$true)][string[]]$Arguments)
  $Output = (& $PowerShell -NoLogo -NoProfile -NonInteractive -File $Wrapper @Arguments 2>&1 | Out-String)
  return @{
    ExitCode = $LASTEXITCODE
    Output = $Output
  }
}

$TempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("5fedu wrapper kiểm thử " + [guid]::NewGuid().ToString("N"))
$Project = Join-Path $TempRoot "dự án có khoảng trắng"

try {
  New-Item -ItemType Directory -Path $Project -Force | Out-Null

  $Fresh = Invoke-Wrapper -Arguments @(
    "-ProjectRoot", $Project,
    "-Profile", "tah-app",
    "-SkipPrompts"
  )
  Assert-True ($Fresh.ExitCode -eq 0) "fresh install through wrapper must succeed"

  $Context = Join-Path $Project "context/5fedu"
  foreach ($Relative in @("README.md", "rules", "behaviors", "module-mapping")) {
    Assert-True (Test-Path -LiteralPath (Join-Path $Context $Relative)) "lean managed root must exist: $Relative"
  }

  $ActualRoots = @(
    Get-ChildItem -LiteralPath $Context -Force |
      Sort-Object Name |
      ForEach-Object { $_.Name }
  )
  Assert-True (
    (@($ActualRoots) -join "|") -eq "behaviors|module-mapping|README.md|rules"
  ) "fresh install must contain only lean managed roots"

  $ProjectLocal = Join-Path $Context "project-local"
  New-Item -ItemType Directory -Path $ProjectLocal | Out-Null
  $Decision = Join-Path $ProjectLocal "owner-decision.txt"
  [System.IO.File]::WriteAllText($Decision, "DA_CHOT", [System.Text.UTF8Encoding]::new($false))
  [System.IO.File]::WriteAllText(
    (Join-Path $Context "README.md"),
    "tampered",
    [System.Text.UTF8Encoding]::new($false)
  )

  $ForceResult = Invoke-Wrapper -Arguments @(
    "-ProjectRoot", $Project,
    "-Profile", "nostime",
    "-SkipPrompts",
    "-Force"
  )
  Assert-True ($ForceResult.ExitCode -eq 0) "forced managed update through wrapper must succeed"
  Assert-True ((Get-Content -LiteralPath $Decision -Raw) -eq "DA_CHOT") "project-local content must survive Force"
  Assert-True ((Get-Content -LiteralPath (Join-Path $Context "README.md") -Raw) -ne "tampered") "Force must restore canonical managed content"

  $Pointer = Join-Path $Project ".codex/AGENTS.md"
  Assert-True (Test-Path -LiteralPath $Pointer -PathType Leaf) "fresh install must create pointer"
  Remove-Item -LiteralPath $Pointer
  $PointerResult = Invoke-Wrapper -Arguments @(
    "-ProjectRoot", $Project,
    "-Profile", "nostime",
    "-SkipPrompts",
    "-UpdatePointersOnly"
  )
  Assert-True ($PointerResult.ExitCode -eq 0) "pointer-only update through wrapper must succeed"
  Assert-True (Test-Path -LiteralPath $Pointer -PathType Leaf) "pointer-only update must restore missing pointer"
  Assert-True ((Get-Content -LiteralPath $Decision -Raw) -eq "DA_CHOT") "pointer-only update must not alter project-local content"

  $Unknown = Invoke-Wrapper -Arguments @(
    "-ProjectRoot", $Project,
    "-SkipPrompts",
    "-DefinitelyUnknown", "value"
  )
  Assert-True ($Unknown.ExitCode -ne 0) "unknown wrapper parameter must fail"

  foreach ($RemovedKnob in @("TemplateUrl", "Stack")) {
    $Rejected = Invoke-Wrapper -Arguments @(
      "-ProjectRoot", $Project,
      "-SkipPrompts",
      "-$RemovedKnob", "value"
    )
    Assert-True ($Rejected.ExitCode -ne 0) "removed remote/template knob must fail: $RemovedKnob"
  }

  $InvalidProfile = Invoke-Wrapper -Arguments @(
    "-ProjectRoot", $Project,
    "-Profile", "unregistered",
    "-SkipPrompts"
  )
  Assert-True ($InvalidProfile.ExitCode -ne 0) "unregistered profile must fail"

  $MissingProject = Join-Path $TempRoot "missing"
  $WrapperFailure = Invoke-Wrapper -Arguments @(
    "-ProjectRoot", $MissingProject,
    "-SkipPrompts"
  )
  Assert-True ($WrapperFailure.ExitCode -ne 0) "canonical validation failure must propagate through wrapper"

  $WrapperText = Get-Content -LiteralPath $Wrapper -Raw
  foreach ($Parameter in @("ProjectRoot", "Profile", "SkipPrompts", "Force", "UpdatePointersOnly")) {
    Assert-True ($WrapperText -match [regex]::Escape('$' + $Parameter)) "wrapper must expose canonical parameter: $Parameter"
  }
  foreach ($RemovedKnob in @("TemplateUrl", "Stack")) {
    Assert-True ($WrapperText -notmatch [regex]::Escape('$' + $RemovedKnob)) "wrapper must not expose removed knob: $RemovedKnob"
  }
  Assert-True ($WrapperText -match [regex]::Escape("profiles/5fedu/automation/08-install-5fedu-context.ps1")) "wrapper must resolve canonical installer"
  Assert-True ($WrapperText -notmatch 'Resolve-Path\s+\$ProjectRoot') "wrapper must preserve ProjectRoot for canonical path validation"

  $StaleFragments = @(
    ("known" + "-repos"),
    ("projects/00-" + "index"),
    ("A" + "GENTS"),
    ("ui-" + "delivery"),
    ("project-" + "overlay"),
    ("back" + "up")
  )
  $GuidanceText = @(
    Get-Content -LiteralPath $Skill -Raw
    Get-Content -LiteralPath $Reference -Raw
    $WrapperText
  ) -join "`n"
  foreach ($Fragment in $StaleFragments) {
    Assert-True ($GuidanceText -notmatch [regex]::Escape($Fragment)) "stale lean guidance must be absent"
  }

  Write-Host "PASS: 5fedu project wrapper ($Assertions assertions)"
} finally {
  if (Test-Path -LiteralPath $TempRoot) {
    Remove-Item -LiteralPath $TempRoot -Recurse -Force
  }
}
