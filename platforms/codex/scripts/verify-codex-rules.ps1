$ErrorActionPreference = "Stop"

$codexHome = "$env:USERPROFILE\.codex"
$backupRoot = "P:\agent-rules"
$validator = Join-Path $codexHome "scripts\validate-runtime-context.ps1"

Write-Host "== Codex home =="
Write-Host $codexHome
Write-Host ""

if (Test-Path -LiteralPath $validator) {
  & $validator -Root $codexHome
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
} else {
  $fallback = Join-Path $backupRoot "scripts\validate-runtime-context.ps1"
  if (Test-Path -LiteralPath $fallback) {
    & $fallback -Root $codexHome
    if ($LASTEXITCODE -ne 0) {
      exit $LASTEXITCODE
    }
  } else {
    throw "Missing validate-runtime-context.ps1 in local runtime and backup"
  }
}

if (Test-Path -LiteralPath $backupRoot) {
  $backupValidator = Join-Path $backupRoot "scripts\validate-runtime-context.ps1"
  if (Test-Path -LiteralPath $backupValidator) {
    & $backupValidator -Root $backupRoot
    if ($LASTEXITCODE -ne 0) {
      exit $LASTEXITCODE
    }
  }
}

Write-Host ""
Write-Host "Suggested:"
Write-Host 'codex --ask-for-approval never "Explain loaded workflow, tool inventory, MCP registry, skills registry, and new-machine bootstrap policy."'
