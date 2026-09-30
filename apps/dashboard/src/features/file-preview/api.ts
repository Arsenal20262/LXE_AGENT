import type { DesktopFilesBridge } from "@lxe/desktop-protocol";
let override: DesktopFilesBridge | undefined;
export function setFileBridgeForTests(bridge?: DesktopFilesBridge) { override = bridge; }
export function filesApi(): DesktopFilesBridge {
  const bridge = override ?? (typeof window === "undefined" ? undefined : window.lxe?.files);
  if (!bridge) throw new Error("Desktop file service is unavailable");
  return bridge;
}
export const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);
