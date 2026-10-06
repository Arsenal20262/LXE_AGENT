import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { initializeDataRoot, legacyDataSources } from "./data-migration";
import { relocateGatewayData } from "./gateway-store";
import type { DesktopPaths } from "./paths";
import type { SafeStoragePort } from "./config-store/repository";

const run = promisify(execFile);
export async function bootstrapUserData(paths: DesktopPaths, appId: string, safeStorage: SafeStoragePort,
  select: (sources: string[]) => Promise<string | undefined>): Promise<boolean> {
  const sources = legacyDataSources(paths.projectRoot, appId);
  const source = sources.length > 1 ? await select(sources) : sources[0];
  if (sources.length > 1 && !source) return false;
  if (source && !sources.includes(source)) throw new Error("Selected migration source was not discovered");
  await initializeDataRoot(paths.dataRoot, source, {
    assertIdle: async root => {
      await run(join(process.env.SystemRoot ?? "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe"),
        ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", join(paths.projectRoot, "resources", "data-migration-idle.ps1"), "-SourceRoot", root, "-OwnerPid", String(process.pid)], {windowsHide: true});
    },
    migrateOwnedState: async (copy, from, to) => {
      await run(paths.agentCommand, ["relocate-data", "--copy", copy, "--source", from, "--target", to], {windowsHide: true, maxBuffer: 1024 * 1024});
      relocateGatewayData(join(copy, "db", "gateway.sqlite3"), from, to);
      await run(paths.managedPythonPath, ["-m", "shared.db.relocate_data", "--copy", copy, "--source", from, "--target", to], {windowsHide: true, maxBuffer: 1024 * 1024});
    },
    validateCredentials: async copy => {
      const secrets = join(copy, "config", "secrets.bin");
      if (!existsSync(secrets)) return;
      if (!safeStorage.isEncryptionAvailable()) throw new Error("Secure credential storage is unavailable during migration");
      JSON.parse(safeStorage.decryptString(readFileSync(secrets)));
    },
  });
  return true;
}
