param(
  [Parameter(Mandatory=$true)][string]$ProjectRoot,
  [ValidateSet("default","tah-app","nostime")][string]$Profile = "default",
  [string]$TemplateUrl = "",
  [ValidateSet("vite-react","nextjs-legacy","other")][string]$Stack = "",
  [switch]$SkipPrompts,
  [switch]$Force,
  [switch]$UpdatePointersOnly
)
$ErrorActionPreference = "Stop"

$Project = (Resolve-Path $ProjectRoot).Path
$RepoRoot = Split-Path -Parent $PSScriptRoot
$Template = Join-Path $RepoRoot "projects\5fedu"
$Target = Join-Path $Project "context\5fedu"
$ContextParent = Split-Path -Parent $Target

if (-not (Test-Path $Template)) { throw "Missing 5fedu template: $Template" }

$ProfileConfig = $null
if ($Profile -ne "default") {
  $ProfilePath = Join-Path $PSScriptRoot "profiles\$Profile.json"
  if (-not (Test-Path $ProfilePath)) { throw "Missing profile: $ProfilePath" }
  $ProfileConfig = Get-Content -Raw $ProfilePath | ConvertFrom-Json
}

if (-not $TemplateUrl -and $ProfileConfig.templateUrl) { $TemplateUrl = $ProfileConfig.templateUrl }
if (-not $TemplateUrl) { $TemplateUrl = "https://github.com/admin5fedu/5f-template-ket-noi-supabase" }

if (-not $Stack -and $ProfileConfig.stack) { $Stack = $ProfileConfig.stack }
if (-not $Stack) { $Stack = "vite-react" }

function Get-PointerEntry {
  $ProjectLocal = Join-Path $Target "project-local\00-index.md"
  $LegacyContext = Join-Path $Target "00-index.md"
  $NewLayout = Join-Path $Target "00-context-map.md"
  if (Test-Path $ProjectLocal) { return "context/5fedu/project-local/00-index.md" }
  if (Test-Path $LegacyContext) { return "context/5fedu/00-index.md" }
  if (Test-Path $NewLayout) { return "context/5fedu/AGENTS.md" }
  return "context/5fedu/AGENTS.md"
}

function Set-ProjectPointers {
  $PointerEntry = Get-PointerEntry
  $PointerText = @"
# Project context pointer

Canonical project context: ``$PointerEntry``.

Load from **this repo only** — never from ``agent-rules/projects/5fedu/`` (template source).

Project-specific facts (sheets, Supabase, decisions): ``context/5fedu/project-local/`` — installer never overwrites this folder.

Known 5fedu repos: tah-app, nostime — see agent-rules ``projects/known-5fedu-repos.md``.
"@
  foreach ($Adapter in @(".agents", ".codex")) {
    $Dir = Join-Path $Project $Adapter
    New-Item -ItemType Directory -Force -Path $Dir | Out-Null
    [System.IO.File]::WriteAllText((Join-Path $Dir "AGENTS.md"), $PointerText)
  }
  $RootAgents = Join-Path $Project "AGENTS.md"
  if (-not (Test-Path $RootAgents)) {
    [System.IO.File]::WriteAllText($RootAgents, $PointerText)
  }
}

function Remove-StaleBackups {
  param([string]$ParentDir)
  if (-not (Test-Path $ParentDir)) { return }
  Get-ChildItem -LiteralPath $ParentDir -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -like "5fedu.backup-*" } |
    ForEach-Object {
      Remove-Item -LiteralPath $_.FullName -Recurse -Force
      Write-Host "Removed stale backup: $($_.FullName)"
    }
}

function Write-TemplateManagedManifest {
  param(
    [string[]]$ManagedPaths,
    [string]$TargetDir
  )
  $Manifest = [ordered]@{
    version = 1
    generatedAt = (Get-Date -Format 'yyyy-MM-ddTHH:mm:ss')
    note = "Paths overwritten by 08-install-5fedu-context.ps1. project-local/ is never managed."
    paths = @($ManagedPaths | Sort-Object -Unique)
  }
  $Json = $Manifest | ConvertTo-Json -Depth 4
  [System.IO.File]::WriteAllText((Join-Path $TargetDir ".template-managed.json"), $Json)
}

