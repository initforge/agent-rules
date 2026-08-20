param(
    [Parameter(Mandatory=$false)]
    [string]$Root = $null,
    
    [Parameter(Mandatory=$false)]
    [ValidateSet('check','enforce','status','list-violations','selftest')]
    [string]$Action = 'status',
    
    [switch]$Strict,
    [switch]$Json
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'path-compat.ps1')
. (Join-Path $PSScriptRoot 'scripts\compose\helpers.ps1')

if (-not $Root) {
    $Root = Find-ComposeProjectRoot -StartPath (Join-Path $PSScriptRoot '..')
    if (-not $Root) { $Root = Split-Path -Parent $PSScriptRoot }
}

# region Types
class ComposePolicyViolation {
    [string]$Type
    [string]$File
    [string]$Line
    [string]$Pattern
    [string]$Severity
    [string]$Message
    
    ComposePolicyViolation([string]$type, [string]$file, [string]$line, [string]$pattern, [string]$severity, [string]$message) {
        $this.Type = $type
        $this.File = $file
        $this.Line = $line
        $this.Pattern = $pattern
        $this.Severity = $severity
        $this.Message = $message
    }
}

class ComposeProjectStatus {
    [string]$Status
    [string]$ProjectPath
    [bool]$HasServiceProject
    [int]$ServiceCount
    [string[]]$Services
    [int]$ViolationCount
    [ComposePolicyViolation[]]$Violations
    [datetime]$ScannedAt
    [string]$VerificationLevel
    
    ComposeProjectStatus() {
        $this.ScannedAt = Get-Date
        $this.Violations = @()
        $this.Services = @()
    }
}
# endregion

# region YAML Parsing
function Get-ComposeServiceCount {
    param([string]$ComposeFile)
    
    if (-not (Test-Path $ComposeFile)) { return 0 }
    
    try {
        $content = Get-Content -Raw -Path $ComposeFile -Encoding UTF8
        $inServices = $false
        $count = 0
        
        foreach ($line in ($content -split "`n")) {
            if ($line -match '^(services|volumes|networks):') {
                $inServices = $line -match '^services:'
                continue
            }
            if ($inServices -and $line -match '^  ([a-zA-Z][\w-]*):') {
                $count++
            }
        }
        
        return $count
    }
    catch {
        return 0
    }
}

function Get-ComposeVersion {
    param([string]$ComposeFile)
    
    if (-not (Test-Path $ComposeFile)) { return 'unknown' }
    
    try {
        $content = Get-Content -Raw -Path $ComposeFile -Encoding UTF8
        if ($content -match 'version:\s*["'']?(\d+[\.\d]*)') {
            return $matches[1]
        }
        if ($content -match '^(services|name):') {
            return '2'
        }
        return 'unknown'
    }
    catch {
        return 'unknown'
    }
}
# endregion

# region Project Detection
function Find-ComposeProjects {
    param([string]$RootPath)
    
    $projects = @()
    
    $composeFiles = Get-ChildItem -Path $RootPath -Include 'docker-compose.yml','docker-compose.yaml' -Recurse -Depth 3 -ErrorAction SilentlyContinue | Where-Object { $_.FullName -notmatch 'node_modules|\.git|generated|\.agent' }
    
    foreach ($cf in $composeFiles) {
        $dir = $cf.DirectoryName
        $override = Get-ChildItem -Path $dir -Filter 'docker-compose.*.override.yml' -ErrorAction SilentlyContinue
        $project = @{
            Path = $dir
            ComposeFile = $cf.FullName
            OverrideFile = if ($override) { $override.FullName } else { $null }
            Type = 'compose'
        }
        $projects += $project
    }
    
    $dockerfiles = Get-ChildItem -Path $RootPath -Filter 'Dockerfile*' -Recurse -Depth 2 -ErrorAction SilentlyContinue | Where-Object { $_.FullName -notmatch 'node_modules|\.git|generated|\.agent' }
    
    foreach ($df in $dockerfiles) {
        $dir = $df.DirectoryName
        if (-not ($projects | Where-Object { $_.Path -eq $dir })) {
            $project = @{
                Path = $dir
                Dockerfile = $df.FullName
                Type = 'dockerfile-only'
            }
            $projects += $project
        }
    }
    
    return $projects
}
# endregion

