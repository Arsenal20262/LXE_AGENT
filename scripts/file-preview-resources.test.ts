import { expect, test } from "bun:test";
import { createRequire } from "node:module";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
const { verifyFilePreviewResources } = createRequire(import.meta.url)("./file-preview-resources.cjs");
test("packaging refuses missing PDF resources, workers and license texts", () => {
  const root = mkdtempSync(join(tmpdir(), "lxe-preview-resources-"));
  try {
    const paths = ["preview-pdf/cmaps/Adobe-GB1-UCS2.bcmap", "preview-pdf/cmaps/LICENSE", "preview-pdf/standard_fonts/LiberationSans-Regular.ttf", "preview-pdf/standard_fonts/LICENSE_LIBERATION", "preview-pdf/wasm/openjpeg.wasm", "preview-pdf/wasm/qcms_bg.wasm", "preview-pdf/wasm/jbig2.wasm", "legal/file-preview/DeepSeek-MIT.txt", "legal/file-preview/FortuneSheet-MIT.txt", "legal/file-preview/pdfjs-dist-LICENSE.txt", "legal/file-preview/xlsx-LICENSE.txt", "assets/pdf.worker-1.mjs", "assets/worker-1.js", "assets/PdfViewer-1.js", "assets/ExcelViewer-1.js"];
    for (const path of paths) { mkdirSync(dirname(join(root, path)), {recursive: true}); writeFileSync(join(root, path), "fixture"); }
    expect(verifyFilePreviewResources(root).workers).toBe(2);
    for (const path of paths) { rmSync(join(root, path)); expect(() => verifyFilePreviewResources(root)).toThrow(); writeFileSync(join(root, path), "fixture"); }
  } finally { rmSync(root, {recursive:true,force:true}); }
});
