param(
  [switch]$InstallOptional,
  [switch]$SkipWinget,
  [switch]$SkipNpmGlobal
)

$ErrorActionPreference = "Continue"

function Test-Cmd($name) {
  return $null -ne (Get-Command $name -ErrorAction SilentlyContinue)
}

function Install-WingetPackage($id, $label) {
  if ($SkipWinget) {
    Write-Host "[SKIP] winget disabled: $label"
    return
  }

  if (-not (Test-Cmd "winget")) {
    Write-Host "[MISS] winget not available: $label"
    return
  }

  Write-Host "[TRY] winget install $label ($id)"
  winget install --id $id --exact --accept-package-agreements --accept-source-agreements
}

function Install-NpmGlobal($pkg, $label) {
  if ($SkipNpmGlobal) {
    Write-Host "[SKIP] npm global disabled: $label"
    return
  }

  if (-not (Test-Cmd "npm")) {
    Write-Host "[MISS] npm not available: $label"
    return
  }

  Write-Host "[TRY] npm install -g $pkg"
  npm install -g $pkg
}

$required = @(
  @{ Name = "git"; Label = "Git"; Winget = "Git.Git" },
  @{ Name = "node"; Label = "Node.js"; Winget = "OpenJS.NodeJS.LTS" },
  @{ Name = "python"; Label = "Python"; Winget = "Python.Python.3.12" },
  @{ Name = "rg"; Label = "ripgrep"; Winget = "BurntSushi.ripgrep.MSVC" },
  @{ Name = "jq"; Label = "jq"; Winget = "jqlang.jq" },
  @{ Name = "fd"; Label = "fd"; Winget = "sharkdp.fd" },
  @{ Name = "codex"; Label = "Codex CLI"; Npm = "@openai/codex" },
  @{ Name = "rtk"; Label = "RTK"; Notes = "Install manually if not present" }
)

$optional = @(
  @{ Name = "flutter"; Label = "Flutter"; Notes = "Manual install recommended because path/setup varies by machine" },
  @{ Name = "dart"; Label = "Dart"; Notes = "Comes with Flutter on this machine" }
)

Write-Host "== Required tools =="
foreach ($tool in $required) {
  if (Test-Cmd $tool.Name) {
    Write-Host "[OK] $($tool.Label)"
    continue
  }

  if ($tool.Winget) {
    Install-WingetPackage $tool.Winget $tool.Label
    continue
  }

  if ($tool.Npm) {
    Install-NpmGlobal $tool.Npm $tool.Label
    continue
  }

  Write-Host "[TODO] $($tool.Label): $($tool.Notes)"
}

if ($InstallOptional) {
  Write-Host ""
  Write-Host "== Optional tools =="
  foreach ($tool in $optional) {
    if (Test-Cmd $tool.Name) {
      Write-Host "[OK] $($tool.Label)"
    } else {
      Write-Host "[TODO] $($tool.Label): $($tool.Notes)"
    }
  }
}

Write-Host ""
Write-Host "Next:"
Write-Host "1. Run verify-toolchain.ps1"
Write-Host "2. Run inventory-current-machine.ps1"
Write-Host "3. Read docs/tool-registry.md for any manual installs or caveats"
