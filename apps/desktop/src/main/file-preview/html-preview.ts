import { randomUUID } from "node:crypto";
import { realpath, stat } from "node:fs/promises";
import { dirname, extname, isAbsolute, resolve, win32 } from "node:path";
import type { HtmlPreviewReference } from "@lxe/desktop-protocol";
import { contains, readLimited, regularFile } from "./paths";

export const HTML_MAX_BYTES = 32 * 1024 * 1024;
export const HTML_ASSET_BYTES = 4 * 1024 * 1024;
export const HTML_MAX_ASSETS = 64;
export interface HtmlDependency extends HtmlPreviewReference { path: string; version: string }
export interface HtmlPreviewDocument {
  token: string;
  document: string;
  root: string;
  dependencies: HtmlDependency[];
  version: string;
}
export const htmlText = (bytes: Uint8Array): string => new TextDecoder("utf-8", { fatal: true }).decode(bytes);
const signature = (info: Awaited<ReturnType<typeof stat>>) => `${info.dev}:${info.ino}:${info.size}:${info.mtimeMs}:${info.ctimeMs}`;

/** Resolve only declared CSS/classic JS paths, including .. within the allowed root. */
export async function htmlDependency(source: string, root: string, asset: HtmlPreviewReference): Promise<{ path: string; version: string }> {
  try {
    if (!asset || !["script", "stylesheet"].includes(asset.kind) || typeof asset.reference !== "string" || asset.reference.length > 32768) throw new Error("Invalid HTML resource reference");
    const relative = decodeURIComponent(asset.reference.split(/[?#]/u)[0]!);
    if (!relative || /^(?:[a-z][a-z\d+.-]*:|[/\\])/iu.test(relative) || relative.includes("\0") || relative.includes("\\") || isAbsolute(relative) || win32.isAbsolute(relative)) throw new Error("HTML resource must use a relative file path");
    if (extname(relative).toLowerCase() !== (asset.kind === "script" ? ".js" : ".css")) throw new Error("Only classic .js scripts and .css stylesheets are supported");
    const boundary = await realpath(root), candidate = resolve(await realpath(dirname(source)), relative);
    if (!contains(boundary, candidate)) throw new Error("HTML resource is outside its allowed directory");
    const path = await regularFile(candidate);
    if (!contains(boundary, path)) throw new Error("HTML resource symlink is outside its allowed directory");
    return { path, version: signature(await stat(path)) };
  } catch (error) {
    // A missing dependency must not mark the HTML source itself as deleted.
    throw new Error(`HTML resource ${asset?.reference}: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
}

/** Executed only inside the opaque preview frame; no application callbacks are exposed. */
function documentOf(html: string, assets: Array<HtmlPreviewReference & { text: string }>): string {
  const payload = Buffer.from(JSON.stringify({ html, assets }), "utf8").toString("base64");
  return `<!doctype html><meta charset="utf-8"><script>(() => {
    const bundle = JSON.parse(new TextDecoder("utf-8", {fatal:true}).decode(Uint8Array.from(atob("${payload}"), c => c.charCodeAt(0))));
    let html = bundle.html;
    const urls = [];
    if (bundle.assets.length) {
      const parsed = new DOMParser().parseFromString(html, "text/html");
      for (const asset of bundle.assets) {
        const script = asset.kind === "script", attribute = script ? "src" : "href";
        const url = URL.createObjectURL(new Blob([asset.text], {type:script ? "application/javascript" : "text/css"}));
        urls.push(url);
        for (const element of parsed.querySelectorAll(script ? "script[src]" : 'link[rel~="stylesheet" i][href]')) {
          if (script && !["", "text/javascript", "application/javascript"].includes((element.getAttribute("type") || "").trim().toLowerCase())) continue;
          if (element.getAttribute(attribute) === asset.reference) element.setAttribute(attribute, url);
        }
      }
      html = "<!doctype html>" + parsed.documentElement.outerHTML;
    }
    document.open(); document.write(html); document.close();
    window.addEventListener("pagehide", () => urls.forEach(url => URL.revokeObjectURL(url)), {once:true});
  })()</script>`;
}

export async function prepareHtmlDocument(
  bytes: Uint8Array, source: string, root: string, rootVersion: string,
  references: HtmlPreviewReference[], signal: AbortSignal,
): Promise<HtmlPreviewDocument> {
  if (!Array.isArray(references) || references.length > HTML_MAX_ASSETS) throw new Error("HTML package exceeds 64 resources");
  let total = bytes.byteLength;
  if (total > HTML_MAX_BYTES) throw new Error("HTML package exceeds 32 MiB");
  const html = htmlText(bytes), dependencies: HtmlDependency[] = [], assets: Array<HtmlPreviewReference & { text: string }> = [];
  const seen = new Set<string>();
  for (const reference of references) {
    signal.throwIfAborted();
    const before = await htmlDependency(source, root, reference);
    const key = JSON.stringify([reference.kind, reference.reference]);
    if (seen.has(key)) continue;
    seen.add(key);
    const data = await readLimited(before.path, HTML_ASSET_BYTES).catch(error => {
      throw new Error(`HTML resource ${reference.reference}: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
    });
    total += data.byteLength;
    if (total > HTML_MAX_BYTES) throw new Error("HTML package exceeds 32 MiB");
    const text = htmlText(data);
    const after = await htmlDependency(source, root, reference);
    if (before.path !== after.path || before.version !== after.version) throw new Error("HTML resource changed while reading: " + reference.reference);
    dependencies.push({ ...reference, ...after });
    assets.push({ ...reference, text });
  }
  signal.throwIfAborted();
  return { token: randomUUID(), document: documentOf(html, assets), root, dependencies, version: htmlVersion(rootVersion, dependencies) };
}
export function htmlVersion(rootVersion: string, dependencies: Array<{ path: string; version: string }>): string {
  return JSON.stringify([rootVersion, ...dependencies.map(asset => [asset.path, asset.version])]);
}
