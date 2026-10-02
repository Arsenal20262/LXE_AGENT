import type { HtmlPreviewReference } from "@lxe/desktop-protocol";

/** Inert parsing only: document markup never enters the application DOM. */
export function htmlReferences(bytes: Uint8Array): HtmlPreviewReference[] {
  const html = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const template = document.createElement("template");
  template.innerHTML = html;
  // A base URL deliberately delegates all relative resolution to the browser.
  if (template.content.querySelector("base[href]")) return [];
  const references: HtmlPreviewReference[] = [], seen = new Set<string>();
  for (const element of template.content.querySelectorAll("script[src],link[href]")) {
    const script = element.localName === "script";
    if (script && !["", "text/javascript", "application/javascript"].includes(element.getAttribute("type")?.trim().toLowerCase() ?? "")) continue;
    if (!script && !(element.getAttribute("rel") ?? "").toLowerCase().split(/\s+/u).includes("stylesheet")) continue;
    const reference = element.getAttribute(script ? "src" : "href")!;
    if (!reference || /^(?:[a-z][a-z\d+.-]*:|[/\\#?])/iu.test(reference)) continue;
    const path = reference.split(/[?#]/u)[0]!;
    if (!(script ? /\.js$/iu : /\.css$/iu).test(path)) continue;
    const kind = script ? "script" : "stylesheet", key = JSON.stringify([kind, reference]);
    if (seen.has(key)) continue;
    seen.add(key); references.push({ kind, reference });
    if (references.length > 64) throw new Error("HTML package exceeds 64 resources");
  }
  return references;
}
