import { afterAll, beforeAll, expect, test } from "bun:test";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, sep } from "node:path";
import { build } from "vite";
import ExcelJS from "exceljs";
let server: ReturnType<typeof Bun.serve> | undefined;
let output: string, url: string;
const require = createRequire(import.meta.url);
function pdf() {
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 400] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"];
  const content = "BT /F1 24 Tf 30 300 Td (Preview sample) Tj ET";
  objects.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  let value = "%PDF-1.4\n", offsets = [0];
  objects.forEach((object, i) => { offsets.push(value.length); value += `${i + 1} 0 obj\n${object}\nendobj\n`; });
  const start = value.length;
  value += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(o => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  return value;
}
beforeAll(async () => {
  output = mkdtempSync(resolve(tmpdir(), "lxe-preview-renderer-"));
  await build({ root: resolve(import.meta.dirname, "../../.."), logLevel: "error", build: { outDir: output, emptyOutDir: true, target: "es2022", minify: false, rollupOptions: { input: resolve(import.meta.dirname, "renderer.html") } } });
  const workbook = new ExcelJS.Workbook(), sheet = workbook.addWorksheet("Sales");
  sheet.addRows([["SKU", "Units", "Total"], ["001", 5, { formula: "B2*2", result: 10 }]]);
  workbook.addWorksheet("Notes").getCell("A1").value = "Keep this worksheet";
  const fixtures: Record<string, any> = { "book.xlsx": await workbook.xlsx.writeBuffer(), "table.csv": "SKU,Value\n001,20\n", "文档.md": "# Preview heading\n\n![Local image](图.png)\n\nInline math $x^2$\n", "doc.pdf": pdf(), "图.png": Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z5ZkAAAAASUVORK5CYII=", "base64"), "page.html": "<h1>Never execute</h1>" };
  if (process.env.LXE_PREVIEW_OFFICE_PDF) fixtures["doc.pdf"] = await Bun.file(process.env.LXE_PREVIEW_OFFICE_PDF).arrayBuffer();
  server = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request) {
    const pathname = decodeURIComponent(new URL(request.url).pathname);
    if (pathname.startsWith("/fixtures/")) return fixtures[pathname.slice(10)] ? new Response(fixtures[pathname.slice(10)]) : new Response("Missing fixture", { status: 404 });
    const path = resolve(output, "." + pathname);
    if (!path.startsWith(output + sep)) return new Response("Not found", { status: 404 });
    const file = Bun.file(path);
    return await file.exists() ? new Response(file) : new Response("Not found", { status: 404 });
  } });
  url = `http://127.0.0.1:${server.port}/test/features/file-preview/renderer.html`;
}, 60_000);
afterAll(() => { server?.stop(true); if (output) rmSync(output, { recursive: true, force: true }); });
test("file previews work in the isolated Chromium renderer with React 19", async () => {
  const profile = mkdtempSync(resolve(tmpdir(), "lxe-preview-profile-")), env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = Bun.spawn([require(resolve(import.meta.dirname, "../../../../desktop/node_modules/electron")), resolve(import.meta.dirname, "runner.cjs"), profile, url], { env, stdout: "pipe", stderr: "pipe" });
  const timer = setTimeout(() => child.kill(), 75_000);
  try {
    const [code, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
    expect(code, `${stdout}\n${stderr}`).toBe(0);
    const report = stdout.split("\n").find(line => line.startsWith("LXE_PREVIEW_RESULT="));
    expect(report).toBeDefined();
    expect(JSON.parse(report!.slice(19)).passed.length).toBe(8);
  } finally { clearTimeout(timer); if (child.exitCode === null) { child.kill(); await child.exited; } rmSync(profile, { recursive: true, force: true, maxRetries: 5 }); }
}, 90_000);
