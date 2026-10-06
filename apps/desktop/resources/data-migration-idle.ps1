param([Parameter(Mandatory=$true)][string]$SourceRoot, [Parameter(Mandatory=$true)][int]$OwnerPid)
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($SourceRoot)).TrimEnd('\') + '\'
$processes = @(Get-CimInstance Win32_Process -ErrorAction Stop)
# The caller is still in bootstrap: none of its business runtimes have started.
# Ignore its own Electron helpers and this probe, while retaining orphaned old writers.
$bootstrap = [Collections.Generic.HashSet[int]]::new()
[void]$bootstrap.Add($OwnerPid)
do {
    $changed = $false
    foreach ($process in $processes) {
        if ($bootstrap.Contains([int]$process.ParentProcessId)) {
            if ($bootstrap.Add([int]$process.ProcessId)) { $changed = $true }
        }
    }
} while ($changed)
$owned = [Collections.Generic.HashSet[int]]::new()
foreach ($process in $processes) {
    if ($process.ProcessId -eq $PID -or $bootstrap.Contains([int]$process.ProcessId)) { continue }
    if (($process.ExecutablePath -and $process.ExecutablePath.StartsWith($root, [StringComparison]::OrdinalIgnoreCase)) -or
        ($process.CommandLine -and $process.CommandLine.IndexOf($SourceRoot, [StringComparison]::OrdinalIgnoreCase) -ge 0)) {
        [void]$owned.Add([int]$process.ProcessId)
    }
}
do {
    $changed = $false
    foreach ($process in $processes) {
        if ($owned.Contains([int]$process.ParentProcessId) -and $process.ProcessId -ne $PID -and -not $bootstrap.Contains([int]$process.ProcessId)) {
            if ($owned.Add([int]$process.ProcessId)) { $changed = $true }
        }
    }
} while ($changed)
if ($owned.Count) { throw "Close the old application and its child processes before migrating ${SourceRoot}. PIDs: $($owned -join ', ')" }
