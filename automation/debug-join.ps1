# Test 1: Native Join-Path with string[]
$arr = [string[]]@('bar', 'baz')
Write-Host "Test 1: Array of strings"
Microsoft.PowerShell.Management\Join-Path -Path 'C:\foo' -ChildPath $arr

Write-Host "Test 2: Native Join-Path with single string"
Microsoft.PowerShell.Management\Join-Path -Path 'C:\foo' -ChildPath 'bar'

Write-Host "Test 3: Single from Object[] cast to string[]"
$obj = @('bar')
$cast = [string[]]$obj
Microsoft.PowerShell.Management\Join-Path -Path 'C:\foo' -ChildPath $cast

Write-Host "Test 4: Single object directly"
$obj2 = @('bar') | ForEach-Object { $_ }
$cast2 = [string[]]$obj2
Microsoft.PowerShell.Management\Join-Path -Path 'C:\foo' -ChildPath $cast2
