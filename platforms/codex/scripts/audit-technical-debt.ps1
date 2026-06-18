param(
  [string]$RepoRoot = ".",
  [int]$MaxMatchesPerCategory = 40,
  [string]$OutputPath = ""
)

$ErrorActionPreference = "Stop"

$root = (Resolve-Path -LiteralPath $RepoRoot).Path
$selfPath = $MyInvocation.MyCommand.Path
$rg = Get-Command rg -ErrorAction SilentlyContinue
$sections = New-Object System.Collections.Generic.List[string]

function Add-Section([string]$Title, [string[]]$Lines) {
  $sections.Add("## $Title") | Out-Null
  if ($Lines.Count -eq 0) {
    $sections.Add("No signals found.") | Out-Null
  } else {
    foreach ($line in $Lines) {
      $sections.Add("- $line") | Out-Null
    }
  }
  $sections.Add("") | Out-Null
}

function Search-Rg([string]$Pattern) {
  if (-not $rg) {
    return @()
  }

  $args = @(
    "-n",
    "--hidden",
    "--glob", "!.git/**",
    "--glob", "!node_modules/**",
    "--glob", "!dist/**",
    "--glob", "!build/**",
    "--glob", "!.next/**",
    "--glob", "!coverage/**",
    "--glob", "!archive/**",
    "--glob", "!*.lock",
    $Pattern,
    $root
  )

  $result = & rg @args 2>$null |
    Where-Object {
      if (-not $selfPath) {
        return $true
      }
      return ($_ -notlike "$selfPath*")
    } |
    Select-Object -First $MaxMatchesPerCategory
  if (-not $result) {
    return @()
  }
  return @($result)
}

function Search-Files([scriptblock]$Predicate) {
  $skip = @("\.git\", "\node_modules\", "\dist\", "\build\", "\.next\", "\coverage\", "\archive\")
  $files = Get-ChildItem -LiteralPath $root -Recurse -Force -File -ErrorAction SilentlyContinue |
    Where-Object {
      $path = $_.FullName
      foreach ($item in $skip) {
        if ($path.Contains($item)) {
          return $false
        }
      }
      return (& $Predicate $_)
    } |
    Select-Object -First $MaxMatchesPerCategory |
    ForEach-Object { $_.FullName }
  return @($files)
}

$header = @(
  "# Technical Debt Signal Audit",
  "",
  "Repo: $root",
  "Generated: $((Get-Date).ToString('s'))",
  "",
  "This is a signal scan, not a final verdict. Classify findings with technical-debt-control.md before editing or deleting.",
  ""
)

foreach ($line in $header) {
  $sections.Add($line) | Out-Null
}

Add-Section "TODO / FIXME / HACK" (Search-Rg "(TODO|FIXME|HACK|XXX|temporary|workaround|quick fix)")
Add-Section "Debug Code" (Search-Rg "(console\.log|debugger;|\.only\(|describe\.only|it\.only|test\.only)")
Add-Section "Placeholder / Mock / Fake Signals" (Search-Rg "(placeholder|mock data|fake data|dummy data|not implemented|coming soon|stub)")
Add-Section "Suppression / Type Escape Signals" (Search-Rg "(ts-ignore|eslint-disable|type: ignore|as any|unknown as)")

$artifactPatterns = {
  param($file)
  $name = $file.Name.ToLowerInvariant()
  if ($name -match "(\.log|\.tmp|\.bak|\.old|\.orig|\.download|\.webm|\.mp4|\.trace|\.har)$") {
    return $true
  }
  if ($name -match "^(debug-|tmp-|scratch-|test-output|playwright-report)") {
    return $true
  }
  return $false
}
Add-Section "Artifact-Like Files" (Search-Files $artifactPatterns)

$scriptSignals = Search-Files {
  param($file)
  $name = $file.Name.ToLowerInvariant()
  if ($name -match "(debug|scratch|temp|one-off|adhoc|ad-hoc)" -and $name -match "\.(ps1|js|mjs|ts|py|sh|bat)$") {
    return $true
  }
  return $false
}
Add-Section "One-Off Script Signals" $scriptSignals

$output = ($sections -join [Environment]::NewLine)

if ($OutputPath -ne "") {
  $target = $OutputPath
  if (-not [System.IO.Path]::IsPathRooted($target)) {
    $target = Join-Path $root $target
  }
  $parent = Split-Path -Parent $target
  if ($parent -and -not (Test-Path -LiteralPath $parent)) {
    New-Item -ItemType Directory -Path $parent | Out-Null
  }
  Set-Content -LiteralPath $target -Value $output -Encoding UTF8
  Write-Host "Technical debt audit written: $target"
} else {
  Write-Output $output
}
