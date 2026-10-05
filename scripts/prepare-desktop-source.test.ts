import { expect, test } from "bun:test";
import { posix, win32 } from "node:path";
import { prepareDesktopSource } from "./prepare-desktop-source";
import { sourceRuntimePaths } from "../apps/desktop/src/main/source-runtime-paths";
import { resolveDesktopPaths } from "../apps/desktop/src/main/paths";

test.each(["arm64", "x64"])("Mac %s prepares the existing resource owners in order", async arch => {
  const commands: string[][] = [];
  await prepareDesktopSource({ repositoryRoot: "/repo 中文 space", platform: "darwin", arch, bun: "/bin/bun", environment: {},
    log() {}, async run(command, options) { commands.push(command); expect(options.cwd).toBe("/repo 中文 space"); } });
  expect(commands.map(command => posix.basename(command[1]!))).toEqual([
    "prepare-desktop-macos-exiftool.ts", "prepare-desktop-fd.ts", "prepare-office-runtime.ts",
  ]);
  expect(commands.every(command => command[0] === "/bin/bun")).toBe(true);
});

test("Windows pins preparation and consumption to this checkout despite packaging overrides", async () => {
  const root = "D:\\项目 space\\checkout";
  const paths = sourceRuntimePaths(root, "win32", "x64");
  const environment = { Path: "C:\\foreign", SystemRoot: "C:\\Windows", LXE_DESKTOP_RUNTIME_ROOT: "C:\\foreign-runtime",
    LXE_DESKTOP_CACHE_ROOT: "C:\\foreign-cache", LXE_DESKTOP_RUNTIME_DESCRIPTOR: "C:\\foreign.json" };
  const commands: string[][] = [];
  await prepareDesktopSource({ repositoryRoot: root, platform: "win32", arch: "x64", bun: "C:\\Bun space\\bun.exe", environment,
    log() {}, async run(command, options) {
      commands.push(command);
      expect(options.cwd).toBe(root);
      expect(options.env.Path).toBeUndefined();
      expect(options.env.PATH).toBe("C:\\Bun space;C:\\foreign");
      if (commands.length === 1) {
        expect(options.env.LXE_DESKTOP_RUNTIME_DESCRIPTOR).toBe(paths.descriptor);
        expect(command[0]).toBe("C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe");
        expect(command.slice(-4)).toEqual(["-RuntimeRoot", paths.runtimeRoot, "-CacheRoot", paths.cacheRoot]);
      }
    } });
  expect(commands).toHaveLength(2);
  expect(commands[1]).toEqual(["C:\\Bun space\\bun.exe", win32.join(root, "scripts", "prepare-exec-sandbox.ts"), paths.sandboxRoot]);
  expect(environment.Path).toBe("C:\\foreign");
  expect(environment.LXE_DESKTOP_RUNTIME_DESCRIPTOR).toBe("C:\\foreign.json");
  const consumer = resolveDesktopPaths({ packaged: false, appPath: win32.join(root, "apps", "desktop"), executablePath: "electron.exe",
    resourcesPath: "unused", environment, platform: "win32", arch: "x64", pathExists: () => true });
  expect(consumer.officeNodePath).toBe(paths.node);
  expect(consumer.officeCliPath).toBe(paths.officeCli);
  expect(consumer.fdPath).toBe(paths.fd);
  expect(consumer.exifToolPath).toBe(paths.exifTool);
  expect(consumer.execSandboxRunnerPath).toBe(paths.sandboxRunner);
  expect(consumer.managedPythonPath).toBe(win32.join(root, ".venv", "Scripts", "python.exe"));
});

test.each(["darwin", "win32"] as const)("%s preserves resource errors and does not execute later steps", async platform => {
  const error = new Error("EACCES: fixture resource cannot be opened");
  const calls: string[][] = [], logs: string[] = [];
  await expect(prepareDesktopSource({ platform, arch: "x64", environment: {}, log: message => logs.push(message),
    async run(command) { calls.push(command); throw error; } })).rejects.toBe(error);
  expect(calls).toHaveLength(1);
  expect(logs.at(-1)).toStartWith("Failed to prepare ");
});

test.each([["linux", "x64"], ["win32", "arm64"], ["darwin", "ia32"]] as const)("unsupported %s-%s fails before preparing resources", async (platform, arch) => {
  let calls = 0;
  await expect(prepareDesktopSource({ platform, arch, async run() { calls++; } })).rejects.toThrow(`Unsupported desktop source platform: ${platform}-${arch}`);
  expect(calls).toBe(0);
});
