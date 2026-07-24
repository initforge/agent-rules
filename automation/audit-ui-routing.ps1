param(
  [string]$Root = (Split-Path -Parent $PSScriptRoot),
  [string]$RunId = "audit-ui-routing",
  [string]$LogPath = ""
)
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "path-compat.ps1")

$Problems = [System.Collections.Generic.List[string]]::new()

function Test-FileContains {
  param([string]$Path, [string[]]$Needles)
  if (-not (Test-Path $Path)) {
    $Problems.Add("Missing file: $Path")
    return $false
  }
  $Body = (Get-Content -Raw -Encoding UTF8 $Path).ToLowerInvariant()
  foreach ($N in $Needles) {
    if ($Body -notlike "*$($N.ToLowerInvariant())*") {
      $Problems.Add("Missing keyword '$N' in $Path")
      return $false
    }
  }
  return $true
}

$SkillPath = Join-Path $Root "skills\5fedu-module-parity\SKILL.md"
Test-FileContains $SkillPath @("làm module mới", "sửa module", "refactor module", "frontend-architect", "pattern-inventory", "shell parity", "variable map") | Out-Null

$FaPath = Join-Path $Root "skills\frontend-architect\SKILL.md"
Test-FileContains $FaPath @("hard stop", "5fedu", "ui-delivery", "tạo", "sửa") | Out-Null

$CtxMap = Join-Path $Root "projects\5fedu\00-context-map.md"
Test-FileContains $CtxMap @("làm module mới", "sửa module", "5fedu-module-parity", "cấm", "frontend-architect", "pattern-inventory") | Out-Null

$ModuleMapping = Join-Path $Root "projects\5fedu\domains\module-mapping.md"
Test-FileContains $ModuleMapping @("clone checklist", "audit checklist", "pattern-inventory", "shell", "variable") | Out-Null

$Rules30 = Join-Path $Root "rules\30-context-routing.md"
Test-FileContains $Rules30 @("project/domain router", "matching leaf context", "capability", "new signal") | Out-Null

$UiDelivery = Join-Path $Root "projects\5fedu\domains\ui-delivery.md"
Test-FileContains $UiDelivery @("tạo mới", "sửa module", "generic", "pattern-inventory", "shell parity") | Out-Null

$Agents = Join-Path $Root "projects\5fedu\AGENTS.md"
Test-FileContains $Agents @("project-local", "tạo", "sửa") | Out-Null

