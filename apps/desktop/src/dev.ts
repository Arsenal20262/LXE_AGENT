import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const root = resolve(desktopRoot, "..", "..");
const desktopEnvironment: Record<string, string | undefined> = { ...process.env };
delete desktopEnvironment.LXE_DATA_ROOT;
delete desktopEnvironment.LXE_DESKTOP_PREVIEW;
desktopEnvironment.LXE_SOURCE_ROOT = root;
desktopEnvironment.LXE_DASHBOARD_DEV_URL = "http://127.0.0.1:5173";
desktopEnvironment.LXE_AGENT_CLI_COMMAND = desktopEnvironment.LXE_AGENT_CLI_COMMAND?.trim() || process.execPath;
const dashboard = Bun.spawn([process.execPath, "run", "--cwd", "apps/dashboard", "dev"], {
  cwd: root,
  stdout: "inherit",
  stderr: "inherit",
  env: { ...process.env },
});

let electron: ReturnType<typeof Bun.spawn> | undefined;
const stop = (): void => {
  electron?.kill();
  dashboard.kill();
};
for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, stop);
try {
  const deadline = Date.now() + 30_000;
  let ready = false;
  while (Date.now() < deadline) {
    if (dashboard.exitCode !== null) throw new Error(`Dashboard development server exited with ${dashboard.exitCode}`);
    try {
      const response = await fetch(desktopEnvironment.LXE_DASHBOARD_DEV_URL, { signal: AbortSignal.timeout(1_000) });
      if (response.ok) { ready = true; break; }
    } catch {
      // Vite is still starting; its actual stderr remains attached above.
    }
    await Bun.sleep(100);
  }
  if (!ready) throw new Error("Dashboard development server did not become ready within 30 seconds");
  const electronPath = createRequire(import.meta.url)("electron") as string;
  electron = Bun.spawn([electronPath, "."], {
    cwd: desktopRoot, stdout: "inherit", stderr: "inherit", env: desktopEnvironment,
  });
  process.exitCode = await electron.exited;
} finally {
  dashboard.kill();
  await dashboard.exited;
}
