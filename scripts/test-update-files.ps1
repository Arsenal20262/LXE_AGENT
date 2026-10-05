param([string]$OutputRoot)
$ErrorActionPreference = 'Stop'
if (-not $OutputRoot) { $OutputRoot = Join-Path $env:TEMP ('lxe-update-files-' + [guid]::NewGuid().ToString('N')) }
$helper = Join-Path $PSScriptRoot '..\apps\desktop\resources\update-files.ps1'
[IO.Directory]::CreateDirectory($OutputRoot) | Out-Null
$passed = @()
function Assert([bool]$condition, [string]$message) { if (-not $condition) { throw $message } }
function Prepare([string]$name) {
    $script:install = Join-Path $OutputRoot ($name + ' ' + [char]0x6D4B + [char]0x8BD5)
    $script:stage = $install + '.new-test'
    $script:backup = $install + '.old-test'
    $script:result = $install + '.log'
    [IO.Directory]::CreateDirectory((Join-Path $install 'var\db')) | Out-Null
    [IO.Directory]::CreateDirectory($stage) | Out-Null
    [IO.File]::WriteAllText((Join-Path $install 'a.exe'), 'old-a')
    [IO.File]::WriteAllText((Join-Path $install 'z.exe'), 'old-z')
    [IO.File]::WriteAllText((Join-Path $install 'var\db\agent.sqlite3'), 'database sentinel')
    [IO.File]::WriteAllText((Join-Path $stage 'a.exe'), 'new-a')
    [IO.File]::WriteAllText((Join-Path $stage 'z.exe'), 'new-z')
}
function Run([string]$action, [int]$expected=0) {
    & powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $helper -Action $action -InstallRoot $install -StageRoot $stage -BackupRoot $backup -ResultPath $result
    Assert ($LASTEXITCODE -eq $expected) "$action exit $LASTEXITCODE, expected $expected`: $([IO.File]::ReadAllText($result))"
    Assert ([IO.File]::ReadAllText((Join-Path $install 'var\db\agent.sqlite3')) -eq 'database sentinel') 'var was modified'
}
Prepare 'commit'
Run 'Promote'
Assert ([IO.File]::ReadAllText((Join-Path $install 'a.exe')) -eq 'new-a') 'New program not promoted'
Run 'Commit'
Assert (-not (Test-Path -LiteralPath $backup)) 'Backup not cleaned after commit'
$passed += 'promote/commit preserves var and handles Unicode/space paths'
Prepare 'rollback'
Run 'Promote'; Run 'Rollback'; Run 'Rollback'
Assert ([IO.File]::ReadAllText((Join-Path $install 'a.exe')) -eq 'old-a') 'Rollback did not restore old program'
$passed += 'explicit rollback is repeatable'
Prepare 'locked-old'
$handle = [IO.File]::Open((Join-Path $install 'z.exe'), [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::None)
try { Run 'Promote' 2 } finally { $handle.Dispose() }
Assert ([IO.File]::ReadAllText((Join-Path $install 'a.exe')) -eq 'old-a') 'Partial backup failed to restore'
Assert ([IO.File]::ReadAllText($result).Contains('IOException')) 'Actual lock error not retained'
$passed += 'locked old file restores previously moved files'
Prepare 'locked-new'
$handle = [IO.File]::Open((Join-Path $stage 'z.exe'), [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::None)
try { Run 'Promote' 2 } finally { $handle.Dispose() }
Assert ([IO.File]::ReadAllText((Join-Path $install 'a.exe')) -eq 'old-a') 'Partial new promotion failed to restore'
Assert ([IO.File]::ReadAllText((Join-Path $install 'z.exe')) -eq 'old-z') 'Old program was lost'
$passed += 'locked new file rolls back after partial promotion'
Prepare 'unsafe-payload'
[IO.Directory]::CreateDirectory((Join-Path $stage 'var')) | Out-Null
Run 'Promote' 2
Assert ([IO.File]::ReadAllText((Join-Path $install 'a.exe')) -eq 'old-a') 'Invalid payload changed program'
$passed += 'payload cannot replace var'
Prepare 'cleanup-diagnostic'
[IO.File]::WriteAllText($result, '7za exit: 2; fixture extraction failure')
Run 'Commit'
Assert ([IO.File]::ReadAllText($result).Contains('fixture extraction failure')) 'Cleanup overwrote the original failure'
$passed += 'staging cleanup preserves the original extraction diagnostic'
$passed | ForEach-Object { Write-Host "PASS $_" }
Write-Host "Passed $($passed.Count) Windows filesystem scenarios. Artifacts: $OutputRoot"
