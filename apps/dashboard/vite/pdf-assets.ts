import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import type { Plugin } from "vite";
/** PDF resources are served locally in development and emitted into the packaged dashboard. */
export function pdfAssets(): Plugin {
  const require = createRequire(import.meta.url), root = dirname(require.resolve("pdfjs-dist/package.json"));
  const assets = new Map<string, string>();
  for (const dir of ["cmaps", "standard_fonts", "wasm"]) for (const name of readdirSync(join(root, dir))) assets.set(`/preview-pdf/${dir}/${name}`, join(root, dir, name));
  return {
    name: "lxe-local-pdf-assets",
    configureServer(server) { server.middlewares.use((req, res, next) => {
      const file = assets.get(req.url?.split("?")[0] ?? "");
      if (!file) return next(); res.setHeader("Content-Type", file.endsWith(".wasm") ? "application/wasm" : "application/octet-stream"); res.end(readFileSync(file));
    }); },
    generateBundle() { for (const [name, path] of assets) this.emitFile({ type: "asset", fileName: name.slice(1), source: readFileSync(path) }); },
  };
}
