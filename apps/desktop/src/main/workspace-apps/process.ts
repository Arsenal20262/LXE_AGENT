import { execFile, spawn } from 'node:child_process';
import type { Launch } from './catalog';

export function externalEnvironment(source = process.env): Record<string, string> {
  return Object.fromEntries(Object.entries(source).filter(([key, value]) => value !== undefined
    && !/KEY|PASSWORD|SECRET|TOKEN/i.test(key) && !/^(LXE_|AGENT_|DSH_|ELECTRON_|NODE_OPTIONS$)/i.test(key))) as Record<string, string>;
}
export function diagnostic(error: unknown): string {
  let text = error instanceof Error ? error.message : String(error);
  for (const [key, value] of Object.entries(process.env)) {
    if (/KEY|PASSWORD|SECRET|TOKEN/i.test(key) && value && value.length >= 4) text = text.split(value).join('[redacted]');
  }
  return text.length > 8192 ? text.slice(0, 8192) + '\n[truncated at 8192 characters]' : text;
}
export const run = (file: string, args: readonly string[], timeout = 10000): Promise<string> => new Promise((resolve, reject) => {
  execFile(file, [...args], { windowsHide: true, encoding: 'utf8', timeout, maxBuffer: 8 * 1024 * 1024, env: externalEnvironment() }, (error, stdout, stderr) => {
    if (error) reject(new Error(diagnostic([stderr.trim(), error.message].filter(Boolean).join('\n')), { cause: error }));
    else resolve(stdout.replace(/^\uFEFF/, ''));
  });
});
export const missing = (error: unknown): boolean => !!error && typeof error === 'object'
  && (['ENOENT', 'ENOTDIR'].includes(String(Reflect.get(error, 'code'))) || missing(Reflect.get(error, 'cause')));
export function launchArgs(args: readonly string[], path: string): string[] {
  return args.some(arg => arg.includes('{path}')) ? args.map(arg => arg.replaceAll('{path}', path)) : [...args, path];
}
/** Observe early failures without tying the lifetime of an external GUI to ours. */
export function launchDetached(launch: Extract<Launch, { kind: 'argv' }>, path: string, watchMs = 1000): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(launch.command, launchArgs(launch.args, path), {
      detached: true, stdio: 'ignore', windowsHide: launch.windowsHide ?? false,
      env: { ...externalEnvironment(), ...launch.env },
    });
    let done = false;
    const finish = (error?: unknown) => {
      if (done) { if (error) console.warn('Workspace application late launch failure:', diagnostic(error)); return; }
      done = true; clearTimeout(timer); child.unref();
      if (error) reject(error); else resolve();
    };
    const timer = setTimeout(() => finish(), watchMs);
    child.once('error', finish);
    child.once('exit', (code, signal) => finish(code === 0 ? undefined : new Error(`${launch.command}: launcher exited with code ${code}, signal ${signal}`)));
  });
}
