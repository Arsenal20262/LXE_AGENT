import type { WebContents } from "electron";

/** A renderer reload cannot run React's unmount cleanup reliably. */
export function trackFilePreviewLifecycle(contents: WebContents, release: () => void): void {
  contents.on("did-start-navigation", (_event, _url, inPlace, main) => { if (main && !inPlace) release(); });
  contents.on("render-process-gone", release);
  contents.once("destroyed", release);
}
