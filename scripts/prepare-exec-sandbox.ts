import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { sourceRuntimePaths } from "../apps/desktop/src/main/source-runtime-paths";

/** Build a self-contained Node launcher; native dependencies stay outside Bun's executable. */
export async function prepareExecSandbox(root: string, destination = sourceRuntimePaths(root).sandboxRoot): Promise<string> {
  const config = join(root, "config", "desktop-runtime", "exec-sandbox");
  const vendor = join(root, "packages", "agent", "runtime", "native", "windows-sandbox");
  mkdirSync(destination, { recursive: true });
  for (const name of ["package.json", "bun.lock"]) copyFileSync(join(config, name), join(destination, name));
  const install = Bun.spawnSync([process.execPath, "install", "--frozen-lockfile", "--production", "--ignore-scripts"], {
    cwd: destination, stdout: "pipe", stderr: "pipe", env: process.env,
  });
  if (install.exitCode !== 0) throw new Error(`Sandbox dependencies failed: ${new TextDecoder().decode(install.stderr)}`);
  const build = await Bun.build({ entrypoints: [join(vendor, "runner.ts")], target: "node", format: "esm",
    external: ["koffi"], outdir: destination, naming: "runner.mjs" });
  if (!build.success) throw new AggregateError(build.logs, "Windows sandbox launcher build failed");
  copyFileSync(join(vendor, "LICENSE"), join(destination, "DSH-LICENSE"));
  // Bundle provenance with the native resources without shipping source or diagnostic repair tools.
  cpSync(join(vendor, "README.md"), join(destination, "NOTICE.md"));
  const packagePath = join(destination, "node_modules", "koffi", "package.json");
  if (!existsSync(packagePath) || JSON.parse(readFileSync(packagePath, "utf8")).version !== "3.1.1") {
    throw new Error("Windows sandbox requires locked Koffi 3.1.1");
  }
  // Dependency manifests are build inputs, not runtime entry points.
  rmSync(join(destination, "bun.lock"));
  return destination;
}

if (import.meta.main) {
  const root = resolve(import.meta.dirname, "..");
  const destination = process.argv[2] ? resolve(process.argv[2]) : undefined;
  console.log(await prepareExecSandbox(root, destination));
}
