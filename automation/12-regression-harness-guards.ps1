# Regression guards for dual-tree, BOM, glossary, intentional-oversize - drives shipped validate.
param([string]$Root = (Split-Path -Parent $PSScriptRoot))
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "path-compat.ps1")
$Failed = 0

function Assert-True([bool]$Cond, [string]$Msg) {
  if (-not $Cond) { Write-Host "FAIL: $Msg"; $script:Failed++ } else { Write-Host "OK: $Msg" }
}

# 1) Drive real validate-context entrypoint
& (Join-Path $PSScriptRoot "03-validate-context.ps1")
Assert-True ($LASTEXITCODE -eq 0) "03-validate-context.ps1 exit 0"

# 2) docs-style BOM - read real file bytes
$Docs = Join-Path $Root "skills\docs-style\SKILL.md"
$Bytes = [System.IO.File]::ReadAllBytes($Docs)
$NoBom = -not ($Bytes.Length -ge 3 -and $Bytes[0] -eq 0xEF -and $Bytes[1] -eq 0xBB -and $Bytes[2] -eq 0xBF)
Assert-True $NoBom "docs-style SKILL.md has no UTF-8 BOM"

# 3) Canonical rules must not contain legacy dual-tree filenames
foreach ($L in @("00-index.md","01-agent-workflow-sop.md","07-finish-to-completion.md")) {
  Assert-True (-not (Test-Path (Join-Path $Root "rules\$L"))) "no legacy $L in rules/"
}

# 4) Intentional oversize list exists in budget rule
$Budget = Get-Content -Raw -Encoding UTF8 (Join-Path $Root "rules\50-context-budget.md")
Assert-True ($Budget -like "*docs-style*" -and $Budget -like "*plan-and-handoff*" -and $Budget -like "*Intentional oversize*") "intentional oversize documented"

# 5) Grok overlay documents inject path
$GrokOv = Get-Content -Raw -Encoding UTF8 (Join-Path $Root "platforms\grok\grok-overlay.md")
Assert-True ($GrokOv -like "*.grok/rules*" -or $GrokOv -like "*.grok\\rules*") "grok-overlay documents inject path"

# 6) Codex TOML adapter merge must be idempotent and preserve array values.
. (Join-Path $PSScriptRoot "Merge-Mcp-Adapters.ps1")
$MergeTemp = Join-Path ([IO.Path]::GetTempPath()) ("agent-rules-mcp-" + [guid]::NewGuid().ToString("N") + ".toml")
try {
  [IO.File]::WriteAllText($MergeTemp, "model = 'test'`n`n[mcp_servers.playwright]`ncommand = 'old'`nargs = ['old']`nstartup_timeout_sec = 5`n")
  $Adapter = Join-Path $Root "integrations\recommended\playwright-mcp\adapters\codex.toml"
  Merge-CodexTomlAdapters -ConfigPath $MergeTemp -AdapterPaths @($Adapter) | Out-Null
  $Once = Get-Content -Raw $MergeTemp
  Merge-CodexTomlAdapters -ConfigPath $MergeTemp -AdapterPaths @($Adapter) | Out-Null
  $Twice = Get-Content -Raw $MergeTemp
  $SectionCount = ([regex]::Matches($Twice, '(?m)^\[mcp_servers\.playwright\]\r?$')).Count
  $BareArray = $Twice -match '(?m)^\s*\[''-y'''
  Assert-True ($Once -eq $Twice -and $SectionCount -eq 1 -and -not $BareArray) "Codex MCP TOML merge is idempotent"
} finally {
  Remove-Item -LiteralPath $MergeTemp -Force -ErrorAction SilentlyContinue
}

if ($Failed -gt 0) {
  Write-Error "Regression guards failed: $Failed"
  exit 1
}
Write-Host "Regression harness guards PASS"
