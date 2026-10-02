import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import { build } from "vite";
const require = createRequire(import.meta.url);
test("HTML previews execute inside isolated Electron frames under development and production CSP", async () => {
  const output = mkdtempSync(resolve(tmpdir(), "lxe-html-renderer-")), profile = mkdtempSync(resolve(tmpdir(), "lxe-html-profile-"));
  try {
    await build({ root: resolve(import.meta.dirname, "../../.."), logLevel: "error", build: { outDir: output, emptyOutDir: true, target: "es2022", minify: false, rollupOptions: { input: resolve(import.meta.dirname, "renderer.html") } } });
    for (const entry of [resolve(import.meta.dirname, "host.ts"), resolve(import.meta.dirname, "../../../../desktop/src/preload.ts")]) {
      const bundle = await Bun.build({ entrypoints: [entry], outdir: resolve(output, "main"), naming: "[name].cjs", target: "node", format: "cjs", external: ["electron"] });
      if (!bundle.success) throw new Error(bundle.logs.map(String).join("\n"));
    }
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
    const child = Bun.spawn([process.env.LXE_HTML_TEST_ELECTRON || require(resolve(import.meta.dirname, "../../../../desktop/node_modules/electron")), resolve(import.meta.dirname, "runner.cjs"), profile, output], { env, stdout: "pipe", stderr: "pipe" });
    const timer = setTimeout(() => child.kill(), 90_000);
    try {
      const collect = async () => { let text = ""; for await (const chunk of child.stdout) { const value = new TextDecoder().decode(chunk); text += value; process.stdout.write(value); } return text; };
      const [code, stdout, stderr] = await Promise.all([child.exited, collect(), new Response(child.stderr).text()]);
      expect(code, `${stdout}\n${stderr}`).toBe(0);
      const report = stdout.split("\n").find(line => line.startsWith("LXE_HTML_RESULT=")); expect(report).toBeDefined();
      expect(JSON.parse(report!.slice(16)).passed.length).toBeGreaterThanOrEqual(12);
    } finally { clearTimeout(timer); if (child.exitCode === null) { child.kill(); await child.exited; } }
  } finally { rmSync(output, { recursive: true, force: true, maxRetries: 5 }); rmSync(profile, { recursive: true, force: true, maxRetries: 5 }); }
}, 115_000);
