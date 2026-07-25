param(
  [string]$Root = (Split-Path -Parent $PSScriptRoot),
  [string]$OutputDir = (Join-Path (Split-Path -Parent $PSScriptRoot) "05-generated")
)

$ErrorActionPreference = "Stop"

$RefDir = Join-Path $OutputDir "references"
if (-not (Test-Path $RefDir)) { New-Item -ItemType Directory -Force -Path $RefDir | Out-Null }

function Write-ReferenceDoc($Path, $Title, $Body) {
  $Rel = $Path.Substring($Root.Length + 1) -replace "\\", "/"
  $Now = Get-Date -Format "yyyy-MM-dd HH:mm UTC"
  $Header = "# " + $Title + "`r`n`r`n"
  $Header = $Header + "**DO NOT EDIT** " + "- Generated file. Source: " + $Rel + ".`r`n"
  $Header = $Header + "Last generated: " + $Now + "`r`n`r`n"
  $Header + $Body | Out-File -Encoding utf8 -LiteralPath $Path
  Write-Host "  wrote $Rel"
}

# Store variables for interpolation-safe use
$RootLen = $Root.Length + 1

# ── 1. Integration registry reference ───────────────────────────────────
$RegistryPath = Join-Path $Root "integrations\registry.json"
if (Test-Path $RegistryPath) {
  $Reg = Get-Content -Raw $RegistryPath | ConvertFrom-Json
  $Lines = New-Object System.Collections.ArrayList
  [void]$Lines.Add("| ID | Policy | Kind | Install Type | Profiles | Trust | Capabilities | Native Hosts |")
  [void]$Lines.Add("|---|---|---|---|---|---|---|---|")
  foreach ($T in $Reg.integrations) {
    $Profiles = "—"
    if ($T.profiles) { $Profiles = ($T.profiles -join ", ") }
    $Caps = "—"
    if ($T.capabilities) { $Caps = ($T.capabilities -join ", ") }
    $Hosts = "—"
    if ($T.nativeHosts -and @($T.nativeHosts).Count -gt 0) { $Hosts = ($T.nativeHosts -join ", ") }
    $Row = "| " + $T.id + " | " + $T.policy + " | " + $T.kind + " | " + $T.install.type + " | " + $Profiles + " | " + $T.trust + " | " + $Caps + " | " + $Hosts + " |"
    [void]$Lines.Add($Row)
  }
  [void]$Lines.Add("")
  [void]$Lines.Add("**Profiles:**")
  [void]$Lines.Add("")
  [void]$Lines.Add("| Profile | Description | Required | Recommended |")
  [void]$Lines.Add("|---|---|---|---|")
  $PNames = $Reg.profiles | Get-Member -MemberType Properties | Select-Object -ExpandProperty Name
  foreach ($PName in $PNames) {
    $P = $Reg.profiles.$PName
    $Req = "—"
    if ($P.required -and @($P.required).Count -gt 0) { $Req = ($P.required -join ", ") }
    $Rec = "—"
    if ($P.recommended -and @($P.recommended).Count -gt 0) { $Rec = ($P.recommended -join ", ") }
    $Row = "| " + $PName + " | " + $P.description + " | " + $Req + " | " + $Rec + " |"
    [void]$Lines.Add($Row)
  }
  $Body = $Lines -join "`r`n"
  Write-ReferenceDoc (Join-Path $RefDir "integration-registry.md") "Integration Registry" $Body
}

# ── 2. Platform homes reference ─────────────────────────────────────────
$PlatformRoot = Join-Path $Root "platforms"
$PLines = New-Object System.Collections.ArrayList
[void]$PLines.Add("| Platform | Overlay | Install Home | MCP Config | MCP Format |")
[void]$PLines.Add("|---|---|---|---|---|")
Get-ChildItem $PlatformRoot -Directory | ForEach-Object {
  $RPath = Join-Path $_.FullName "runtime.yaml"
  if (Test-Path $RPath) {
    $RYaml = Get-Content -Raw $RPath
    $PF = ""; $Home = ""; $MCP = ""; $MCPFmt = ""
    if ($RYaml -match "platform:\s*(.+)") { $PF = $Matches[1].Trim() }
    if ($RYaml -match "runtime_home:\s*(.+)") { $Home = $Matches[1].Trim() }
    if ($RYaml -match "mcp_config:\s*(.+)") { $MCP = $Matches[1].Trim() }
    if ($RYaml -match "mcp_format:\s*(.+)") { $MCPFmt = $Matches[1].Trim() }
    $Overlay = $PF + "-overlay.md"
    $Row = "| " + $PF + " | " + $Overlay + " | " + $Home + " | " + $MCP + " | " + $MCPFmt + " |"
    [void]$PLines.Add($Row)
  }
}
$Body = $PLines -join "`r`n"
Write-ReferenceDoc (Join-Path $RefDir "platform-homes.md") "Platform Homes" $Body

