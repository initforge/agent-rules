$ErrorActionPreference = "Continue"

function Show-Check($name, $verify) {
  Write-Host "== $name =="
  try {
    Invoke-Expression $verify
  } catch {
    Write-Host "[FAIL] $name -> $($_.Exception.Message)"
  }
  Write-Host ""
}

Show-Check "Codex" "codex --version"
Show-Check "RTK" "rtk --version"
Show-Check "Git" "git --version"
Show-Check "Node" "node --version"
Show-Check "npm" "npm --version"
Show-Check "pnpm" "pnpm --version"
Show-Check "Python" "python --version"
Show-Check "ripgrep" "rg --version"
Show-Check "jq" "jq --version"
Show-Check "fd" "fd --version"
Show-Check "GitNexus CLI" "npx gitnexus --version"
Show-Check "Codex MCP list" "codex mcp list"

if (Get-Command flutter -ErrorAction SilentlyContinue) {
  Show-Check "Flutter" "flutter --version"
}

if (Get-Command dart -ErrorAction SilentlyContinue) {
  Show-Check "Dart" "dart --version"
}
