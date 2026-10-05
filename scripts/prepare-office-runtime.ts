import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { createRequire } from "node:module";
import { sourceRuntimePaths } from "../apps/desktop/src/main/source-runtime-paths";

const { verifyOfficeRuntime, sha256 } = createRequire(import.meta.url)("./office-runtime.cjs");
const root = resolve(import.meta.dirname, "..");
const platform = `${process.platform}-${process.arch}`;
const { values } = parseArgs({ options: {
  destination: { type: "string" }, node: { type: "string" }, "verify-only": { type: "boolean" },
} });
if (!["darwin-arm64", "darwin-x64", "win32-x64"].includes(platform)) throw new Error(`Unsupported Office build host: ${platform}`);
const paths = sourceRuntimePaths(root);
const destination = resolve(values.destination ?? paths.officeRoot);
const config = join(root, "config", "desktop-runtime", "office");
const lockSha256 = sha256(Buffer.concat(["package.json", "bun.lock", "vc-redist.lock.json"].map(name => readFileSync(join(config, name)))));
const markerName = ".lxe-office.json";
const node = values.node ? resolve(values.node) : paths.node;
function run(command: string[], cwd: string): string {
  const result = Bun.spawnSync(command, { cwd, stdout: "pipe", stderr: "pipe", stdin: "ignore", timeout: 300_000 });
  const stdout = new TextDecoder().decode(result.stdout);
  const stderr = new TextDecoder().decode(result.stderr);
  if (result.exitCode !== 0) throw new Error(`${command[0]} failed (${result.exitCode}):\n${stderr}\n${stdout}`);
  return stdout;
}
function verify(directory: string, checkPrerequisite = true) {
  const verified = verifyOfficeRuntime(directory, platform);
  const info = JSON.parse(run([node, "-p", "JSON.stringify({version:process.versions.node,platform:process.platform+'-'+process.arch,electron:process.versions.electron})"], root));
  const [major, minor] = info.version.split(".").map(Number);
  if (info.electron || major < 22 || (major === 22 && minor < 19) || info.platform !== platform) throw new Error(`Office requires standalone Node >=22.19 for ${platform}: ${JSON.stringify(info)}`);
  const capabilities = JSON.parse(run([node, verified.cli, "capabilities", "--json"], root));
  if (capabilities.runtime.backend !== "native") throw new Error(`Office native engine required: ${JSON.stringify(capabilities)}`);
  if (process.platform === "win32" && checkPrerequisite) {
    const lock = JSON.parse(readFileSync(join(config, "vc-redist.lock.json"), "utf8"));
    if (sha256(readFileSync(join(directory, "vc_redist.x64.exe"))) !== lock.sha256) throw new Error("VC++ redistributable checksum mismatch");
  }
  return verified;
}
if (values["verify-only"]) {
  console.log(JSON.stringify(verify(destination)));
} else {
  if (!values.node) {
    if (process.platform !== "darwin") throw new Error("Windows Office preparation requires --node from the managed desktop runtime");
    const installedNode = Bun.which("node");
    if (!installedNode) throw new Error("Install standalone Node >=22.19 for macOS Office development");
    mkdirSync(dirname(node), { recursive: true });
    if (!existsSync(node) || sha256(readFileSync(node)) !== sha256(readFileSync(installedNode))) copyFileSync(installedNode, node);
  }
  if (existsSync(destination)) {
    const marker = join(destination, markerName);
    if (!existsSync(marker)) throw new Error(`Refusing to replace an unowned Office directory: ${destination}`);
    if (JSON.parse(readFileSync(marker, "utf8")).lockSha256 === lockSha256) {
      console.log(JSON.stringify(verify(destination)));
      process.exit(0);
    }
  }
  const stage = `${destination}.staging-${crypto.randomUUID()}`;
  const backup = `${destination}.backup-${crypto.randomUUID()}`;
  try {
    mkdirSync(stage, { recursive: true });
    for (const name of ["package.json", "bun.lock"]) copyFileSync(join(config, name), join(stage, name));
    run([process.execPath, "install", "--frozen-lockfile", "--production", "--ignore-scripts"], stage);
    // The entry package also declares WASM. This product ships the host's native
    // engine only; missing native payloads must fail rather than select WASM.
    const scope = join(stage, "node_modules", "@deepseek-ai");
    for (const name of readdirSync(scope)) {
      if (name.startsWith("libreoffice-kit-") && name !== `libreoffice-kit-${platform}`) rmSync(join(scope, name), { recursive: true });
    }
    const verified = verify(stage, false);
    if (process.platform === "win32") {
      const lock = JSON.parse(readFileSync(join(config, "vc-redist.lock.json"), "utf8"));
      const response = await fetch(lock.url, { signal: AbortSignal.timeout(120_000) });
      if (!response.ok) throw new Error(`VC++ download failed: HTTP ${response.status} ${response.statusText}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (sha256(bytes) !== lock.sha256) throw new Error("VC++ redistributable checksum mismatch");
      writeFileSync(join(stage, "vc_redist.x64.exe"), bytes);
      copyFileSync(join(config, "vc-redist.lock.json"), join(stage, "vc-redist.lock.json"));
    }
    writeFileSync(join(stage, markerName), JSON.stringify({ lockSha256, kitVersion: verified.kitVersion, engineVersion: verified.engineVersion, platform }, null, 2) + "\n");
    if (existsSync(destination)) renameSync(destination, backup);
    try { renameSync(stage, destination); }
    catch (error) { if (existsSync(backup)) renameSync(backup, destination); throw error; }
    rmSync(backup, { recursive: true, force: true });
    console.log(JSON.stringify(verify(destination)));
  } finally { rmSync(stage, { recursive: true, force: true }); }
}
