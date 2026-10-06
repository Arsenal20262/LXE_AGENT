param([Parameter(Mandatory=$true)][string]$Qualification,[switch]$ResumeMigration,[switch]$ContinueAfterMigration)
$ErrorActionPreference = 'Stop'
$q = Get-Content -LiteralPath $Qualification -Raw -Encoding UTF8 | ConvertFrom-Json
if ($q.appId -notmatch '^com\.lxe\.agent\.updatequalification\.[a-f0-9]{8}$') { throw 'Isolated application identity required' }
$first = [string]$q.installRoot
$second = $first + ' new location'
$data = Join-Path $env:LOCALAPPDATA $q.productName
if ((Test-Path -LiteralPath $data) -and -not $ContinueAfterMigration) { throw "Qualification data already exists: $data" }
function Assert([bool]$value,[string]$message) { if (-not $value) { throw $message } }
function Bun-Step([string[]]$arguments) {
    & bun @arguments
    if ($LASTEXITCODE -ne 0) { throw "Qualification command failed: $($arguments -join ' ') ($LASTEXITCODE)" }
}
function Install([string]$file,[string]$root,[switch]$Updated) {
    Write-Host "Installing $file into $root"
    $arguments = if ($Updated) { '/S --updated' } else { '/S' }
    $p = Start-Process -FilePath $file -ArgumentList ($arguments + ' "/D=' + $root + '"') -Wait -PassThru
    Assert ($p.ExitCode -eq 0) "Installer failed: $($p.ExitCode)"
    Write-Host "Installed into $root"
}
function Hashes([string]$root) {
    return ((Get-ChildItem -LiteralPath $root -File -Recurse | Sort-Object FullName | ForEach-Object { $_.FullName.Substring($root.Length) + ':' + (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash }) -join "`n")
}
function Stop-IsolatedApplication([string]$root) {
    $prefix = $root.TrimEnd('\') + '\'
    $owned = @(Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase) })
    foreach ($item in $owned) { if (Get-Process -Id $item.ProcessId -ErrorAction SilentlyContinue) { & taskkill /PID $item.ProcessId /T /F | Out-Null } }
    $deadline = [DateTime]::UtcNow.AddSeconds(20)
    do {
        $remaining = @(Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase) })
        if (-not $remaining.Count) { return }
        Start-Sleep -Milliseconds 200
    } while ([DateTime]::UtcNow -lt $deadline)
    throw 'Isolated application processes did not exit'
}
function Uninstall([string]$root) {
    $exe = @(Get-ChildItem -LiteralPath $root -Filter 'Uninstall*.exe')
    Assert ($exe.Count -eq 1) 'Expected one isolated uninstaller'
    $p = Start-Process -FilePath $exe[0].FullName -ArgumentList '/S /DELETE_LXE_DATA=1 --delete-app-data' -Wait -PassThru
    Assert ($p.ExitCode -eq 0) "Uninstaller failed: $($p.ExitCode)"
    $deadline = [DateTime]::UtcNow.AddSeconds(40)
    while ((Test-Path -LiteralPath (Join-Path $root ($q.productName + '.exe'))) -and [DateTime]::UtcNow -lt $deadline) { Start-Sleep -Milliseconds 200 }
    Assert (-not (Test-Path -LiteralPath (Join-Path $root ($q.productName + '.exe')))) 'Program was not removed'
}

if (-not $ContinueAfterMigration) {
    if (-not $ResumeMigration) {
        Install $q.artifacts[1] $first
        Bun-Step @('scripts/qualify-desktop-data.ts','seed',$Qualification)
        Bun-Step @('scripts/qualify-desktop-data.ts','native',$Qualification,'seed',$first)
    } else {
        Assert (Test-Path -LiteralPath (Join-Path $first 'var\config\secrets.bin')) 'Cannot resume without the original encrypted fixture'
    }
    $original = Hashes (Join-Path $first 'var')
    [IO.File]::WriteAllText((Join-Path $q.output 'source-before.sha256'),$original)
    Install $q.artifacts[2] $second
    Assert (Test-Path -LiteralPath (Join-Path $first ($q.productName + '.exe'))) 'Changing directory removed the original program'
    Assert ((Hashes (Join-Path $first 'var')) -eq $original) 'Changing directory modified the original data'
    Assert (Test-Path -LiteralPath (Join-Path $second 'lxe-legacy-data.ini')) 'Installer did not preserve migration provenance'

    # Wait for a loaded window and quit through Electron's normal shutdown path.
    try { Bun-Step @('scripts/qualify-desktop-data.ts','run-and-quit',$Qualification,'loaded',$second) }
    finally { Stop-IsolatedApplication $second }
} else {
    Assert (Test-Path -LiteralPath (Join-Path $data 'migrations\data-location-v1.json')) 'Cannot continue without completed migration'
    $original = [IO.File]::ReadAllText((Join-Path $q.output 'source-before.sha256'))
}
Assert ((Hashes (Join-Path $first 'var')) -eq $original) 'Migration changed the source data'
[IO.File]::WriteAllText((Join-Path $q.output 'source-after.sha256'),(Hashes (Join-Path $first 'var')))

