import type { Session } from "electron";

export const HTML_PREVIEW_SCHEME = { scheme: "lxe-preview", privileges: { standard: true, secure: true } };
export const DASHBOARD_CSP = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; "
  + "img-src 'self' data: blob:; worker-src 'self'; font-src 'self' data:; connect-src 'self'; object-src 'none'; "
  + "base-uri 'self'; frame-ancestors 'none'; frame-src lxe-preview:";
// Only preview documents receive this policy. No app/file/custom-protocol access.
export const HTML_PREVIEW_CSP = "sandbox allow-scripts; default-src 'none'; "
  + "script-src 'unsafe-inline' 'unsafe-eval' http: https: data: blob:; "
  + "style-src 'unsafe-inline' http: https: data: blob:; img-src http: https: data: blob:; "
  + "font-src http: https: data: blob:; media-src http: https: data: blob:; "
  + "connect-src http: https: ws: wss:; worker-src blob:; frame-src http: https:; "
  + "object-src 'none'; base-uri http: https:; form-action 'none'";

export function registerHtmlPreviewProtocol(session: Session, load: (token: string) => Promise<string>): void {
  session.protocol.handle("lxe-preview", async request => {
    const url = new URL(request.url);
    if (request.method !== "GET" || url.host !== "document" || url.search || !/^\/[0-9a-f-]{36}$/u.test(url.pathname)) return new Response("Invalid HTML preview address", { status: 400 });
    try {
      return new Response(await load(url.pathname.slice(1)), { headers: {
        "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store",
        "Content-Security-Policy": HTML_PREVIEW_CSP, "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
      } });
    } catch (error) {
      return new Response(error instanceof Error ? error.message : String(error), { status: 410, headers: {
        "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "Content-Security-Policy": "default-src 'none'; sandbox",
      } });
    }
  });
}