# Pattern inventory is the canonical UI contract. Keep this audit structural so
# changing prose does not silently drop a mandatory parity gate.
$Inventory = Join-Path $Root "projects\5fedu\domains\references\pattern-inventory.yaml"
if (-not (Test-Path $Inventory)) {
  $Problems.Add("Missing pattern inventory: $Inventory")
} else {
  $InvBody = Get-Content -Raw -Encoding UTF8 $Inventory

  foreach ($Section in @("template_source:", "custom_deviation_contract:", "surfaces:", "fidelity_packet_required:")) {
    if ($InvBody -notlike "*$Section*") {
      $Problems.Add("pattern-inventory.yaml must define contract section '$Section'")
    }
  }

  $TemplateContract = @(
    "required: true",
    "active workspace only; never a fixed absolute path",
    "positive_anchors:",
    "If zero candidates, stop",
    "If multiple candidates",
    "snapshot:",
    "precedence:",
    "forbidden_substitutes:",
    "memory, screenshots, remote URLs, or static context"
  )
  foreach ($Requirement in $TemplateContract) {
    if ($InvBody -notlike "*$Requirement*") {
      $Problems.Add("pattern-inventory.yaml template-source gate missing '$Requirement'")
    }
  }

  $DeviationMatch = [regex]::Match($InvBody, "(?ms)^custom_deviation_contract:\r?\n(?<body>.*?)(?=^surfaces:|\z)")
  if (-not $DeviationMatch.Success) {
    $Problems.Add("pattern-inventory.yaml missing custom-deviation contract")
  } else {
    $DeviationBody = $DeviationMatch.Groups["body"].Value
    foreach ($Requirement in @(
      "Exact reference fidelity outside variable slots.",
      "Owner or accepted spec explicitly names the custom behavior.",
      "A project custom never becomes a common 5fedu rule without a separate context decision."
    )) {
      if ($DeviationBody -notlike "*$Requirement*") {
        $Problems.Add("pattern-inventory.yaml custom-deviation contract missing '$Requirement'")
      }
    }
    foreach ($RecordField in @("source", "affected_surface", "changed_invariant", "rationale", "unchanged_invariants", "proof")) {
      if ($DeviationBody -notlike "*$RecordField*") {
        $Problems.Add("pattern-inventory.yaml custom-deviation record missing '$RecordField'")
      }
    }
  }

  $RequiredSurfaceKeys = @("aliases:", "reference:", "template_paths:", "shell_must:", "behavior_must:", "states_must:", "motion_must:", "responsive_must:", "variable_slots:")
  $RequiredSurfaces = @(
    "home-dashboard", "subsystem-dashboard-navigation", "crud-list", "row-actions", "form-drawer",
    "detail-drawer", "stats-tab", "export-dialog", "hierarchy-list", "entity-in-tree",
    "embedded-child-grid", "split-master-detail-tabs", "permission-matrix", "single-record-settings",
    "route-breadcrumb"
  )
  foreach ($Surface in $RequiredSurfaces) {
    $EscapedSurface = [regex]::Escape($Surface)
    $SurfaceMatch = [regex]::Match($InvBody, "(?ms)^  ${EscapedSurface}:\r?\n(?<body>.*?)(?=^  [a-z0-9-]+:|^fidelity_packet_required:|\z)")
    if (-not $SurfaceMatch.Success) {
      $Problems.Add("pattern-inventory.yaml missing required surface '$Surface'")
      continue
    }
    $SurfaceBody = $SurfaceMatch.Groups["body"].Value
    foreach ($Key in $RequiredSurfaceKeys) {
      if ($SurfaceBody -notlike "*$Key*") {
        $Problems.Add("pattern-inventory.yaml surface '$Surface' missing '$Key'")
      }
    }
    if ($SurfaceBody -match "(?ms)^    motion_must:.*?\[(?<motion>.*?)\]") {
      $MotionMust = $Matches["motion"]
      if ([string]::IsNullOrWhiteSpace($MotionMust)) {
        $Problems.Add("pattern-inventory.yaml surface '$Surface' must define motion behavior")
      }
      if ($MotionMust -notmatch "(?i)reduced[ -]motion") {
        $Problems.Add("pattern-inventory.yaml surface '$Surface' motion_must must explicitly require reduced-motion behavior")
      }
    } else {
      $Problems.Add("pattern-inventory.yaml surface '$Surface' must define motion_must as an inline contract list")
    }
  }

  $BreadcrumbMatch = [regex]::Match($InvBody, "(?ms)^  route-breadcrumb:\r?\n(?<body>.*?)(?=^fidelity_packet_required:|\z)")
  if (-not $BreadcrumbMatch.Success) {
    $Problems.Add("pattern-inventory.yaml missing route-breadcrumb surface")
  } else {
    $BreadcrumbBody = $BreadcrumbMatch.Groups["body"].Value
    foreach ($Requirement in @(
      "registered route label and parent hierarchy",
      "Vietnamese product labels retain full diacritics",
      "route registry is updated with sidebar, guard, permission matrix, module key, and destination",
      "product labels must not depend on slug capitalization fallback",
      "unknown route is an explicit configuration defect, not a user-facing generated label"
    )) {
      if ($BreadcrumbBody -notlike "*$Requirement*") {
        $Problems.Add("pattern-inventory.yaml route-breadcrumb semantic contract missing '$Requirement'")
      }
    }
  }

  foreach ($PacketField in @(
    "template_identity_and_snapshot", "target_surface_and_reference_paths", "target_paths",
    "shell_behavior_state_motion_responsive_map", "variable_map_with_schema_or_spec_source",
    "approved_deviations", "verification_evidence"
  )) {
    if ($InvBody -notlike "*$PacketField*") {
      $Problems.Add("pattern-inventory.yaml fidelity packet missing '$PacketField'")
    }
  }
}

if ($LogPath) {
  $LogDir = Split-Path -Parent $LogPath
  if ($LogDir -and -not (Test-Path $LogDir)) { New-Item -ItemType Directory -Force -Path $LogDir | Out-Null }
  $Entry = [ordered]@{
    runId = $RunId
    timestamp = (Get-Date -Format 'o')
    problemCount = $Problems.Count
    problems = @($Problems)
  }
  # UTF8 works on Windows PowerShell 5.1; UTF8 is PS7+ only.
($Entry | ConvertTo-Json -Depth 4) + "`n" | Add-Content -Encoding UTF8 $LogPath
}

if ($Problems.Count -gt 0) {
  $Problems | ForEach-Object { Write-Error $_ }
  exit 1
}

Write-Host "UI routing audit PASS ($RunId)"
exit 0