# region Pattern Detection
$BLOCKED_PATTERNS = @(
    @{ Pattern = 'docker\s+run'; Type = 'one-shot'; Message = 'docker run creates ephemeral containers, not long-lived stack services'; Severity = 'error' },
    @{ Pattern = 'docker-compose\s+run'; Type = 'one-shot'; Message = 'docker-compose run creates ephemeral overrides, not long-lived stack services'; Severity = 'error' },
    @{ Pattern = '\.override\.yml'; Type = 'override'; Message = 'Override files bypass canonical Compose; route through scripts instead'; Severity = 'warning' },
    @{ Pattern = 'COMPOSE_FILE.*override'; Type = 'override'; Message = 'Override composition bypasses canonical'; Severity = 'warning' },
    @{ Pattern = '--rm\s+--detach'; Type = 'one-shot'; Message = '--rm flag indicates ephemeral one-shot container'; Severity = 'error' },
    @{ Pattern = 'docker\s+compose\s+run'; Type = 'one-shot'; Message = 'docker compose run creates ephemeral service instances; use scripts instead'; Severity = 'error' },
    @{ Pattern = 'docker\s+compose\s+(-f|--file).*override'; Type = 'override'; Message = '-f override file bypasses canonical Compose'; Severity = 'warning' }
)

function Find-Violations {
    param([string]$RootPath, [bool]$Strict)
    
    $violations = @()
    
    $workflowDir = Join-Path $RootPath '.github\workflows'
    if (Test-Path $workflowDir) {
        $workflows = Get-ChildItem -Path $workflowDir -Filter '*.yml' -ErrorAction SilentlyContinue
        foreach ($wf in $workflows) {
            $lines = Get-Content -Path $wf.FullName -Encoding UTF8
            for ($i = 0; $i -lt $lines.Count; $i++) {
                foreach ($bp in $BLOCKED_PATTERNS) {
                    if ($lines[$i] -match $bp.Pattern) {
                        $severity = if ($Strict -or $bp.Severity -eq 'error') { 'error' } else { $bp.Severity }
                        $violations += [ComposePolicyViolation]::new(
                            $bp.Type,
                            $wf.FullName,
                            ($i + 1).ToString(),
                            $bp.Pattern,
                            $severity,
                            $bp.Message
                        )
                    }
                }
            }
        }
    }
    
    $scripts = Get-ChildItem -Path $RootPath -Include '*.ps1','*.sh','*.mjs','*.ts' -Recurse -ErrorAction SilentlyContinue | Where-Object { $_.FullName -match 'automation' -and $_.FullName -notmatch '\.git|node_modules|generated|\.agent' }
    foreach ($script in $scripts) {
        $lines = Get-Content -Path $script.FullName -Encoding UTF8
        for ($i = 0; $i -lt $lines.Count; $i++) {
            foreach ($bp in $BLOCKED_PATTERNS) {
                if ($bp.Type -eq 'one-shot' -and $lines[$i] -match $bp.Pattern) {
                    $violations += [ComposePolicyViolation]::new(
                        $bp.Type,
                        $script.FullName,
                        ($i + 1).ToString(),
                        $bp.Pattern,
                        $bp.Severity,
                        $bp.Message
                    )
                }
            }
        }
    }
    
    return $violations
}
# endregion

# region Operational Script Routing
$COMPOSE_SCRIPTS_PATH = 'automation\scripts\compose'

$COMPOSE_OPERATIONS = @{
    'seed' = 'Seed data into a running stack service'
    'migrate' = 'Apply migrations to a running stack service'
    'import' = 'Import data into a running stack service'
    'setup' = 'Setup/initialize compose stack environment'
    'mock' = 'Inject mock data into a running stack service'
    'event' = 'Inject events into a running stack service'
}

function Get-ComposeScriptsPath {
    param([string]$RootPath)
    return Join-Path $RootPath $COMPOSE_SCRIPTS_PATH
}

function Invoke-ComposeOperation {
    param(
        [Parameter(Mandatory=$true)]
        [string]$Operation,
        
        [Parameter(Mandatory=$false)]
        [hashtable]$Args = @{},
        
        [Parameter(Mandatory=$false)]
        [string]$RootPath = $Root
    )
    
    $scriptsPath = Get-ComposeScriptsPath -RootPath $RootPath
    $scriptPath = Join-Path $scriptsPath "$Operation.ps1"
    
    if (-not (Test-Path $ScriptPath)) {
        throw "No script found for operation: $Operation. Expected at: $scriptPath"
    }
    
    $params = @{}
    foreach ($key in $Args.Keys) {
        $params[$key] = $Args[$key]
    }
    
    & $ScriptPath @params
}
# endregion

# region Status & Formatting
function Test-ComposeProjectExists {
    param([string]$RootPath)
    
    $projects = Find-ComposeProjects -RootPath $RootPath
    $serviceProjects = $projects | Where-Object { 
        $_.Type -eq 'compose' -and (Get-ComposeServiceCount $_.ComposeFile) -gt 0 
    }
    
    return $serviceProjects.Count -gt 0
}

