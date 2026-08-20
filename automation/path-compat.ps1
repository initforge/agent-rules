# Keep the canonical PowerShell automation portable when PowerShell Core runs
# on Linux/macOS. Existing scripts use Windows-style fragments in many
# Join-Path calls; normalise only the child fragment before delegating to the
# native cmdlet. Windows behavior remains unchanged.
function Join-Path {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$Path,
    [Parameter(Mandatory = $true, Position = 1)]
    [string[]]$ChildPath
  )

  $Normalized = if ([IO.Path]::DirectorySeparatorChar -eq '\') {
    $ChildPath
  } else {
    @($ChildPath | ForEach-Object { $_ -replace '\\', '/' })
  }
  Microsoft.PowerShell.Management\Join-Path -Path $Path -ChildPath $Normalized
}
