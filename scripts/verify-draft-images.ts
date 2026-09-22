// Opt-in native clipboard/composer integration test; the fixture restores the pasteboard.
import { createRequire } from "node:module";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
const root = resolve(import.meta.dirname, ".."), out = await mkdtemp(join(tmpdir(), "lxe-draft-images-"));
for (const [entry, name, target] of [
  ["apps/desktop/src/preload.ts", "preload.cjs", "node"],
  ["apps/desktop/test/fixtures/conversation-paste.electron.ts", "main.cjs", "node"],
  ["apps/dashboard/test/features/sessions/composer-fixture.tsx", "renderer.js", "browser"],
] as const) {
  const result = await Bun.build({ entrypoints: [join(root, entry)], outdir: out,
    naming: { entry: target === "browser" ? "renderer.[ext]" : name, asset: "[name]-[hash].[ext]", chunk: "[name]-[hash].[ext]" }, target,
    format: target === "node" ? "cjs" : "esm", external: ["electron"], define: { "process.env.NODE_ENV": JSON.stringify("development") } });
  if (!result.success) throw new AggregateError(result.logs, `Build failed: ${entry}`);
}
await writeFile(join(out, "index.html"), '<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="renderer.css"></head><body><div id="root"></div><script type="module" src="renderer.js"></script></body></html>');
const electron = createRequire(join(root, "apps/desktop/package.json"))("electron") as string;
const child = Bun.spawn([electron, join(out, "main.cjs"), join(out, "preload.cjs"), join(out, "index.html")],
  { cwd: root, stdout: "inherit", stderr: "inherit", env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined } });
const code = await child.exited;
if (code !== 0) throw new Error(`Draft image smoke failed with exit code ${code}. Artifacts: ${out}`);
