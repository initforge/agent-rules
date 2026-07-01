$ErrorActionPreference = "Stop"
& npx -y github:JuliusBrussee/caveman -- --uninstall
if ($LASTEXITCODE -ne 0) { throw "Caveman uninstall failed" }
& npx skills remove caveman 2>$null