# ── 3. Capability matrix ────────────────────────────────────────────────
$CLines = New-Object System.Collections.ArrayList
[void]$CLines.Add("**Platform status (from canonical capability guide)**")
[void]$CLines.Add("")
[void]$CLines.Add("| Product | Status | Implemented | Notes |")
[void]$CLines.Add("|---|---|---|---|")
[void]$CLines.Add("| Codex | supported | yes | Native agents, hooks, Plan Mode, MCP |")
[void]$CLines.Add("| Antigravity | supported | yes | Antigravity-native agents, skill gate hooks, browser/MCP tools |")
[void]$CLines.Add("| Cursor | supported | yes | Cursor rules, hooks, native agents (Markdown) |")
[void]$CLines.Add("| Grok | supported | yes | Grok agents (TOML), personas, inject rules, skill gate |")
[void]$CLines.Add("| OpenCode | planned | no | Adapter not yet implemented |")
[void]$CLines.Add("")
[void]$CLines.Add("**Status values:** native | emulated | unsupported | unverified")
[void]$CLines.Add("")
[void]$CLines.Add("See full matrix with per-dimension status: guides/06-platform-capability.md")
$Body = $CLines -join "`r`n"
Write-ReferenceDoc (Join-Path $RefDir "capability-matrix.md") "Capability Matrix" $Body

# ── 4. Skill index ──────────────────────────────────────────────────────
$SkillRoot = Join-Path $Root "skills"
$SLines = New-Object System.Collections.ArrayList
[void]$SLines.Add("| Slug | Priority | Max Route Tokens | Description |")
[void]$SLines.Add("|---|---|---|---|")
$Skipped = @("docs-style", "plan-and-handoff", "finish-to-completion", "code-review")
Get-ChildItem $SkillRoot -Directory | Sort-Object Name | ForEach-Object {
  $SPath = Join-Path $_.FullName "SKILL.md"
  if (Test-Path $SPath) {
    $Slug = $_.Name
    $Content = Get-Content -Raw $SPath
    $Priority = ""; $Tokens = ""; $Desc = ""
    if ($Content -match '(?ms)---\s*\npriority:\s*(\d+)') { $Priority = $Matches[1] }
    if ($Content -match '(?ms)---\s*\n.*?max_route_tokens:\s*(\d+)') { $Tokens = $Matches[1] }
    $DescLine = ($Content -split "`n" | Select-Object -First 1) -replace "^#\s*", ""
    if (-not $DescLine) { $DescLine = $Slug }
    if ($Skipped -contains $Slug) { $DescLine = $DescLine + " (intentional oversize)" }
    $Row = "| " + $Slug + " | " + $Priority + " | " + $Tokens + " | " + $DescLine + " |"
    [void]$SLines.Add($Row)
  }
}
$Body = $SLines -join "`r`n"
Write-ReferenceDoc (Join-Path $RefDir "skill-index.md") "Skill Index" $Body

# ── 5. Rule index ───────────────────────────────────────────────────────
$ManifestPath = Join-Path $Root "rules\manifest.yaml"
if (Test-Path $ManifestPath) {
  $Manifest = Get-Content -Raw $ManifestPath
  $RLines = New-Object System.Collections.ArrayList
  [void]$RLines.Add("| Order | Rule |")
  [void]$RLines.Add("|---|---|")
  $Idx = 1
  if ($Manifest -match '(?ms)load_order:\s*\r?\n((?:[ \t]+-\s+\S+\r?\n)+)') {
    $Block = $Matches[1]
    foreach ($Line in ($Block -split "`n")) {
      if ($Line -match "-\s*(\S+)") {
        $RN = $Matches[1]
        [void]$RLines.Add("| " + $Idx + " | " + $RN + " |")
        $Idx++
      }
    }
  }
  [void]$RLines.Add("")
  [void]$RLines.Add("**Global budgets:**")
  if ($Manifest -match '(?ms)budgets:\s*\r?\n((?:[ \t]+\w+:\s*\S+\r?\n)+)') {
    $BBody = $Matches[1]
    foreach ($Line in ($BBody -split "`n")) {
      if ($Line -match '\s+(\w+):\s*(\S+)') {
        [void]$RLines.Add("- " + $Matches[1] + ": " + $Matches[2])
      }
    }
  }
  $Body = $RLines -join "`r`n"
  Write-ReferenceDoc (Join-Path $RefDir "rule-index.md") "Rule Index" $Body
}

