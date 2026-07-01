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

$LegacyContext = Test-Path (Join-Path $Target "00-index.md")
$NewLayout = Test-Path (Join-Path $Target "00-context-map.md")
$PointerEntry = if ($LegacyContext) { "context/5fedu/00-index.md" } elseif ($NewLayout) { "context/5fedu/AGENTS.md" } else { "context/5fedu/AGENTS.md" }

$Pointer = @"
# Project context pointer

Canonical project context: ``$PointerEntry``.

Load from **this repo only** — never from ``agent-rules/projects/5fedu/`` (template source).

Known 5fedu repos: tah-app, nostime — see agent-rules ``projects/known-5fedu-repos.md``.
"@

function Set-ProjectPointers {
  foreach ($Adapter in @(".agents", ".codex")) {
    $Dir = Join-Path $Project $Adapter
    New-Item -ItemType Directory -Force -Path $Dir | Out-Null
    Set-Content -Encoding utf8NoBOM -LiteralPath (Join-Path $Dir "AGENTS.md") -Value $Pointer
  }
}

if ($UpdatePointersOnly) {
  if (-not (Test-Path $Target)) { throw "No context/5fedu in project — run full install first or use -Force on empty." }
  Set-ProjectPointers
  Write-Host "Updated pointers only (context preserved): $Target"
  exit 0
}

if ((Test-Path $Target) -and -not $Force) {
  throw "Context already exists: $Target. Use -UpdatePointersOnly or -Force (creates backup)."
}

if (-not $SkipPrompts) {
  Write-Host "5fedu context install:"
  Write-Host "  Project  : $Project"
  Write-Host "  Profile  : $Profile"
  Write-Host "  Template : $TemplateUrl"
  Write-Host "  Stack    : $Stack"
  Write-Host "  Force    : $Force"
  $Confirm = Read-Host "Proceed? (y/N)"
  if ($Confirm -notmatch '^[yY]') { throw "Install cancelled." }
}

if ($Force -and (Test-Path $Target)) {
  $Backup = "$Target.backup-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
  Move-Item -LiteralPath $Target -Destination $Backup
  Write-Host "Backed up existing context: $Backup"
}

New-Item -ItemType Directory -Force -Path $Target | Out-Null

$Exclude = @()
if ($ProfileConfig -and $ProfileConfig.excludePaths) {
  $Exclude = @($ProfileConfig.excludePaths)
}

Get-ChildItem $Template -Force | ForEach-Object {
  $Name = $_.Name
  if ($Exclude -contains $Name) { return }
  $Dest = Join-Path $Target $Name
  if ($_.PSIsContainer) {
    Copy-Item -LiteralPath $_.FullName -Destination $Dest -Recurse -Force
  } else {
    Copy-Item -LiteralPath $_.FullName -Destination $Dest -Force
  }
}

if ($ProfileConfig -and $ProfileConfig.overlayFrom) {
  $OverlaySrc = Join-Path $Template ($ProfileConfig.overlayFrom -replace "/", "\")
  if (Test-Path $OverlaySrc) {
    $OverlayDest = Join-Path $Target "project-overlay"
    Copy-Item -LiteralPath $OverlaySrc -Destination $OverlayDest -Recurse -Force
    Write-Host "Overlay copied: $($ProfileConfig.overlayFrom) -> project-overlay/"
  }
}

$MetaLines = @(
  "## Project install metadata",
  "",
  "- Project profile: ``$Profile``",
  "- Template URL: ``$TemplateUrl``",
  "- Stack: ``$Stack``",
  "- Installed: $(Get-Date -Format 'yyyy-MM-dd')"
)
if ($ProfileConfig -and $ProfileConfig.installMetadata) {
  foreach ($Prop in $ProfileConfig.installMetadata.PSObject.Properties) {
    $MetaLines += "- $($Prop.Name): ``$($Prop.Value)``"
  }
}
Set-Content -Encoding utf8NoBOM -LiteralPath (Join-Path $Target "install-metadata.md") -Value ($MetaLines -join "`n")

Set-ProjectPointers
Write-Host "Installed 5fedu context: $Target"
Write-Host "Next: fill project-specific decisions in context/5fedu/ (not in agent-rules template)."
