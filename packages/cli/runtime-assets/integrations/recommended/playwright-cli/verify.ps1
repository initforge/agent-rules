$ErrorActionPreference = 'Stop'
& playwright-cli --help *> $null
if ($LASTEXITCODE -ne 0) { throw 'playwright-cli verify failed' }
