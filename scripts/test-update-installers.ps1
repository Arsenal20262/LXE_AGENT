param([Parameter(Mandatory=$true)][string]$Qualification)
$ErrorActionPreference = 'Stop'
$q = Get-Content -LiteralPath $Qualification -Raw -Encoding UTF8 | ConvertFrom-Json
if (-not $q.appId.StartsWith('com.lxe.agent.updatequalification.') -or -not $q.cache.StartsWith('lxe-update-qualification-')) { throw 'Isolated qualification identity required' }
$install = [string]$q.installRoot
$cache = Join-Path $env:LOCALAPPDATA $q.cache
function Assert([bool]$condition,[string]$message) { if (-not $condition) { throw $message } }
function Wait-Removed([string]$path) {
    $deadline = [DateTime]::UtcNow.AddSeconds(60)
    while ((Test-Path -LiteralPath $path) -and [DateTime]::UtcNow -lt $deadline) { Start-Sleep -Milliseconds 200 }
    Assert (-not (Test-Path -LiteralPath $path)) "Uninstaller did not remove: $path"
}
function Install([string]$file,[bool]$update=$false) {
    $arguments = '/S ' + $(if ($update) { '--updated ' } else { '' }) + '"/D=' + $install + '"'
    $process = Start-Process -FilePath $file -ArgumentList $arguments -Wait -PassThru
    Assert ($process.ExitCode -eq 0) "Installer exit code: $($process.ExitCode)"
}
Install $q.artifacts[0]
Assert (Test-Path -LiteralPath (Join-Path $install ($q.productName + '.exe'))) 'Isolated application was not installed'
[IO.Directory]::CreateDirectory((Join-Path $install 'var\db')) | Out-Null
[IO.Directory]::CreateDirectory((Join-Path $install 'var\workspace')) | Out-Null
[IO.File]::WriteAllText((Join-Path $install 'var\settings.json'), '{"qualification":true}')
[IO.File]::WriteAllText((Join-Path $install 'var\workspace\data.txt'), 'must survive upgrades')
$seed = Join-Path $q.output 'seed.cjs'
[IO.File]::WriteAllText($seed, 'const {Database}=require("bun:sqlite");const db=new Database(process.argv[2],{create:true});db.exec("create table marker(value integer);insert into marker values(42)");db.close();')
& bun $seed (Join-Path $install 'var\db\agent.sqlite3')
Assert ($LASTEXITCODE -eq 0) 'SQLite fixture failed'
function Data-Hashes {
    return ((Get-ChildItem -LiteralPath (Join-Path $install 'var') -File -Recurse | Sort-Object FullName | ForEach-Object { $_.FullName + ':' + (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash }) -join "`n")
}
$before = Data-Hashes
$appFile = Join-Path $install ($q.productName + '.exe')
$oldProgram = (Get-FileHash -LiteralPath $appFile -Algorithm SHA512).Hash
$oldCache = (Get-FileHash -LiteralPath (Join-Path $cache 'installer.exe') -Algorithm SHA512).Hash
$locked = [IO.File]::Open($appFile, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
try {
    $failed = Start-Process -FilePath $q.artifacts[1] -ArgumentList ('/S --updated "/D=' + $install + '"') -Wait -PassThru
    Assert ($failed.ExitCode -eq 2) "Expected transactional replacement failure, received $($failed.ExitCode)"
} finally { $locked.Dispose() }
Assert ((Get-FileHash -LiteralPath $appFile -Algorithm SHA512).Hash -eq $oldProgram) 'Failed upgrade changed the old program'
Assert ((Get-FileHash -LiteralPath (Join-Path $cache 'installer.exe') -Algorithm SHA512).Hash -eq $oldCache) 'Failed upgrade replaced the old installer cache'
Assert ((Data-Hashes) -eq $before) 'Failed upgrade changed var'
Write-Host 'PASS locked installed executable prevents replacement; old program, data and cache survive'
for ($i=1; $i -lt 3; $i++) {
    Install $q.artifacts[$i] $true
    Assert ((Data-Hashes) -eq $before) 'Database, settings or workspace changed during update'
    Assert ((Get-FileHash -LiteralPath (Join-Path $cache 'installer.exe') -Algorithm SHA512).Hash -eq (Get-FileHash -LiteralPath $q.artifacts[$i] -Algorithm SHA512).Hash) 'Installed cache does not match committed installer'
    Write-Host "PASS installed version 0.0.$($i+1), preserved var, seeded matching installer cache"
}
# Default uninstall must preserve data. The explicit delete fixture uses a no-op tunnel helper.
$uninstaller = Get-ChildItem -LiteralPath $install -Filter 'Uninstall*.exe' | Select-Object -First 1
Assert ($null -ne $uninstaller) 'Uninstaller missing'
$process = Start-Process -FilePath $uninstaller.FullName -ArgumentList '/S' -Wait -PassThru
Assert ($process.ExitCode -eq 0) 'Default uninstall failed'
Wait-Removed (Join-Path $install ($q.productName + '.exe'))
Assert ((Data-Hashes) -eq $before) 'Default uninstall removed data'
Install $q.artifacts[2]
$uninstaller = Get-ChildItem -LiteralPath $install -Filter 'Uninstall*.exe' | Select-Object -First 1
$process = Start-Process -FilePath $uninstaller.FullName -ArgumentList '/S /DELETE_LXE_DATA=1' -Wait -PassThru
Assert ($process.ExitCode -eq 0) 'Explicit data removal failed'
Wait-Removed (Join-Path $install 'var')
Assert (-not (Test-Path -LiteralPath (Join-Path $install 'var'))) 'Explicit uninstall retained data unexpectedly'
[IO.File]::WriteAllText((Join-Path $q.output 'install-results.json'), '{"legacy_upgrade":true,"new_upgrade":true,"var_preserved":true,"cache_matches":true,"locked_file_rollback":true,"uninstall_keep":true,"uninstall_delete":true}')
Write-Host "PASS default uninstall retains var; explicit fixture deletion removes it; no real tunnel changed"