if ($UpdatePointersOnly) {
  if (-not (Test-Path $Target)) { throw "No context/5fedu in project - run full install first or use -Force on empty." }
  Set-ProjectPointers
  Write-Host "Updated pointers only (context preserved): $Target"
  exit 0
}

if ((Test-Path $Target) -and -not $Force) {
  throw "Context already exists: $Target. Use -UpdatePointersOnly or -Force (overwrites template files only, preserves project-local/)."
}

if (-not $SkipPrompts) {
  Write-Host "5fedu context install (no-wipe):"
  Write-Host "  Project  : $Project"
  Write-Host "  Profile  : $Profile"
  Write-Host "  Template : $TemplateUrl"
  Write-Host "  Stack    : $Stack"
  Write-Host "  Force    : $Force"
  $Confirm = Read-Host "Proceed? (y/N)"
  if ($Confirm -notmatch '^[yY]') { throw "Install cancelled." }
}

Remove-StaleBackups -ParentDir $ContextParent

New-Item -ItemType Directory -Force -Path $Target | Out-Null

$Exclude = @()
if ($ProfileConfig -and $ProfileConfig.excludePaths) {
  $Exclude = @($ProfileConfig.excludePaths)
}

$ManagedPaths = @()

Get-ChildItem $Template -Force | ForEach-Object {
  $Name = $_.Name
  if ($Exclude -contains $Name) { return }
  $Dest = Join-Path $Target $Name
  if ($_.PSIsContainer) {
    Copy-Item -LiteralPath $_.FullName -Destination $Dest -Recurse -Force
    Get-ChildItem $Dest -Recurse -File | ForEach-Object {
      $ManagedPaths += $_.FullName.Substring($Target.Length + 1).Replace('\', '/')
    }
  } else {
    Copy-Item -LiteralPath $_.FullName -Destination $Dest -Force
    $ManagedPaths += $Name
  }
}

if ($ProfileConfig -and $ProfileConfig.overlayFrom) {
  $OverlaySrc = Join-Path $Template ($ProfileConfig.overlayFrom -replace "/", "\")
  if (Test-Path $OverlaySrc) {
    $OverlayDest = Join-Path $Target "project-overlay"
    Copy-Item -LiteralPath $OverlaySrc -Destination $OverlayDest -Recurse -Force
    Get-ChildItem $OverlayDest -Recurse -File | ForEach-Object {
      $ManagedPaths += $_.FullName.Substring($Target.Length + 1).Replace('\', '/')
    }
    Write-Host "Overlay copied: $($ProfileConfig.overlayFrom) -> project-overlay/"
  }
}

$MetaLines = @(
  "## Project install metadata",
  "",
  "- Project profile: ``$Profile``",
  "- Template URL: ``$TemplateUrl``",
  "- Stack: ``$Stack``",
  "- Installed: $(Get-Date -Format 'yyyy-MM-dd')",
  "- Install mode: no-wipe (template overwrite only; ``project-local/`` preserved)"
)
if ($ProfileConfig -and $ProfileConfig.installMetadata) {
  foreach ($Prop in $ProfileConfig.installMetadata.PSObject.Properties) {
    $MetaLines += "- $($Prop.Name): ``$($Prop.Value)``"
  }
}
$MetaPath = Join-Path $Target "install-metadata.md"
[System.IO.File]::WriteAllText($MetaPath, ($MetaLines -join "`n"))
$ManagedPaths += "install-metadata.md"

Write-TemplateManagedManifest -ManagedPaths $ManagedPaths -TargetDir $Target

Set-ProjectPointers
Write-Host "Installed 5fedu context (no-wipe): $Target"
Write-Host "Template files overwritten; project-local/ and other non-template paths preserved."
Write-Host "Next: project facts in context/5fedu/project-local/ (not in agent-rules template)."