function Get-ComposeProjectStatus {
    param([string]$RootPath, [bool]$Strict)
    
    $status = [ComposeProjectStatus]::new()
    $status.ProjectPath = $RootPath
    
    if (-not (Test-ComposeProjectExists -RootPath $RootPath)) {
        $status.Status = 'UNVERIFIED'
        $status.HasServiceProject = $false
        $status.VerificationLevel = 'minimal'
        $status.ViolationCount = 0
        return $status
    }
    
    $status.HasServiceProject = $true
    
    $projects = Find-ComposeProjects -RootPath $RootPath
    $serviceProjects = $projects | Where-Object { $_.Type -eq 'compose' -and (Get-ComposeServiceCount $_.ComposeFile) -gt 0 }
    
    $totalServices = 0
    $allServices = @()
    foreach ($sp in $serviceProjects) {
        $count = Get-ComposeServiceCount -ComposeFile $sp.ComposeFile
        $totalServices += $count
        
        $content = Get-Content -Raw -Path $sp.ComposeFile -Encoding UTF8
        $inServices = $false
        foreach ($line in ($content -split "`n")) {
            if ($line -match '^services:') { $inServices = $true; continue }
            if ($line -match '^[^ ]' -and $inServices) { $inServices = $false }
            if ($inServices -and $line -match '^  ([a-zA-Z][\w-]*):') { $allServices += $matches[1] }
        }
    }
    
    $status.ServiceCount = $totalServices
    $status.Services = $allServices
    if ($serviceProjects.Count -gt 0) {
        $status.ComposeVersion = Get-ComposeVersion -ComposeFile $serviceProjects[0].ComposeFile
    }
    
    $violations = Find-Violations -RootPath $RootPath -Strict $Strict
    $status.Violations = $violations
    $status.ViolationCount = $violations.Count
    
    $errorCount = ($violations | Where-Object { $_.Severity -eq 'error' } | Measure-Object).Count
    if ($errorCount -gt 0) {
        $status.Status = 'FAIL'
    }
    elseif (($violations | Where-Object { $_.Severity -eq 'warning' } | Measure-Object).Count -gt 0) {
        $status.Status = 'WARN'
    }
    else {
        $status.Status = 'PASS'
    }
    
    $status.VerificationLevel = 'full'
    return $status
}

function Format-Status {
    param($Status, [switch]$Json)
    
    if ($Json) {
        return $Status | ConvertTo-Json -Depth 10
    }
    
    $sb = [System.Text.StringBuilder]::new()
    [void]$sb.AppendLine('Docker Compose Policy Status')
    [void]$sb.AppendLine('=============================')
    [void]$sb.AppendLine("Status: $($Status.Status)")
    [void]$sb.AppendLine("Project: $($Status.ProjectPath)")
    [void]$sb.AppendLine("Has Service Project: $($Status.HasServiceProject)")
    [void]$sb.AppendLine("Service Count: $($Status.ServiceCount)")
    [void]$sb.AppendLine("Verification Level: $($Status.VerificationLevel)")
    [void]$sb.AppendLine("Violations: $($Status.ViolationCount)")
    [void]$sb.AppendLine("Scanned: $($Status.ScannedAt.ToString('yyyy-MM-dd HH:mm:ss'))")
    [void]$sb.AppendLine('')
    
    if ($Status.Services.Count -gt 0) {
        [void]$sb.AppendLine("Services: $($Status.Services -join ', ')")
        [void]$sb.AppendLine('')
    }
    
    if ($Status.Violations.Count -gt 0) {
        [void]$sb.AppendLine('Violations:')
        foreach ($v in $Status.Violations) {
            $shortPath = $v.File -replace [regex]::Escape($Status.ProjectPath), ''
            $shortPath = $shortPath -replace '^\\', ''
            [void]$sb.AppendLine("  [$($v.Severity.ToUpper())] $($v.Type) $shortPath`:$($v.Line)")
            [void]$sb.AppendLine("    $($v.Message)")
            [void]$sb.AppendLine('')
        }
    }
    
    if ($Status.Status -eq 'UNVERIFIED') {
        [void]$sb.AppendLine('')
        [void]$sb.AppendLine('UNVERIFIED: No service-bearing Docker/Compose project detected.')
        [void]$sb.AppendLine('Policy validation: minimal (file existence only).')
        [void]$sb.AppendLine('No enforcement active. Add canonical Compose files to enable full policy.')
    }
    
    return $sb.ToString()
}

function Format-ViolationsList {
    param($Status)
    
    $output = @()
    foreach ($v in $Status.Violations) {
        $output += "$($v.File):$($v.Line) [$($v.Severity)] $($v.Type): $($v.Message)"
    }
    return $output
}
# endregion

