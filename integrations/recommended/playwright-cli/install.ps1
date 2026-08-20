$ErrorActionPreference = 'Stop'
$ManifestPath = Join-Path $PSScriptRoot 'manifest.json'
if (-not (Test-Path -LiteralPath $ManifestPath -PathType Leaf)) { throw "Manifest missing: $ManifestPath" }
$Manifest = Get-Content -Raw -Encoding UTF8 -LiteralPath $ManifestPath | ConvertFrom-Json
if (-not $Manifest.npmPackage -or -not $Manifest.version) { throw 'playwright-cli manifest is missing npmPackage/version' }
$Spec = "$($Manifest.npmPackage)@$($Manifest.version)"
npm install --global $Spec
if ($LASTEXITCODE -ne 0) { throw "playwright-cli install failed: $Spec" }
