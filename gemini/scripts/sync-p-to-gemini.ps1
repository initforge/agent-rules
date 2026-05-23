param(
  [string]$RulesRoot = "P:\agent-rules",
  [string]$GeminiHome = "$env:USERPROFILE\.gemini",
  [switch]$Backup = $true,
  [switch]$Force = $false
)

$ErrorActionPreference = "Stop"

# Helper for stderr logging so stdout remains clean for hook parsing
function Log-Info($msg) {
  [Console]::Error.WriteLine("[Sync-Gemini] $msg")
}

function Log-Warning($msg) {
  [Console]::Error.WriteLine("[Sync-Gemini] WARNING: $msg")
}

$source = Join-Path $RulesRoot "gemini"
$globalRulesPath = Join-Path $RulesRoot "global-rules.md"
$cleanCodePath = Join-Path $RulesRoot "clean-code.md"
$agOverlayPath = Join-Path $RulesRoot "antigravity-overlay.md"
$outputGeminiMd = Join-Path $GeminiHome "GEMINI.md"

# 1. Determine if we need to sync/compile
$shouldSync = $Force -or -not (Test-Path $outputGeminiMd)

if (-not $shouldSync) {
  # Check if source rules are newer than outputGeminiMd
  $targetTime = (Get-Item $outputGeminiMd).LastWriteTime
  $sources = @($globalRulesPath, $cleanCodePath, $agOverlayPath)
  
  foreach ($src in $sources) {
    if (Test-Path $src) {
      if ((Get-Item $src).LastWriteTime -gt $targetTime) {
        $shouldSync = $true
        Log-Info "$($src | Split-Path -Leaf) is newer than GEMINI.md. Triggering sync/recompile."
        break
      }
    }
  }
}

if (-not $shouldSync) {
  # Check if any config source in P is newer than local config
  $configsToCheck = @(
    @{ Src = Join-Path $source "mcp_config.json"; Dest = Join-Path $GeminiHome "config\mcp_config.json" },
    @{ Src = Join-Path $source "hooks.json"; Dest = Join-Path $GeminiHome "config\hooks.json" },
    @{ Src = Join-Path $source "settings.json"; Dest = Join-Path $GeminiHome "settings.json" },
    @{ Src = Join-Path $source "antigravity-cli-settings.json"; Dest = Join-Path $GeminiHome "antigravity-cli\settings.json" }
  )
  
  foreach ($cfg in $configsToCheck) {
    if (Test-Path $cfg.Src) {
      if (-not (Test-Path $cfg.Dest)) {
        $shouldSync = $true
        Log-Info "Local config $($cfg.Dest) is missing. Triggering sync."
        break
      } elseif ((Get-Item $cfg.Src).LastWriteTime -gt (Get-Item $cfg.Dest).LastWriteTime) {
        $shouldSync = $true
        Log-Info "Source config $($cfg.Src | Split-Path -Leaf) is newer than local config. Triggering sync."
        break
      }
    }
  }
}

if (-not $shouldSync) {
  # Check if sync scripts themselves are newer
  $scriptsSrc = Join-Path $source "scripts"
  if (Test-Path $scriptsSrc) {
    $scriptFiles = Get-ChildItem $scriptsSrc -Filter *.ps1
    foreach ($sf in $scriptFiles) {
      $localSf = Join-Path $GeminiHome "config\scripts\$($sf.Name)"
      if (-not (Test-Path $localSf)) {
        $shouldSync = $true
        Log-Info "Local script $($sf.Name) is missing. Triggering sync."
        break
      } elseif ($sf.LastWriteTime -gt (Get-Item $localSf).LastWriteTime) {
        $shouldSync = $true
        Log-Info "Source script $($sf.Name) is newer. Triggering sync."
        break
      }
    }
  }
}

if (-not $shouldSync) {
  # Everything is up to date, skip sync and exit instantly
  Log-Info "Rules are up to date. Skipping sync."
  Write-Output '{"decision": "allow"}'
  exit 0
}

