import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { readResourceScope, approvedConstructiveResourcePath } from "./desktop-resource-scope";

test("Windows helper bundles independently of Bun/Cordis and rejects malformed input before loading native APIs", async () => {
  const root = resolve(import.meta.dirname, "..");
  const out = mkdtempSync(join(tmpdir(), "lxe-sandbox-bundle-"));
  try {
    const result = await Bun.build({ entrypoints: [join(root, "packages/agent/runtime/native/windows-sandbox/runner.ts")],
      target: "node", format: "esm", external: ["koffi"], outdir: out, naming: "runner.mjs" });
    expect(result.success).toBe(true);
    const source = readFileSync(join(out, "runner.mjs"), "utf8");
    expect(source).not.toMatch(/from ["']@deepseek-ai\//u);
    const node = process.env.LXE_EXEC_SANDBOX_NODE || Bun.which("node");
    expect(node).toBeTruthy();
    const child = Bun.spawnSync([node!, join(out, "runner.mjs"), "--workspace", out, "--temp", out, "--mode", "invalid"], { stdout: "pipe", stderr: "pipe" });
    expect(child.exitCode).toBe(127);
    expect(child.stderr.toString()).toContain("lxe-windows-acl-run: unknown mode: invalid");
    const entry = readResourceScope(root).resources.find(item => item.id === "runtime-exec-sandbox");
    expect(entry).toMatchObject({ target: "runtime/exec-sandbox", platforms: ["win32-x64"] });
    expect(approvedConstructiveResourcePath("runtime/exec-sandbox/node_modules/@koromix/koffi-win32-x64/koffi.node")).toBe(true);
  } finally { rmSync(out, { recursive: true, force: true }); }
});