# region Self-Test
function Test-PolicySelfTest {
    $failures = @()
    $tmpDir = Join-Path ([System.IO.Path]::GetTempPath()) ("compose-policy-test-" + [guid]::NewGuid().ToString('N'))
    try {
        # Test 1: UNVERIFIED when no service-bearing topology exists
        $status = Get-ComposeProjectStatus -RootPath $tmpDir -Strict $false
        if ($status.Status -ne 'UNVERIFIED') {
            $failures += "Expected UNVERIFIED for empty dir, got '$($status.Status)'"
        }
        if ($status.HasServiceProject) {
            $failures += "Expected HasServiceProject=$false for empty dir"
        }

        # Test 2: PASS when compose file has services but no violations
        $subDir = Join-Path $tmpDir 'subproject'
        New-Item -ItemType Directory -Path $subDir -Force | Out-Null
        $composeFile = Join-Path $subDir 'docker-compose.yml'
        Set-Content -Path $composeFile -Value 'services:
  web:
    image: nginx
' -Encoding UTF8
        $status = Get-ComposeProjectStatus -RootPath $tmpDir -Strict $false
        if ($status.Status -ne 'PASS') {
            $failures += "Expected PASS for clean compose project, got '$($status.Status)'"
        }
        if (-not $status.HasServiceProject) {
            $failures += "Expected HasServiceProject=$true for compose with services"
        }
        if ($status.ServiceCount -lt 1) {
            $failures += "Expected at least 1 service, got $($status.ServiceCount)"
        }

        # Test 3: FAIL when one-shot pattern is detected
        $wfDir = Join-Path $tmpDir '.github' | Join-Path -ChildPath 'workflows'
        New-Item -ItemType Directory -Path $wfDir -Force | Out-Null
        $wfFile = Join-Path $wfDir 'ci.yml'
        Set-Content -Path $wfFile -Value 'steps:
  - run: docker run alpine echo hello
' -Encoding UTF8
        $status = Get-ComposeProjectStatus -RootPath $tmpDir -Strict $false
        $hasOneShotViolation = ($status.Violations | Where-Object { $_.Type -eq 'one-shot' }).Count -gt 0
        if (-not $hasOneShotViolation) {
            $failures += "Expected one-shot violation for docker run in workflow"
        }

        # Test 4: selftest action returns valid status object
        $selfTestStatus = Get-ComposeProjectStatus -RootPath $tmpDir -Strict $false
        if (-not $selfTestStatus) {
            $failures += "Self-test status object is null"
        }
        if ($selfTestStatus.ScannedAt -isnot [datetime]) {
            $failures += "Self-test status missing valid ScannedAt"
        }
    }
    finally {
        if (Test-Path $tmpDir) { Remove-Item -Recurse -Force $tmpDir -ErrorAction SilentlyContinue }
    }

    if ($failures.Count -gt 0) {
        foreach ($f in $failures) { Write-Error "SELFTEST FAIL: $f" }
        return $false
    }
    Write-Host "Self-test: all assertions passed." -ForegroundColor Green
    return $true
}
# endregion

# region Entry Point
try {
    switch ($Action) {
        'selftest' {
            $result = Test-PolicySelfTest
            if (-not $result) { exit 1 }
            exit 0
        }
        'check' {
            $status = Get-ComposeProjectStatus -RootPath $Root -Strict $Strict
            if ($status.HasServiceProject -and $status.ViolationCount -gt 0) {
                Write-Warning 'Policy violations found. Run with -Action enforce to block.'
            }
            Format-Status $status | Write-Output
        }
        'enforce' {
            $status = Get-ComposeProjectStatus -RootPath $Root -Strict $Strict
            Format-Status $status -Json | Write-Output
            $errors = $status.Violations | Where-Object { $_.Severity -eq 'error' }
            if ($errors.Count -gt 0) {
                Write-Error "Enforcement failed: $($errors.Count) error-level violations."
                exit 1
            }
            if ($Strict) {
                $warnings = $status.Violations | Where-Object { $_.Severity -eq 'warning' }
                if ($warnings.Count -gt 0) {
                    Write-Error "Enforcement failed (strict mode): $($warnings.Count) warnings present."
                    exit 2
                }
            }
            Write-Host 'Enforcement: PASS' -ForegroundColor Green
        }
        'list-violations' {
            $status = Get-ComposeProjectStatus -RootPath $Root -Strict $Strict
            if ($status.ViolationCount -eq 0) {
                Write-Host 'No violations found.'
            }
            else {
                Format-ViolationsList $status | ForEach-Object { Write-Host $_ }
            }
        }
        default {
            $status = Get-ComposeProjectStatus -RootPath $Root -Strict $Strict
            Format-Status $status -Json:$Json | Write-Output
        }
    }

    exit 0
}
catch {
    Write-Error $_.Exception.Message
    exit 1
}
# endregion