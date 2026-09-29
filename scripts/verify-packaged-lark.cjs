const { spawnSync } = require("node:child_process");
const { existsSync, readFileSync } = require("node:fs");
const { join } = require("node:path");

// Run the delivered binary, with no developer-installed tools on PATH.
function verifyPackagedLark(appOutDir, version) {
  const tools = join(appOutDir, "resources", "runtime", "tools");
  const executable = join(tools, "lark-cli.exe");
  if (!existsSync(executable)) throw new Error(`Packaged Lark CLI is missing: ${executable}`);
  const environment = { ...process.env };
  for (const key of Object.keys(environment)) {
    if (key.toLowerCase() === "path") delete environment[key];
  }
  environment.PATH = tools;
  const run = (args) => {
    const result = spawnSync(executable, args, {
      cwd: tools, env: environment, encoding: "utf8", windowsHide: true,
      timeout: 15_000, maxBuffer: 2 * 1024 * 1024,
    });
    if (result.error || result.status !== 0) {
      const detail = [result.error?.message, result.stderr, result.stdout].filter(Boolean).join("\n");
      throw new Error(`Packaged Lark CLI ${args.join(" ")} failed (exit ${result.status}, signal ${result.signal}): ${detail.slice(0, 4000)}${detail.length > 4000 ? "\n[truncated]" : ""}`);
    }
    return result.stdout.trim();
  };
  const actual = run(["--version"]);
  if (actual !== `lark-cli version ${version}`) {
    throw new Error(`Packaged Lark CLI version mismatch: expected ${version}, received ${actual}`);
  }
  const list = run(["skills", "list"]);
  let skills;
  try { skills = JSON.parse(list); }
  catch (error) { throw new Error(`Packaged Lark CLI returned invalid skills JSON: ${list.slice(0, 1000)}`, { cause: error }); }
  if (skills.ok !== true || !Array.isArray(skills.skills) || !skills.skills.some(skill => skill.name === "lark-doc")) {
    throw new Error(`Packaged Lark CLI embedded skill list is incomplete: ${list.slice(0, 1000)}`);
  }
  const content = run(["skills", "read", "lark-doc"]);
  if (!/^name:\s*lark-doc\s*$/m.test(content)) {
    throw new Error(`Packaged Lark CLI embedded lark-doc skill is invalid: ${content.slice(0, 1000)}`);
  }
}

// electron-builder calls afterPack after extraResources, before installer creation.
module.exports = async (context) => {
  if (context.electronPlatformName !== "win32") return;
  if (process.platform !== "win32") throw new Error("Packaged Lark CLI validation requires a Windows build host");
  const lock = JSON.parse(readFileSync(join(__dirname, "..", "config", "desktop-runtime", "lark-cli.lock.json"), "utf8"));
  verifyPackagedLark(context.appOutDir, lock.version);
  console.log(`Verified packaged Lark CLI ${lock.version} and embedded skills`);
};
module.exports.verifyPackagedLark = verifyPackagedLark;
