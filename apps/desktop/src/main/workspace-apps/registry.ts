import { join } from 'node:path';
import { run } from './process';
export interface RegistryRecord { displayName: string; installLocation?: string; displayIcon?: string }
export interface RegistryView { appPaths: Record<string, string>; records: RegistryRecord[] }
// A missing key returns null; access denied / command failures remain real errors.
const SCRIPT = `
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
try {
$appPaths=@{}; $records=New-Object System.Collections.Generic.List[object]
foreach ($entry in @(
  @('CurrentUser','Software\\Microsoft\\Windows\\CurrentVersion\\App Paths','apps'),
  @('LocalMachine','SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths','apps'),
  @('CurrentUser','Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall','records'),
  @('LocalMachine','SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall','records'),
  @('LocalMachine','SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall','records')
)) {
  $hive=[Microsoft.Win32.RegistryKey]::OpenBaseKey([Enum]::Parse([Microsoft.Win32.RegistryHive],$entry[0]),[Microsoft.Win32.RegistryView]::Registry64)
  try {
    $root=$hive.OpenSubKey($entry[1])
    if ($null -eq $root) { continue }
    try {
      foreach ($name in $root.GetSubKeyNames()) {
        $key=$root.OpenSubKey($name)
        if ($null -eq $key) { continue }
        try {
          if ($entry[2] -eq 'apps') {
            $value=$key.GetValue('')
            if ($value -is [string] -and !$appPaths.ContainsKey($name.ToLowerInvariant())) { $appPaths[$name.ToLowerInvariant()]=$value }
          } else {
            $display=$key.GetValue('DisplayName')
            if ($display -is [string]) { $records.Add(@{displayName=$display;installLocation=$key.GetValue('InstallLocation');displayIcon=$key.GetValue('DisplayIcon')}) }
          }
        } finally { $key.Dispose() }
      }
    } finally { $root.Dispose() }
  } finally { $hive.Dispose() }
}
@{appPaths=$appPaths;records=@($records.ToArray())} | ConvertTo-Json -Depth 5 -Compress
} catch {
  [Console]::Error.WriteLine(($_ | Out-String))
  exit 1
}
`;
export async function readRegistry(execute = run, env = process.env): Promise<RegistryView> {
  const command = join(env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const value: unknown = JSON.parse(await execute(command, ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(SCRIPT, 'utf16le').toString('base64')]));
  if (!value || typeof value !== 'object') throw new Error('Invalid application registry response');
  const { appPaths, records } = value as RegistryView;
  if (!appPaths || typeof appPaths !== 'object' || !Array.isArray(records)
    || Object.values(appPaths).some(v => typeof v !== 'string')
    || records.some(r => !r || typeof r.displayName !== 'string')) throw new Error('Invalid application registry entries');
  return { appPaths, records };
}
