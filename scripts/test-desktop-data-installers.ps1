param([Parameter(Mandatory=$true)][string]$Qualification)
$ErrorActionPreference = 'Stop'
$q = Get-Content -LiteralPath $Qualification -Raw -Encoding UTF8 | ConvertFrom-Json
if ($q.appId -notmatch '^com\.lxe\.agent\.updatequalification\.[a-f0-9]{8}$') { throw 'Isolated application identity required' }
$first = [string]$q.installRoot
$second = $first + ' new location'
$data = Join-Path $env:LOCALAPPDATA $q.productName
if (Test-Path -LiteralPath $data) { throw "Qualification data already exists: $data" }
function Assert([bool]$value,[string]$message) { if (-not $value) { throw $message } }
function Bun-Step([string[]]$arguments) {
    & bun @arguments
    if ($LASTEXITCODE -ne 0) { throw "Qualification command failed: $($arguments -join ' ') ($LASTEXITCODE)" }
}
function Install([string]$file,[string]$root) {
    Write-Host "Installing $file into $root"
    $p = Start-Process -FilePath $file -ArgumentList ('/S "/D=' + $root + '"') -Wait -PassThru
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

Install $q.artifacts[1] $first
Bun-Step @('scripts/qualify-desktop-data.ts','seed',$Qualification)
Bun-Step @('scripts/qualify-desktop-data.ts','native',$Qualification,'seed',$first)
$original = Hashes (Join-Path $first 'var')
Install $q.artifacts[2] $second
Assert (Test-Path -LiteralPath (Join-Path $first ($q.productName + '.exe'))) 'Changing directory removed the original program'
Assert ((Hashes (Join-Path $first 'var')) -eq $original) 'Changing directory modified the original data'
Assert (Test-Path -LiteralPath (Join-Path $second 'lxe-legacy-data.ini')) 'Installer did not preserve migration provenance'

# Exercise the packaged main process, including bootstrap profile and automatic relaunch.
$started = Start-Process -FilePath (Join-Path $second ($q.productName + '.exe')) -PassThru
try {
    $marker = Join-Path $data 'migrations\data-location-v1.json'
    $deadline = [DateTime]::UtcNow.AddSeconds(120)
    while (-not (Test-Path -LiteralPath $marker) -and [DateTime]::UtcNow -lt $deadline) {
        if (Test-Path -LiteralPath ($data + '.migration-error.json')) { throw ([IO.File]::ReadAllText($data + '.migration-error.json')) }
        Start-Sleep -Milliseconds 300
    }
    Assert (Test-Path -LiteralPath $marker) 'Packaged automatic migration did not finish'
    Start-Sleep -Seconds 3
} finally { Stop-IsolatedApplication $second }
Assert ((Hashes (Join-Path $first 'var')) -eq $original) 'Migration changed the source data'

$hidden = $first + '.qualification-backup'
Move-Item -LiteralPath $first -Destination $hidden
try {
    Bun-Step @('scripts/qualify-desktop-data.ts','native',$Qualification,'check',$second)
    Bun-Step @('scripts/qualify-desktop-data.ts','check',$Qualification)
} finally { Move-Item -LiteralPath $hidden -Destination $first }
$dataBeforeUninstall = Hashes $data
$link = Join-Path ([Environment]::GetFolderPath('Desktop')) ($q.productName + '.lnk')
$shell = New-Object -ComObject WScript.Shell
Assert (Test-Path -LiteralPath $link) 'Isolated desktop shortcut is missing'
Assert ($shell.CreateShortcut($link).TargetPath -eq (Join-Path $second ($q.productName + '.exe'))) 'Shortcut does not target the new installation'
Uninstall $first
Assert (Test-Path -LiteralPath $link) 'Old uninstaller removed the active shortcut'
Assert ((Hashes $data) -eq $dataBeforeUninstall) 'Old uninstaller modified shared data'
Assert ((Hashes (Join-Path $first 'var')) -eq $original) 'Old uninstaller removed legacy var'
Uninstall $second
Assert ((Hashes $data) -eq $dataBeforeUninstall) 'Active uninstaller modified shared data'
Install $q.artifacts[2] $second
Bun-Step @('scripts/qualify-desktop-data.ts','native',$Qualification,'check',$second)
Bun-Step @('scripts/qualify-desktop-data.ts','check',$Qualification)
[IO.File]::WriteAllText((Join-Path $q.output 'data-install-results.json'), '{"automatic_migration":true,"manual_directory_change":true,"old_directory_retained":true,"source_unchanged":true,"old_directory_absent_check":true,"credentials":true,"old_uninstaller_registration_guard":true,"uninstall_data_preserved":true,"reinstall_data_reused":true}')
Write-Host 'PASS packaged migration, directory change, credentials, old-directory independence, retained-uninstaller guard and reinstall'
