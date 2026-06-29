$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Problems = [System.Collections.Generic.List[string]]::new()
$Core = Get-ChildItem (Join-Path $Root "knowledge\core") -File -Filter "*.md"
$CoreChars = ($Core | ForEach-Object { (Get-Content -Raw -Encoding UTF8 $_.FullName).Length } | Measure-Object -Sum).Sum
$CoreTokens = [math]::Ceiling($CoreChars / 3.6)
if ($CoreTokens -gt 4000) { $Problems.Add("Core token budget exceeded: $CoreTokens") }
foreach ($Platform in @("codex","grok","antigravity")) {
  $Overlay = Join-Path $Root "platforms\$Platform\$Platform-overlay.md"
  if (-not (Test-Path $Overlay)) { $Problems.Add("Missing overlay: $Overlay"); continue }
  $Tokens = [math]::Ceiling((Get-Content -Raw -Encoding UTF8 $Overlay).Length / 3.6)
  if ($Tokens -gt 600) { $Problems.Add("$Platform overlay budget exceeded: $Tokens") }
}
$Slugs = Get-ChildItem (Join-Path $Root "knowledge\capabilities") -Recurse -File -Filter "SKILL.md" | ForEach-Object { $_.Directory.Name }
$Duplicates = $Slugs | Group-Object | Where-Object Count -gt 1
foreach ($Dup in $Duplicates) { $Problems.Add("Duplicate capability: $($Dup.Name)") }
if (Test-Path (Join-Path $Root ".agents")) { $Problems.Add("Project mirror exists: .agents") }
if (Test-Path (Join-Path $Root ".codex")) { $Problems.Add("Project mirror exists: .codex") }
$RetiredTool = "git" + "nexus"
$Forbidden = rg -n -i $RetiredTool $Root -g "!plan/**" -g "!.git/**" -g "!build/**" 2>$null
if ($Forbidden) { $Problems.Add("Retired code-graph tool references remain outside plan") }
if ($Problems.Count) { $Problems | ForEach-Object { Write-Error $_ }; exit 1 }
Write-Host "Context validation PASS"
Write-Host "Core tokens (estimated): $CoreTokens"
Write-Host "Capabilities: $($Slugs.Count)"
