param([ValidateSet("codex","grok","antigravity","all")][string]$Platform = "all")
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
& (Join-Path $PSScriptRoot "build-runtime.ps1") -Root $Root
$Map = @{
  codex = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $env:USERPROFILE ".codex" }
  grok = if ($env:GROK_HOME) { $env:GROK_HOME } else { Join-Path $env:USERPROFILE ".grok" }
  antigravity = Join-Path $env:USERPROFILE ".gemini\config"
}
$Selected = if ($Platform -eq "all") { @("codex","grok","antigravity") } else { @($Platform) }
foreach ($Name in $Selected) {
  $Source = Join-Path $Root "build\$Name"
  $Dest = $Map[$Name]
  New-Item -ItemType Directory -Force -Path $Dest | Out-Null

  $PreviousManifest = Join-Path $Dest "agent-rules-manifest.json"
  if (Test-Path $PreviousManifest) {
    $Previous = Get-Content -Raw $PreviousManifest | ConvertFrom-Json
    foreach ($Item in $Previous.files) {
      if ($Item.path -like "skills/*") {
        $OldTarget = Join-Path $Dest ($Item.path -replace "/", [IO.Path]::DirectorySeparatorChar)
        if (Test-Path $OldTarget) { Remove-Item -LiteralPath $OldTarget -Recurse -Force }
      }
    }
  }

  $RulesTarget = Join-Path $Dest "rules"
  New-Item -ItemType Directory -Force -Path $RulesTarget | Out-Null
  Get-ChildItem $RulesTarget -File -Filter "*.md" -ErrorAction SilentlyContinue | Remove-Item -Force
  Copy-Item -Path (Join-Path $Source "rules\*") -Destination $RulesTarget -Recurse -Force

  $SkillsTarget = Join-Path $Dest "skills"
  New-Item -ItemType Directory -Force -Path $SkillsTarget | Out-Null
  Get-ChildItem (Join-Path $Source "skills") -Directory | ForEach-Object {
    $TargetSkill = Join-Path $SkillsTarget $_.Name
    if (Test-Path $TargetSkill) { Remove-Item -LiteralPath $TargetSkill -Recurse -Force }
    Copy-Item -Path $_.FullName -Destination $TargetSkill -Recurse -Force
  }
  Copy-Item (Join-Path $Source "manifest.json") (Join-Path $Dest "agent-rules-manifest.json") -Force

  if ($Name -eq "codex") {
    $DocsTarget = Join-Path $Dest "docs"
    if (Test-Path $DocsTarget) { Remove-Item -LiteralPath $DocsTarget -Recurse -Force }
    New-Item -ItemType Directory -Force -Path $DocsTarget | Out-Null
    Copy-Item -Path (Join-Path $Root "docs\*") -Destination $DocsTarget -Recurse -Force

    $ProfilesSource = Join-Path $Root "platforms\codex\profiles"
    if (Test-Path $ProfilesSource) {
      $ProfilesTarget = Join-Path $Dest "agents"
      if (Test-Path $ProfilesTarget) { Remove-Item -LiteralPath $ProfilesTarget -Recurse -Force }
      New-Item -ItemType Directory -Force -Path $ProfilesTarget | Out-Null
      Copy-Item -Path (Join-Path $ProfilesSource "*") -Destination $ProfilesTarget -Recurse -Force
    }
  }

  Write-Host "Installed $Name -> $Dest"
}
