/** Real Windows Shell discovery and invocation with a private extension and a private executable. */
import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { expect, test } from 'bun:test'
import { nativeFileApplications, openNativeFileApplication } from '../src/main/file-preview/native/file-applications'
import { runNativeCommand, type NativeCommandRunner } from '../src/main/file-preview/native/runner'

/** Encode fixture data without placing its quotes or Unicode in executable PowerShell text. */
function literal(value: string): string {
  return `[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${Buffer.from(value).toString('base64')}'))`
}

test.skipIf(process.platform !== 'win32')('queries and invokes a registered Windows handler through the system Shell', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lxe-windows-association-'))
  const suffix = randomUUID().replaceAll('-', '')
  const extension = `.lxe${suffix}`
  const progId = `LXE.Test.${suffix}`
  const appName = `lxe-handler-${suffix}.exe`
  const executable = join(root, appName)
  const path = join(root, `${String.fromCharCode(0x6d4b, 0x8bd5)} ' audio${extension}`)
  const marker = join(root, 'opened.txt')
  const lifetime = new AbortController()
  const signal = AbortSignal.any([AbortSignal.timeout(45000), lifetime.signal])
  const active = new Set<Promise<Awaited<ReturnType<NativeCommandRunner>>>>()
  let phase = 'compile fixture'
  const run: NativeCommandRunner = (command, args, operationSignal, window) => {
    const pending = runNativeCommand(command, args, operationSignal, window)
    active.add(pending)
    void pending.then(() => active.delete(pending), () => active.delete(pending))
    return pending
  }
  const runScript = async (source: string): Promise<void> => {
    await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(source, 'utf16le').toString('base64')], signal, 'hidden')
  }
  const cleanup = async () => {
    lifetime.abort()
    await Promise.allSettled([...active])
    try {
      await runNativeCommand('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(`
$root = [Microsoft.Win32.Registry]::CurrentUser
$root.DeleteSubKeyTree('Software\\Classes\\${extension}', $false)
$root.DeleteSubKeyTree('Software\\Classes\\${progId}', $false)
$root.DeleteSubKeyTree('Software\\Classes\\Applications\\${appName}', $false)
`, 'utf16le').toString('base64')], new AbortController().signal, 'hidden')
    } finally { await rm(root, { recursive: true, force: true }) }
  };
  try {
  await writeFile(path, 'test')
  // A dedicated executable accepts the file directly; no pre-existing Node association can discard fixture-script arguments.
  await runScript(`$ErrorActionPreference = 'Stop'
Add-Type -ReferencedAssemblies System -OutputAssembly (${literal(executable)}) -OutputType ConsoleApplication -TypeDefinition @'
using System;
using System.IO;
using System.Diagnostics;
public static class Handler {
  public static void Main(string[] args) {
    File.WriteAllLines(${JSON.stringify(marker)}, new string[] { args.Length == 0 ? "(no file argument)" : args[0], Process.GetCurrentProcess().Id.ToString() });
  }
}
'@
`)
  phase = 'verify fixture executable'
  await run(executable, [path], signal, 'hidden')
  expect((await readFile(marker, 'utf8')).split(/\r?\n/)[0]).toBe(path)
  await rm(marker)
  phase = 'register association'
  const command = literal(`"${executable}" "%1"`)
  await runScript(`$ErrorActionPreference = 'Stop'
$root = [Microsoft.Win32.Registry]::CurrentUser
$key = $root.CreateSubKey('Software\\Classes\\${extension}')
$key.SetValue('', '${progId}'); $key.Dispose()
$key = $root.CreateSubKey('Software\\Classes\\${extension}\\OpenWithProgids')
$key.SetValue('${progId}', ''); $key.Dispose()
$key = $root.CreateSubKey('Software\\Classes\\${progId}\\shell\\open\\command')
$key.SetValue('', ${command}); $key.Dispose()
$key = $root.CreateSubKey('Software\\Classes\\Applications\\${appName}\\shell\\open\\command')
$key.SetValue('', ${command}); $key.Dispose()
$key = $root.CreateSubKey('Software\\Classes\\Applications\\${appName}\\SupportedTypes')
$key.SetValue('${extension}', ''); $key.Dispose()
`)
  phase = 'query associations'
  const applications = await nativeFileApplications(path, signal, { run })
  const expected = applications.find(app => app.id.toLowerCase() === executable.toLowerCase())
  expect(expected).toMatchObject({ default: true, name: expect.any(String) as string })
  phase = 'invoke handler'
  await openNativeFileApplication(path, expected!.id, signal, { run })
  phase = 'wait for fixture marker'
  let opened: string[] = []
  await waitUntil(async () => {
    signal.throwIfAborted()
    try { opened = (await readFile(marker, 'utf8')).trim().split(/\r?\n/) } catch (_error) { return false }
    return true
  }, { timeout: 8000 })
  // Windows Shell can expand an 8.3 input path to its long spelling.
  expect(await realpath(opened[0]!)).toBe(await realpath(path))
  const pid = Number(opened[1])
  expect(pid).toBeGreaterThan(0)
  phase = 'wait for fixture exit'
  await waitUntil(() => {
    signal.throwIfAborted()
    try { process.kill(pid, 0); return false } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ESRCH') return true
      throw error
    }
  }, { timeout: 8000 })
  phase = 'default Electron open and reveal'
  await rm(marker)
  const electronScript = join(root, 'default-open.cjs')
  await writeFile(electronScript, `const {app,shell}=require('electron');
app.setPath('userData',${JSON.stringify(join(root, 'electron-profile'))});
app.disableHardwareAcceleration();
app.whenReady().then(async()=>{const error=await shell.openPath(${JSON.stringify(path)});if(error)throw new Error(error);shell.showItemInFolder(${JSON.stringify(path)});app.exit(0);}).catch(e=>{console.error(e);app.exit(1);});`)
  const electron = createRequire(import.meta.url)(resolve(import.meta.dirname, '../node_modules/electron')) as string
  await run(electron, [electronScript], signal, 'hidden')
  await waitUntil(async () => {
    try { return await realpath((await readFile(marker, 'utf8')).trim().split(/\r?\n/)[0]!) === await realpath(path) }
    catch { return false }
  }, { timeout: 8000 })
  phase = 'reject a stale selected application'
  await rm(executable)
  await expect(openNativeFileApplication(path, expected!.id, signal, { run })).rejects.toThrow()
  } catch (error) { console.error("Native acceptance phase:", phase); throw error; }
  finally { await cleanup(); }
}, 60000)

test.skipIf(process.platform !== 'win32')('Windows lists relevant apps and icons, distinguishes no association, and rejects arbitrary apps', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lxe-windows-app-list-'))
  const signal = AbortSignal.timeout(30000)
  try {
    const text = join(root, 'text sample.txt'), unknown = join(root, `.file.lxe${randomUUID().replaceAll('-', '')}`)
    await writeFile(text, 'LXE preview'); await writeFile(unknown, 'LXE preview')
    const apps = await nativeFileApplications(text, signal)
    expect(apps.some(app => app.default)).toBe(true)
    expect(apps.some(app => app.icon?.startsWith('data:image/png;base64,'))).toBe(true)
    expect(await nativeFileApplications(unknown, signal)).toEqual([])
    await expect(openNativeFileApplication(text, join(root, 'unregistered.exe'), signal)).rejects.toThrow('Application is not registered')
  } finally { await rm(root, { recursive: true, force: true }) }
}, 40000)

async function waitUntil(check: () => boolean | Promise<boolean>, { timeout }: { timeout: number }): Promise<void> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { if (await check()) return; await new Promise(resolve => setTimeout(resolve, 50)); }
  throw new Error(`Windows Shell handoff did not complete within ${timeout} ms`);
}
