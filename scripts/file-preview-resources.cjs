const { readdirSync, statSync } = require("node:fs");
const { join } = require("node:path");
/** Prevent offline previews from silently depending on development-machine assets. */
function verifyFilePreviewResources(root) {
  const required = [
    "preview-pdf/cmaps/Adobe-GB1-UCS2.bcmap", "preview-pdf/cmaps/LICENSE",
    "preview-pdf/standard_fonts/LiberationSans-Regular.ttf", "preview-pdf/standard_fonts/LICENSE_LIBERATION",
    "preview-pdf/wasm/openjpeg.wasm", "preview-pdf/wasm/qcms_bg.wasm", "preview-pdf/wasm/jbig2.wasm",
    "legal/file-preview/DeepSeek-MIT.txt", "legal/file-preview/FortuneSheet-MIT.txt",
    "legal/file-preview/pdfjs-dist-LICENSE.txt", "legal/file-preview/xlsx-LICENSE.txt",
  ];
  for (const path of required) if (!statSync(join(root, path)).isFile() || statSync(join(root, path)).size === 0) throw new Error(`Missing file-preview resource: ${path}`);
  const files = readdirSync(join(root, "assets"));
  for (const pattern of [/^pdf\.worker.*\.mjs$/, /^worker-.*\.js$/, /^PdfViewer-.*\.js$/, /^ExcelViewer-.*\.js$/]) {
    const found = files.filter(name => pattern.test(name));
    if (!found.length || found.some(name => statSync(join(root, "assets", name)).size === 0)) throw new Error(`Missing preview worker/viewer: ${pattern}`);
  }
  return { required: required.length, workers: 2 };
}
module.exports = { verifyFilePreviewResources };
