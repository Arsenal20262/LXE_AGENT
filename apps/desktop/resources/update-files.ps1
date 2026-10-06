param(
    [Parameter(Mandatory=$true)][ValidateSet('Promote','Rollback','Commit')][string]$Action,
    [Parameter(Mandatory=$true)][string]$InstallRoot,
    [Parameter(Mandatory=$true)][string]$StageRoot,
    [Parameter(Mandatory=$true)][string]$BackupRoot,
    [Parameter(Mandatory=$true)][string]$ResultPath,
    [string]$ProductName = 'LXE Agent',
    [string]$ExecutableName = 'LXE Agent.exe'
)
$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding($false)
function Move-Entry([string]$from, [string]$to) {
    if ([IO.Directory]::Exists($from)) { [IO.Directory]::Move($from, $to) }
    else { [IO.File]::Move($from, $to) }
}
function Write-Journal {
    $temporary = $script:journalPath + '.tmp'
    [IO.File]::WriteAllText($temporary, ($script:journal | ConvertTo-Json -Depth 5 -Compress), $utf8)
    if ([IO.File]::Exists($script:journalPath)) { [IO.File]::Replace($temporary, $script:journalPath, [NullString]::Value) }
    else { [IO.File]::Move($temporary, $script:journalPath) }
}
function Restore-Program {
    if (-not [IO.File]::Exists($script:journalPath)) { return }
    $script:journal = [IO.File]::ReadAllText($script:journalPath) | ConvertFrom-Json
    if ($journal.install -ne $InstallRoot -or $journal.stage -ne $StageRoot -or $journal.backup -ne $BackupRoot) { throw 'Update journal roots do not match' }
    foreach ($name in @($journal.new) + @($journal.old)) {
        if ($name -eq 'var' -or [IO.Path]::GetFileName($name) -ne $name -or $name -in @('.', '..', '')) { throw 'Unsafe update journal entry' }
    }
    foreach ($name in @($journal.new)) {
        $from = Join-Path $InstallRoot $name
        if (Test-Path -LiteralPath $from) { Move-Entry $from (Join-Path $StageRoot $name) }
        $script:journal.new = @($script:journal.new | Where-Object { $_ -ne $name }); Write-Journal
    }
    foreach ($name in @($journal.old)) {
        $from = Join-Path (Join-Path $BackupRoot 'program') $name
        if (Test-Path -LiteralPath $from) { Move-Entry $from (Join-Path $InstallRoot $name) }
        $script:journal.old = @($script:journal.old | Where-Object { $_ -ne $name }); Write-Journal
    }
    $script:journal.old = @(); $script:journal.new = @(); Write-Journal
}
try {
    $InstallRoot = [IO.Path]::GetFullPath($InstallRoot).TrimEnd('\')
    $StageRoot = [IO.Path]::GetFullPath($StageRoot).TrimEnd('\')
    $BackupRoot = [IO.Path]::GetFullPath($BackupRoot).TrimEnd('\')
    if ($InstallRoot -eq [IO.Path]::GetPathRoot($InstallRoot).TrimEnd('\') -or
        -not $StageRoot.StartsWith($InstallRoot + '.new-', [StringComparison]::OrdinalIgnoreCase) -or
        -not $BackupRoot.StartsWith($InstallRoot + '.old-', [StringComparison]::OrdinalIgnoreCase) -or
        [IO.Path]::GetDirectoryName($StageRoot) -ne [IO.Path]::GetDirectoryName($InstallRoot) -or
        [IO.Path]::GetDirectoryName($BackupRoot) -ne [IO.Path]::GetDirectoryName($InstallRoot)) { throw 'Unsafe installer transaction roots' }
    foreach ($root in @($InstallRoot, $StageRoot, $BackupRoot)) {
        if ((Test-Path -LiteralPath $root) -and ((Get-Item -LiteralPath $root -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw "Installer root is a reparse point: $root" }
    }
    $script:journalPath = Join-Path $BackupRoot 'transaction.json'
    if ($Action -eq 'Promote') {
        $dataRoots = @((Join-Path $env:LOCALAPPDATA $ProductName))
        if ($env:LXE_DATA_ROOT) { $dataRoots += $env:LXE_DATA_ROOT }
        foreach ($dataRoot in $dataRoots) {
            $dataPath = [IO.Path]::GetFullPath($dataRoot).TrimEnd('\')
            if ($InstallRoot.Equals($dataPath, [StringComparison]::OrdinalIgnoreCase) -or
                $InstallRoot.StartsWith($dataPath + '\', [StringComparison]::OrdinalIgnoreCase) -or
                $dataPath.StartsWith($InstallRoot + '\', [StringComparison]::OrdinalIgnoreCase)) { throw "Installation overlaps user data: $dataPath" }
        }
        if ([IO.Directory]::Exists($InstallRoot)) {
            $entries = @(Get-ChildItem -LiteralPath $InstallRoot -Force | Where-Object Name -ne 'var')
            if ($entries.Count -and -not ([IO.File]::Exists((Join-Path $InstallRoot $ExecutableName)) -and [IO.File]::Exists((Join-Path $InstallRoot 'resources\app.asar')))) {
                throw "Installation directory is not empty and is not an LXE installation: $InstallRoot"
            }
        }
        if (Test-Path -LiteralPath (Join-Path $StageRoot 'var')) { throw 'Installer payload must not contain var' }
        if (-not [IO.Directory]::Exists($StageRoot)) { throw "Staged application is missing: $StageRoot" }
        [IO.Directory]::CreateDirectory($InstallRoot) | Out-Null
        [IO.Directory]::CreateDirectory((Join-Path $BackupRoot 'program')) | Out-Null
        if ([IO.File]::Exists($journalPath)) { throw 'Transaction already exists; restore it before retrying' }
        $script:journal = @{install=$InstallRoot;stage=$StageRoot;backup=$BackupRoot;old=@();new=@()}
        Write-Journal
        # var remains in place, including when it is a user-managed junction.
        foreach ($entry in Get-ChildItem -LiteralPath $InstallRoot -Force) {
            if ($entry.Name -eq 'var') { continue }
            $journal.old += $entry.Name; Write-Journal
            Move-Entry $entry.FullName (Join-Path (Join-Path $BackupRoot 'program') $entry.Name)
        }
        foreach ($entry in Get-ChildItem -LiteralPath $StageRoot -Force) {
            $journal.new += $entry.Name; Write-Journal
            Move-Entry $entry.FullName (Join-Path $InstallRoot $entry.Name)
        }
    } elseif ($Action -eq 'Rollback') { Restore-Program }
    elseif ($Action -eq 'Commit') {
        # Only transaction-owned directories are removed. Never walk the install root.
        if ([IO.Directory]::Exists($StageRoot)) { [IO.Directory]::Delete($StageRoot, $true) }
        if ([IO.Directory]::Exists($BackupRoot)) { [IO.Directory]::Delete($BackupRoot, $true) }
    }
    [IO.File]::AppendAllText($ResultPath, ("`r`n" + $Action + ' succeeded'), $utf8)
    exit 0
} catch {
    $diagnostic = $_.Exception.ToString()
    if ($Action -eq 'Promote') {
        try { Restore-Program } catch { $diagnostic += "`r`nRollback failed: " + $_.Exception.ToString() }
    }
    [IO.File]::AppendAllText($ResultPath, ("`r`n" + $diagnostic + "`r`nBackup retained at: " + $BackupRoot), $utf8)
    exit 2
}
