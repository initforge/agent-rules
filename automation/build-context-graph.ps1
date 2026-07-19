param(
  [string]$Root = (Split-Path -Parent $PSScriptRoot),
  [string]$OutputPath = (Join-Path $Root "05-generated\context-graph.json")
)

$ErrorActionPreference = "Stop"

function Normalize-Path([string]$Path) {
  return $Path.Replace('\', '/')
}

function Estimate-Tokens([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) { return 0 }
  $Text = (Get-Content -Raw -Encoding UTF8 -LiteralPath $Path).Replace("`r`n", "`n").Replace("`r", "`n")
  return [math]::Ceiling($Text.Length / 3.6)
}

function Source-Hash([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) { return ("0" * 64) }
  return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Path-Slug([string]$Path) {
  return ((Normalize-Path $Path) -replace '[^A-Za-z0-9]+', ':').Trim(':').ToLowerInvariant()
}

function Frontmatter-Value([string]$Body, [string]$Key) {
  $Match = [regex]::Match($Body, "(?m)^$([regex]::Escape($Key)):\s*(.+)$")
  if ($Match.Success) { return $Match.Groups[1].Value.Trim().Trim('"') }
  return $null
}

function Frontmatter-Routing([string]$Body) {
  $Match = [regex]::Match($Body, '(?m)^routing:\s*(\{.*\})\s*$')
  if (-not $Match.Success) { return $null }
  try { return ($Match.Groups[1].Value | ConvertFrom-Json) } catch { return $null }
}

function Default-Routing([string]$Source, [string]$Policy) {
  $Routing = [ordered]@{
    signals = @()
    intent_signals = @()
    excludes = @()
    priority = 0
    loads = @()
    requires = @()
    supports = @()
    project_scope = ""
    platform_scope = ""
    max_route_tokens = 0
    default = ($Policy -eq "always")
  }
  $Lower = $Source.ToLowerInvariant()
  if ($Lower -like "*projects/5fedu/00-context-map.md") {
    $Routing.signals = @("5fedu", "context/5fedu", "tah-app", "nostime")
    $Routing.intent_signals = @("5fedu_setup", "5fedu_context")
    $Routing.priority = 30
    $Routing.loads = @("project:5fedu:router")
    $Routing.project_scope = "5fedu"
  } elseif ($Lower -like "*projects/5fedu/domains/module-mapping.md" -or $Lower -like "*projects/5fedu/domains/ui-delivery.md") {
    $Routing.signals = @("5fedu ui", "drawer", "listview", "parity", "ERP module")
    $Routing.intent_signals = @("5fedu_ui")
    $Routing.priority = 70
    $Routing.project_scope = "5fedu"
  } elseif ($Lower -like "*projects/5fedu/domains/references/*") {
    $Routing.signals = @("detail", "navigation", "verify", "surface")
    $Routing.intent_signals = @("5fedu_detail")
    $Routing.priority = 40
    $Routing.project_scope = "5fedu"
  } elseif ($Lower -like "*projects/5fedu/domains/database.md") {
    $Routing.signals = @("migration", "rls", "schema", "int8", "uuid", "foreign key", "index")
    $Routing.intent_signals = @("5fedu_database")
    $Routing.priority = 60
    $Routing.project_scope = "5fedu"
  } elseif ($Lower -like "*projects/5fedu/domains/permissions.md") {
    $Routing.signals = @("permission", "phân quyền", "cap_bac", "quyền xem", "quyền sửa", "quyền xóa", "quản trị")
    $Routing.intent_signals = @("5fedu_permissions")
    $Routing.priority = 60
    $Routing.project_scope = "5fedu"
  } elseif ($Lower -like "*projects/5fedu/domains/business.md") {
    $Routing.signals = @("master-detail", "duyệt", "rollup", "export", "báo cáo", "thống kê", "excel", "pdf")
    $Routing.intent_signals = @("5fedu_business")
    $Routing.priority = 50
    $Routing.project_scope = "5fedu"
  }
  return [pscustomobject]$Routing
}

function Add-Node([System.Collections.Generic.List[object]]$Nodes, [string]$Id, [string]$Layer, [string]$Source, [string]$Policy, [string]$Owner, [string]$Trigger, [string[]]$Requires = @(), $Routing = $null) {
  $SourcePath = Join-Path $Root ($Source -replace '/', '\')
  if (-not $Routing) { $Routing = Default-Routing $Source $Policy }
  $Nodes.Add([ordered]@{
    id = $Id
    layer = $Layer
    source = (Normalize-Path $Source)
    load_policy = $Policy
    owner = $Owner
    trigger = if ($Trigger) { $Trigger } else { "path:$Source" }
    requires = @($Requires)
    routing = $Routing
    source_hash = (Source-Hash $SourcePath)
    token_estimate = (Estimate-Tokens $SourcePath)
  }) | Out-Null
}

$Nodes = [System.Collections.Generic.List[object]]::new()
$ManifestPath = Join-Path $Root "rules\manifest.yaml"
$ManifestBody = Get-Content -Raw -Encoding UTF8 $ManifestPath
$LoadOrder = @([regex]::Matches($ManifestBody, '(?m)^\s+-\s+(\S+\.md)\s*$') | ForEach-Object { $_.Groups[1].Value })

foreach ($Rule in Get-ChildItem (Join-Path $Root "rules") -File -Filter "*.md") {
  if ($Rule.Name -eq "README.md") { continue }
  $Rel = "rules/$($Rule.Name)"
  $Body = Get-Content -Raw -Encoding UTF8 $Rule.FullName
  $Policy = if ($LoadOrder -contains $Rule.Name) { "always" } else { "router" }
  Add-Node $Nodes "rule:$($Rule.BaseName)" "rules" $Rel $Policy "rules/$($Rule.Name)" (Frontmatter-Value $Body "description") @() (Frontmatter-Routing $Body)
}

$SkillsRoot = Join-Path $Root "skills"
foreach ($SkillDir in Get-ChildItem $SkillsRoot -Directory) {
  $SkillPath = Join-Path $SkillDir.FullName "SKILL.md"
  if (-not (Test-Path -LiteralPath $SkillPath)) { continue }
  $Body = Get-Content -Raw -Encoding UTF8 $SkillPath
  $SkillId = $SkillDir.Name
  $SkillRouting = Frontmatter-Routing $Body
  if (-not $SkillRouting) { throw "Missing structured routing metadata: skills/$SkillId/SKILL.md" }
  Add-Node $Nodes "skill:$SkillId" "skills" "skills/$SkillId/SKILL.md" "skill" "skills/$SkillId/SKILL.md" (Frontmatter-Value $Body "description") @() $SkillRouting
  $RefRoot = Join-Path $SkillDir.FullName "references"
  if (Test-Path -LiteralPath $RefRoot) {
    foreach ($Ref in Get-ChildItem $RefRoot -Recurse -File) {
      $RefRel = Normalize-Path ($Ref.FullName.Substring($Root.Length + 1))
      Add-Node $Nodes ("reference:{0}:{1}" -f $SkillId, (Path-Slug $RefRel)) "skills-reference" $RefRel "reference" "skills/$SkillId/SKILL.md" "requires:$SkillId"
    }
  }
}

$ProjectsRoot = Join-Path $Root "projects"
if (Test-Path -LiteralPath $ProjectsRoot) {
  foreach ($ProjectDir in Get-ChildItem $ProjectsRoot -Directory) {
    $ProjectName = $ProjectDir.Name
    $AgentsPath = Join-Path $ProjectDir.FullName "AGENTS.md"
    if (Test-Path -LiteralPath $AgentsPath) {
      Add-Node $Nodes ("project:{0}:entry" -f $ProjectName) "project" "projects/$ProjectName/AGENTS.md" "router" "projects/$ProjectName/AGENTS.md" "project:$ProjectName"
    }
    $MapPath = Join-Path $ProjectDir.FullName "00-context-map.md"
    if (Test-Path -LiteralPath $MapPath) {
      Add-Node $Nodes ("project:{0}:router" -f $ProjectName) "project" "projects/$ProjectName/00-context-map.md" "router" "projects/$ProjectName/00-context-map.md" "project:$ProjectName:domain"
    }
    foreach ($File in Get-ChildItem $ProjectDir.FullName -Recurse -File) {
      $Rel = Normalize-Path ($File.FullName.Substring($Root.Length + 1))
      if ($Rel -match '/(archive|evidence)/') { $Policy = "verify-only" }
      elseif ($Rel -match '/references?/') { $Policy = "reference" }
      elseif ($Rel -match '/domains?/') { $Policy = "leaf" }
      else { continue }
      Add-Node $Nodes ("project:{0}:{1}" -f $ProjectName, (Path-Slug $Rel)) "project" $Rel $Policy "projects/$ProjectName/00-context-map.md" "domain:$ProjectName"
    }
  }
}

foreach ($PlatformDir in Get-ChildItem (Join-Path $Root "platforms") -Directory) {
  $Overlay = Join-Path $PlatformDir.FullName "$($PlatformDir.Name)-overlay.md"
  if (Test-Path -LiteralPath $Overlay) {
    Add-Node $Nodes "platform:$($PlatformDir.Name)" "platform" "platforms/$($PlatformDir.Name)/$($PlatformDir.Name)-overlay.md" "platform" "platforms/$($PlatformDir.Name)" "platform:$($PlatformDir.Name)"
  }
}

$GuidesRoot = Join-Path $Root "guides"
if (Test-Path -LiteralPath $GuidesRoot) {
  foreach ($Guide in Get-ChildItem $GuidesRoot -Recurse -File) {
    $Rel = Normalize-Path ($Guide.FullName.Substring($Root.Length + 1))
    Add-Node $Nodes ("guide:{0}" -f (Path-Slug $Rel)) "guide" $Rel "verify-only" "guides" "guide:$($Guide.BaseName)"
  }
}

$IntegrationsRoot = Join-Path $Root "integrations"
if (Test-Path -LiteralPath $IntegrationsRoot) {
  foreach ($Integration in Get-ChildItem $IntegrationsRoot -Recurse -File) {
    $Rel = Normalize-Path ($Integration.FullName.Substring($Root.Length + 1))
    $Policy = if ($Integration.Name -eq "registry.json") { "router" } else { "verify-only" }
    Add-Node $Nodes ("integration:{0}" -f (Path-Slug $Rel)) "integration" $Rel $Policy "integrations/registry.json" "integration:$($Integration.BaseName)"
  }
}

$Graph = [ordered]@{
  version = 2
  generated_from = @("rules/manifest.yaml", "skills/**/SKILL.md", "projects/**/AGENTS.md", "projects/**/00-context-map.md", "platforms/*/*-overlay.md", "integrations/registry.json", "guides/**")
  source_of_truth = @{
    rules = "rules/manifest.yaml"
    skills = "SKILL.md frontmatter routing object"
    projects = "project entrypoint and 00-context-map.md"
    platforms = "platform overlay and runtime.yaml"
  }
  nodes = @($Nodes | Sort-Object layer, id)
}

$OutputDir = Split-Path -Parent $OutputPath
if (-not (Test-Path -LiteralPath $OutputDir)) { New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null }
$Graph | ConvertTo-Json -Depth 8 | Set-Content -Encoding UTF8 -LiteralPath $OutputPath
Write-Host "Context graph generated: $OutputPath ($($Nodes.Count) nodes)"
