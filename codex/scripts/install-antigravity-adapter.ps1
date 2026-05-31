param(
  [Parameter(Mandatory = $true)]
  [string]$ProjectRoot,

  [string]$RulesRoot = "P:\agent-rules",

  [switch]$LegacyAgentSingular = $false,

  [switch]$IncludeDisabledHook = $false
)

$ErrorActionPreference = "Stop"

$adapterRoot = Join-Path $RulesRoot "antigravity"
if (-not (Test-Path $adapterRoot)) {
  throw "Missing Antigravity adapter: $adapterRoot"
}

$project = Resolve-Path $ProjectRoot
$agentsSource = Join-Path $adapterRoot ".agents"
$agentsTarget = Join-Path $project ".agents"

New-Item -ItemType Directory -Force -Path $agentsTarget | Out-Null
Copy-Item "$agentsSource\*" $agentsTarget -Recurse -Force

$scriptTarget = Join-Path $project "scripts"
New-Item -ItemType Directory -Force -Path $scriptTarget | Out-Null
Copy-Item (Join-Path $adapterRoot "scripts\antigravity-preflight.ps1") $scriptTarget -Force

if ($IncludeDisabledHook) {
  Copy-Item (Join-Path $adapterRoot "hooks.json") (Join-Path $agentsTarget "hooks.json") -Force
}

if ($LegacyAgentSingular) {
  $legacyTarget = Join-Path $project ".agent"
  New-Item -ItemType Directory -Force -Path $legacyTarget | Out-Null
  Copy-Item "$agentsSource\*" $legacyTarget -Recurse -Force
}

# Dynamic Codex Skills generator
$codexSkillsPath = "$env:USERPROFILE\.codex\skills"
if (Test-Path $codexSkillsPath) {
  $skills = Get-ChildItem $codexSkillsPath -Directory
  foreach ($skill in $skills) {
    if ($skill.Name -like ".*") { continue }
    
    $wfContent = @'
# {0} Skill

1. Read the skill file in the master rules repository at P:\agent-rules\codex\skills\{0}\SKILL.md or the local runtime at ~/.codex/skills/{0}/SKILL.md.
2. Inspect the current project files or request relevant context before starting work.
3. Execute the skill instructions to fulfill the user's request.
4. If this is a design/UI/UX skill, check and follow the visual examples and templates if referenced.
5. End with files modified, verification details, and final status `PASS`, `PARTIAL`, or `BLOCKED`.
'@ -f $skill.Name
    
    $wfFile = Join-Path $agentsTarget "workflows\$($skill.Name).md"
    $wfFolder = Split-Path $wfFile -Parent
    New-Item -ItemType Directory -Force -Path $wfFolder | Out-Null
    Set-Content -Path $wfFile -Value $wfContent -Force
    
    if ($LegacyAgentSingular) {
      $legacyWfFile = Join-Path $legacyTarget "workflows\$($skill.Name).md"
      $legacyWfFolder = Split-Path $legacyWfFile -Parent
      New-Item -ItemType Directory -Force -Path $legacyWfFolder | Out-Null
      Set-Content -Path $legacyWfFile -Value $wfContent -Force
    }
  }
  Write-Host "[Antigravity] Dynamically generated slash commands for all installed Codex skills."
}

Write-Host "[Antigravity] Installed adapter into $project"
Write-Host "[Antigravity] Primary rules/workflows: $agentsTarget"
Write-Host "[Antigravity] No profile/model config installed; Antigravity runtime manages model/effort."

if ($LegacyAgentSingular) {
  Write-Host "[Antigravity] Legacy mirror: $(Join-Path $project '.agent')"
}

if ($IncludeDisabledHook) {
  Write-Host "[Antigravity] Disabled hook template installed at $(Join-Path $agentsTarget 'hooks.json')"
}
