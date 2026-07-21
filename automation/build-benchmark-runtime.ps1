param(
  [string]$Root = (Split-Path -Parent $PSScriptRoot),
  [string]$OutputRoot = (Join-Path $Root ".agent\benchmarks\runtime"),
  [switch]$Force
)

$ErrorActionPreference = "Stop"
$OutputRoot = [System.IO.Path]::GetFullPath($OutputRoot)
$AgentRoot = [System.IO.Path]::GetFullPath((Join-Path $Root ".agent"))
if (-not $OutputRoot.StartsWith($AgentRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Benchmark runtime must stay under $AgentRoot"
}
if ((Test-Path -LiteralPath $OutputRoot) -and -not $Force) {
  throw "Output already exists; pass -Force to rebuild: $OutputRoot"
}
if (Test-Path -LiteralPath $OutputRoot) {
  Remove-Item -LiteralPath $OutputRoot -Recurse -Force
}

$baseline = Join-Path $OutputRoot "baseline"
$core = Join-Path $OutputRoot "core"
$full = Join-Path $OutputRoot "full"
New-Item -ItemType Directory -Force -Path $baseline, $core, $full | Out-Null

$manifestText = Get-Content -LiteralPath (Join-Path $Root "rules\manifest.yaml") -Raw -Encoding UTF8
$manifestRules = @([regex]::Matches($manifestText, '(?m)^\s+-\s+(\S+\.md)\s*$') | ForEach-Object { $_.Groups[1].Value })
if ($manifestRules.Count -eq 0) { throw "No core rules found in rules/manifest.yaml" }
$coreRules = Join-Path $core "rules"
New-Item -ItemType Directory -Force -Path $coreRules | Out-Null
foreach ($rule in $manifestRules) {
  Copy-Item -LiteralPath (Join-Path $Root "rules\$rule") -Destination (Join-Path $coreRules $rule)
}
Copy-Item -LiteralPath (Join-Path $Root "rules\manifest.yaml") -Destination (Join-Path $coreRules "manifest.yaml")
Copy-Item -LiteralPath (Join-Path $Root "platforms\codex\codex-overlay.md") -Destination (Join-Path $coreRules "codex-overlay.md")
$coreImports = @($manifestRules | ForEach-Object { "@$($core.Replace('\','/'))/rules/$_" })
$coreImports += "@$($core.Replace('\','/'))/rules/codex-overlay.md"
$coreBody = ($coreImports -join "`n") + @"


# Benchmark core runtime

- Isolated empirical benchmark home. Never read or mutate the canonical runtime.
- Do not commit, push, or deploy.
- Report PASS, PARTIAL, or BLOCKED with verification evidence.
"@
[System.IO.File]::WriteAllText((Join-Path $core "AGENTS.md"), $coreBody, [System.Text.UTF8Encoding]::new($false))

$priorCodexHome = $env:CODEX_HOME
try {
  $env:CODEX_HOME = $full
  & (Join-Path $PSScriptRoot "01-build-runtime.ps1") -Root $Root
  Copy-Item -Path (Join-Path $Root "05-generated\runtime-build\codex\*") -Destination $full -Recurse -Force
} finally {
  $env:CODEX_HOME = $priorCodexHome
}

foreach ($variant in @($baseline, $core, $full)) {
  if (Test-Path -LiteralPath (Join-Path $variant "auth.json")) {
    throw "Credential material must not exist in persistent benchmark home: $variant"
  }
}

$metadata = [ordered]@{
  version = 1
  generated_at = [DateTimeOffset]::UtcNow.ToString("o")
  source_root = [System.IO.Path]::GetFullPath($Root)
  variants = [ordered]@{
    baseline = [ordered]@{ context = "none"; path = $baseline }
    core = [ordered]@{ context = "manifest core rules plus Codex overlay"; path = $core }
    full = [ordered]@{ context = "generated Codex rules, skills, scripts, and docs"; path = $full }
  }
  credential_material_persisted = $false
}
$metadata | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $OutputRoot "runtime.json") -Encoding UTF8
Write-Host "PASS: isolated benchmark runtimes built at $OutputRoot"
