param([string]$Root = (Split-Path -Parent $PSScriptRoot))
$ErrorActionPreference = "Stop"

$Problems = [System.Collections.Generic.List[string]]::new()

# R1: No 5fedu-* skills should exist in the public skills/ directory
$SkillsDir = Join-Path $Root "skills"
if (Test-Path $SkillsDir) {
  $LeakedSkills = @(Get-ChildItem $SkillsDir -Directory | Where-Object { $_.Name -like "5fedu-*" })
  if ($LeakedSkills.Count -gt 0) {
    $Problems.Add("[LEAK R1] 5fedu skills found in public skills/: $($LeakedSkills.Name -join ', '). Must live in profiles/5fedu/skills/.")
  }
}

# R2: No 5fedu project template in projects/ (except context-template)
$ProjectsDir = Join-Path $Root "projects"
if (Test-Path $ProjectsDir) {
  $LeakedProject = @(Get-ChildItem $ProjectsDir -Directory | Where-Object { $_.Name -eq "5fedu" })
  if ($LeakedProject.Count -gt 0) {
    $Problems.Add("[LEAK R2] 5fedu project template found in projects/. Must live in profiles/5fedu/projects/.")
  }
  $LeakedKnown = Test-Path (Join-Path $ProjectsDir "known-5fedu-repos.md")
  if ($LeakedKnown) {
    $Problems.Add("[LEAK R2] known-5fedu-repos.md found in projects/. Must live in profiles/5fedu/known-repos.md.")
  }
}

# R3: Profile-owned scripts not in automation/ root
$AutomationDir = Join-Path $Root "automation"
$ProfileScriptPrefixes = @("08-install-5fedu-context", "10-export-5fedu-writeback", "audit-5fedu", "migrate-nostime", "migrate-tahapp")
foreach ($Prefix in $ProfileScriptPrefixes) {
  $Match = @(Get-ChildItem $AutomationDir -File -Filter "$Prefix*" -ErrorAction SilentlyContinue)
  if ($Match.Count -gt 0) {
    $Problems.Add("[LEAK R3] Profile-owned script found in automation/: $($Match[0].Name). Must live in profiles/5fedu/automation/.")
  }
}

# R4: Profile-owned automation profiles not in automation/profiles/
$ProfileProfilesDir = Join-Path $AutomationDir "profiles"
if (Test-Path $ProfileProfilesDir) {
  $LeakedProfiles = @(Get-ChildItem $ProfileProfilesDir -File | Where-Object { $_.Name -in @("nostime.json", "tah-app.json") })
  if ($LeakedProfiles.Count -gt 0) {
    $Problems.Add("[LEAK R4] Profile-owned profiles found in automation/profiles/: $($LeakedProfiles.Name -join ', '). Must live in profiles/5fedu/automation/profiles/.")
  }
}

# R5: Profile directory structure is correct
$ProfileDir = Join-Path $Root "profiles"
if (-not (Test-Path $ProfileDir)) {
  $Problems.Add("[LEAK R5] Missing profiles/ directory.")
} else {
  $ProfileManifest = Join-Path $ProfileDir "manifest.yaml"
  if (-not (Test-Path $ProfileManifest)) {
    $Problems.Add("[LEAK R5] Missing profiles/manifest.yaml.")
  }
  $FivefeduDir = Join-Path $ProfileDir "5fedu"
  if (Test-Path $FivefeduDir) {
    $ProfileYaml = Join-Path $FivefeduDir "profile.yaml"
    if (-not (Test-Path $ProfileYaml)) {
      $Problems.Add("[LEAK R5] Missing profiles/5fedu/profile.yaml.")
    }
  }
}

if ($Problems.Count -gt 0) {
  foreach ($P in $Problems) { Write-Error $P }
  exit 1
}

Write-Host "5fedu leakage check PASS"
exit 0