# ── 6. Profile index ────────────────────────────────────────────────────
$ProfManifest = Join-Path $Root "profiles\manifest.yaml"
$ProfLines = New-Object System.Collections.ArrayList
[void]$ProfLines.Add("| Profile | Display Name | Enabled By Default | Platforms |")
[void]$ProfLines.Add("|---|---|---|---|")
if (Test-Path $ProfManifest) {
  $PManifest = Get-Content -Raw $ProfManifest
  $Current = $null; $PName = ""; $DName = ""; $Enabled = ""; $Plats = ""
  foreach ($Line in ($PManifest -split "`n")) {
    if ($Line -match "^\s+(\w[\w-]*):") {
      if ($Current) { [void]$ProfLines.Add("| " + $PName + " | " + $DName + " | " + $Enabled + " | " + $Plats + " |") }
      $Current = $Matches[1]; $PName = $Current; $DName = ""; $Enabled = ""; $Plats = ""
    } elseif ($Line -match "displayName:\s*(.+)") { $DName = $Matches[1].Trim() }
    elseif ($Line -match "enabledByDefault:\s*(.+)") { $Enabled = $Matches[1].Trim() }
    elseif ($Line -match "platforms:\s*\[(.+)\]") { $Plats = $Matches[1].Trim() }
  }
  if ($Current) { [void]$ProfLines.Add("| " + $PName + " | " + $DName + " | " + $Enabled + " | " + $Plats + " |") }
}
$Body = $ProfLines -join "`r`n"
Write-ReferenceDoc (Join-Path $RefDir "profile-index.md") "Profile Index" $Body

# ── 7. Deprecation list ─────────────────────────────────────────────────
$DepLines = New-Object System.Collections.ArrayList
[void]$DepLines.Add("| Old Name / Path | Replacement | Source |")
[void]$DepLines.Add("|---|---|---|")

$LegacyMap = Join-Path $Root "automation\legacy-context-path-map.json"
if (Test-Path $LegacyMap) {
  $Map = Get-Content -Raw $LegacyMap | ConvertFrom-Json
  $Map.PSObject.Properties | Sort-Object Name | ForEach-Object {
    [void]$DepLines.Add("| " + $_.Name + " | " + $_.Value + " | legacy-context-path-map.json |")
  }
}

$RegPath2 = Join-Path $Root "integrations\registry.json"
if (Test-Path $RegPath2) {
  $Reg2 = Get-Content -Raw $RegPath2 | ConvertFrom-Json
  foreach ($T in $Reg2.integrations) {
    if ($T.deprecatedAliases -and @($T.deprecatedAliases).Count -gt 0) {
      foreach ($Alias in $T.deprecatedAliases) {
        [void]$DepLines.Add("| " + $Alias + " (alias) | " + $T.id + " | integration registry |")
      }
    }
  }
}

[void]$DepLines.Add("| plans/ (legacy folder) | .agent/plans/ | validate-context.ps1 |")
[void]$DepLines.Add("| 00-index.md (legacy always-on) | 00-bootstrap.md | validate-context.ps1 |")
[void]$DepLines.Add("| Gemini CLI (product reference) | Antigravity (runtime binary is gemini) | guides/06-platform-capability.md |")

$Body = $DepLines -join "`r`n"
Write-ReferenceDoc (Join-Path $RefDir "deprecation-list.md") "Deprecation List" $Body

# ── Summary ─────────────────────────────────────────────────────────────
$Count = (Get-ChildItem $RefDir -Filter "*.md" | Measure-Object).Count
$RelDir = $RefDir.Substring($Root.Length + 1) -replace "\\", "/"
Write-Host "Generated $Count reference documents in $RelDir/"