$hidden = $first + '.qualification-backup'
Move-Item -LiteralPath $first -Destination $hidden
try {
    try { Bun-Step @('scripts/qualify-desktop-data.ts','run-and-quit',$Qualification,'loaded',$second) }
    finally { Stop-IsolatedApplication $second }
    Bun-Step @('scripts/qualify-desktop-data.ts','native',$Qualification,'check',$second)
    Bun-Step @('scripts/qualify-desktop-data.ts','check',$Qualification)
} finally { Move-Item -LiteralPath $hidden -Destination $first }
$dataBeforeUninstall = Hashes $data
$previousDataRoot = $env:LXE_DATA_ROOT
try {
    $env:LXE_DATA_ROOT = Join-Path $q.output ('independent data ' + [char]0x4E2D + [char]0x6587)
    Bun-Step @('scripts/qualify-desktop-data.ts','run-and-quit',$Qualification,'loaded',$second)
} finally { Stop-IsolatedApplication $second; $env:LXE_DATA_ROOT = $previousDataRoot }
Bun-Step @('scripts/qualify-desktop-data.ts','check-explicit',$Qualification)
Assert ((Hashes $data) -eq $dataBeforeUninstall) 'Explicit data root modified the default data'
$link = Join-Path ([Environment]::GetFolderPath('Desktop')) ($q.productName + '.lnk')
$shell = New-Object -ComObject WScript.Shell
Assert (Test-Path -LiteralPath $link) 'Isolated desktop shortcut is missing'
Assert ($shell.CreateShortcut($link).TargetPath -eq (Join-Path $second ($q.productName + '.exe'))) 'Shortcut does not target the new installation'
$registration = @(Get-ChildItem 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall' | Get-ItemProperty | Where-Object { $_.DisplayName -like ($q.productName + '*') })
Assert ($registration.Count -eq 1) 'Expected one isolated uninstall registration'
$installKey = 'HKCU:\Software\' + $registration[0].PSChildName
Assert ((Get-ItemProperty -LiteralPath $installKey).InstallLocation -eq $second) 'Registration does not target the new installation'
Uninstall $first
Assert (Test-Path -LiteralPath $link) 'Old uninstaller removed the active shortcut'
Assert (Test-Path -LiteralPath $registration[0].PSPath) 'Old uninstaller removed the active uninstall registration'
Assert ((Get-ItemProperty -LiteralPath $installKey).InstallLocation -eq $second) 'Old uninstaller changed active installation registration'
Assert ((Hashes $data) -eq $dataBeforeUninstall) 'Old uninstaller modified shared data'
Assert ((Hashes (Join-Path $first 'var')) -eq $original) 'Old uninstaller removed legacy var'
Uninstall $second
Assert (-not (Test-Path -LiteralPath $installKey)) 'Active uninstaller did not remove its registration'
Assert ((Hashes $data) -eq $dataBeforeUninstall) 'Active uninstaller modified shared data'
# Reinstall via the old in-app update environment to cover its injected var override.
$previousDataRoot = $env:LXE_DATA_ROOT
try {
    $env:LXE_DATA_ROOT = Join-Path $second 'var'
    Install $q.artifacts[2] $second -Updated
} finally { $env:LXE_DATA_ROOT = $previousDataRoot }
Bun-Step @('scripts/qualify-desktop-data.ts','native',$Qualification,'check',$second)
Bun-Step @('scripts/qualify-desktop-data.ts','check',$Qualification)
[IO.File]::WriteAllText((Join-Path $q.output 'data-install-results.json'), '{"automatic_migration":true,"manual_directory_change":true,"old_directory_retained":true,"source_unchanged":true,"old_directory_absent_check":true,"credentials":true,"old_uninstaller_registration_guard":true,"uninstall_data_preserved":true,"reinstall_data_reused":true,"legacy_update_environment":true,"graceful_shutdown":true}')
Write-Host 'PASS packaged migration, directory change, credentials, old-directory independence, retained-uninstaller guard and reinstall'
