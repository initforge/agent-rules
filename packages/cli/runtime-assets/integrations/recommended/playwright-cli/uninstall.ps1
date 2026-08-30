$ErrorActionPreference = 'Stop'
npm uninstall --global '@playwright/cli'
if ($LASTEXITCODE -ne 0) { throw 'playwright-cli uninstall failed' }