# 2. Perform restoration/sync if needed
if (-not (Test-Path $source)) {
  Log-Warning "Source directory not found: $source. Will proceed with rules compilation only."
} else {
  $ts = Get-Date -Format "yyyyMMdd-HHmmss"

  # Ensure local directories exist
  New-Item -ItemType Directory -Force -Path (Join-Path $GeminiHome "config\scripts") | Out-Null
  New-Item -ItemType Directory -Force -Path (Join-Path $GeminiHome "antigravity-cli") | Out-Null

  # Backup local config.json, mcp_config.json, settings.json, hooks.json
  if ($Backup) {
    $backupDir = "$GeminiHome.bak.$ts"
    New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
    
    $localFilesToBackup = @(
      @{ Path = Join-Path $GeminiHome "config\mcp_config.json"; Name = "mcp_config.json" },
      @{ Path = Join-Path $GeminiHome "config\hooks.json"; Name = "hooks.json" },
      @{ Path = Join-Path $GeminiHome "settings.json"; Name = "settings.json" },
      @{ Path = Join-Path $GeminiHome "antigravity-cli\settings.json"; Name = "antigravity-cli-settings.json" },
      @{ Path = $outputGeminiMd; Name = "GEMINI.md" }
    )
    
    foreach ($fb in $localFilesToBackup) {
      if (Test-Path $fb.Path) {
        Copy-Item $fb.Path (Join-Path $backupDir $fb.Name) -Force
      }
    }
    
    $localScripts = Join-Path $GeminiHome "config\scripts"
    if (Test-Path $localScripts) {
      Copy-Item $localScripts $backupDir -Recurse -Force
    }
    Log-Info "Created backup at $backupDir"
  }

  # Restore files from P
  $configsToRestore = @(
    @{ Src = Join-Path $source "mcp_config.json"; Dest = Join-Path $GeminiHome "config\mcp_config.json" },
    @{ Src = Join-Path $source "hooks.json"; Dest = Join-Path $GeminiHome "config\hooks.json" },
    @{ Src = Join-Path $source "settings.json"; Dest = Join-Path $GeminiHome "settings.json" },
    @{ Src = Join-Path $source "antigravity-cli-settings.json"; Dest = Join-Path $GeminiHome "antigravity-cli\settings.json" }
  )

  foreach ($config in $configsToRestore) {
    if (Test-Path $config.Src) {
      Copy-Item $config.Src $config.Dest -Force
      Log-Info "Restored $($config.Src | Split-Path -Leaf)"
    }
  }

  # Restore scripts
  $scriptsSrc = Join-Path $source "scripts"
  if (Test-Path $scriptsSrc) {
    Copy-Item "$scriptsSrc\*" (Join-Path $GeminiHome "config\scripts") -Recurse -Force
    Log-Info "Restored scripts from backup"
  }
}

# 3. Compile rules to GEMINI.md
$compiledContent = @()

if (Test-Path $globalRulesPath) {
  $compiledContent += "# =========================================="
  $compiledContent += "# GLOBAL RULES (Source: global-rules.md)"
  $compiledContent += "# =========================================="
  $compiledContent += (Get-Content $globalRulesPath -Raw)
  $compiledContent += ""
}

if (Test-Path $cleanCodePath) {
  $compiledContent += "# =========================================="
  $compiledContent += "# CLEAN CODE PLAYBOOK (Source: clean-code.md)"
  $compiledContent += "# =========================================="
  $compiledContent += (Get-Content $cleanCodePath -Raw)
  $compiledContent += ""
}

if (Test-Path $agOverlayPath) {
  $compiledContent += "# =========================================="
  $compiledContent += "# ANTIGRAVITY OVERLAY RULES (Source: antigravity-overlay.md)"
  $compiledContent += "# =========================================="
  $compiledContent += (Get-Content $agOverlayPath -Raw)
  $compiledContent += ""
}

if ($compiledContent.Count -gt 0) {
  $compiledContent | Out-String | Set-Content -Encoding UTF8 $outputGeminiMd
  Log-Info "Compiled rules to $outputGeminiMd"
} else {
  Log-Warning "No rules files found to compile."
}

Log-Info "Restored configs and compiled rules from $source -> $GeminiHome"

# Output JSON to stdout to satisfy the hook parser
Write-Output '{"decision": "allow"}'
