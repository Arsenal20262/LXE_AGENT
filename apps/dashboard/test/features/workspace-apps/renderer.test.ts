import { expect, test } from 'bun:test';
import { closeSync, mkdtempSync, openSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'vite';
const require = createRequire(import.meta.url);

test('workspace application menus and native IPC in real Electron', async () => {
  const output = mkdtempSync(resolve(tmpdir(), 'lxe-open-app-renderer-'));
  const profile = mkdtempSync(resolve(tmpdir(), 'lxe-open-app-profile-'));
  const logs = mkdtempSync(resolve(tmpdir(), 'lxe-open-app-logs-'));
  try {
    await build({ root: resolve(import.meta.dirname, '../../..'), logLevel: 'error', build: { outDir: output, emptyOutDir: true, target: 'es2022', minify: false, rollupOptions: { input: resolve(import.meta.dirname, 'renderer.html') } } });
    for (const name of ['host', 'preload']) {
      const result = await Bun.build({ entrypoints: [resolve(import.meta.dirname, name + '.ts')], outdir: resolve(output, 'main'), naming: '[name].cjs', target: 'node', format: 'cjs', external: ['electron'] });
      if (!result.success) throw new Error(result.logs.map(String).join('\n'));
    }
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
    // Windows shell launches may inherit output handles. File output lets the test
    // finish when Electron exits, independently of the external apps it opened.
    const stdoutPath = resolve(logs, 'stdout.log'), stderrPath = resolve(logs, 'stderr.log');
    const stdoutFd = openSync(stdoutPath, 'w'), stderrFd = openSync(stderrPath, 'w');
    const child = Bun.spawn([require(resolve(import.meta.dirname, '../../../../desktop/node_modules/electron')), resolve(import.meta.dirname, 'runner.cjs'), profile, output], { env, stdout: stdoutFd, stderr: stderrFd });
    const timer = setTimeout(() => child.kill(), 90000);
    try {
      const code = await child.exited;
      const stdout = readFileSync(stdoutPath, 'utf8'), stderr = readFileSync(stderrPath, 'utf8');
      console.log(stdout);
      expect(code, stdout + '\n' + stderr).toBe(0);
      const line = stdout.split('\n').find(line => line.startsWith('LXE_WORKSPACE_RESULT='));
      expect(line).toBeDefined();
      expect(JSON.parse(line!.slice(21)).passed).toHaveLength(8);
    } finally {
      clearTimeout(timer);
      if (child.exitCode === null) { child.kill(); await child.exited; }
      closeSync(stdoutFd); closeSync(stderrFd);
    }
  } finally {
    rmSync(output, { recursive: true, force: true, maxRetries: 5 });
    rmSync(profile, { recursive: true, force: true, maxRetries: 5 });
    try { rmSync(logs, { recursive: true, force: true }); }
    catch (error) { console.warn(`Native application test logs retained at ${logs}: ${String(error)}`); }
  }
}, 115000);
