import { posix, resolve, win32 } from "node:path";
import { sourceRuntimePaths } from "../apps/desktop/src/main/source-runtime-paths";

interface CommandOptions {
  cwd: string;
  env: Record<string, string | undefined>;
}
interface PreparationStep {
  name: string;
  run(): Promise<void>;
}
export interface PrepareDesktopSourceOptions {
  repositoryRoot?: string;
  platform?: NodeJS.Platform;
  arch?: string;
  bun?: string;
  environment?: Record<string, string | undefined>;
  run?: (command: string[], options: CommandOptions) => Promise<void>;
  log?: (message: string) => void;
}

async function runCommand(command: string[], options: CommandOptions): Promise<void> {
  const child = Bun.spawn(command, { ...options, stdin: "inherit", stdout: "inherit", stderr: "inherit" });
  const code = await child.exited;
  if (code !== 0) throw new Error(`${command[0]} exited with ${child.signalCode ?? code}`);
}

/** Select resource owners once; each owner retains its own cache and validation. */
export async function prepareDesktopSource(options: PrepareDesktopSourceOptions = {}): Promise<void> {
  const root = options.repositoryRoot ?? resolve(import.meta.dirname, "..");
  const platform = options.platform ?? process.platform;
  const arch = options.arch ?? process.arch;
  if (!new Set(["darwin-arm64", "darwin-x64", "win32-x64"]).has(`${platform}-${arch}`)) {
    throw new Error(`Unsupported desktop source platform: ${platform}-${arch}`);
  }
  const path = platform === "win32" ? win32 : posix;
  const paths = sourceRuntimePaths(root, platform, arch);
  const bun = options.bun ?? process.execPath;
  const env = { ...(options.environment ?? process.env) };
  // The existing PowerShell resource owner resolves Bun through PATH. Pin that
  // lookup to the Bun running this entrypoint, including Windows' Path casing.
  const pathKeys = Object.keys(env).filter(key => platform === "win32" ? key.toLowerCase() === "path" : key === "PATH");
  const inheritedPath = pathKeys.map(key => env[key]).find(Boolean);
  for (const key of pathKeys) delete env[key];
  env.PATH = [path.dirname(bun), inheritedPath].filter(Boolean).join(path.delimiter);
  const run = options.run ?? runCommand;
  const script = (name: string, args: string[] = []) => () => run([bun, path.join(root, "scripts", name), ...args], { cwd: root, env });
  const plans: Partial<Record<NodeJS.Platform, PreparationStep[]>> = {
    darwin: [
      { name: "ExifTool", run: script("prepare-desktop-macos-exiftool.ts") },
      { name: "fd", run: script("prepare-desktop-fd.ts") },
      { name: "Office", run: script("prepare-office-runtime.ts") },
    ],
    win32: [
      { name: "Windows managed runtime", run: () => run([
        env.SystemRoot ? path.join(env.SystemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe") : "powershell.exe",
        "-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(root, "scripts", "prepare-desktop-runtime.ps1"),
        "-RuntimeRoot", paths.runtimeRoot, "-CacheRoot", paths.cacheRoot,
      ], { cwd: root, env: { ...env, LXE_DESKTOP_RUNTIME_DESCRIPTOR: paths.descriptor } }) },
      { name: "Windows exec sandbox", run: script("prepare-exec-sandbox.ts", [paths.sandboxRoot]) },
    ],
  };
  const log = options.log ?? console.log;
  for (const step of plans[platform]!) {
    log(`==> Prepare ${step.name}`);
    try { await step.run(); }
    catch (error) { log(`Failed to prepare ${step.name}`); throw error; }
  }
}

if (import.meta.main) await prepareDesktopSource();
