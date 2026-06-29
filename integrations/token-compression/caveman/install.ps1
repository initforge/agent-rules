param([switch]$Apply, [ValidateSet("codex","gemini","all")][string]$Platform = "codex")
$ErrorActionPreference = "Stop"
$Args = @("-y", "github:JuliusBrussee/caveman", "--", "--minimal")
if ($Platform -ne "all") { $Args += @("--only", $Platform) }
if (-not $Apply) { $Args += "--dry-run" }
& npx @Args
if ($LASTEXITCODE -ne 0) { throw "Caveman installer failed" }
