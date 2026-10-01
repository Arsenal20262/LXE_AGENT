import type { DesktopFilesApi, FileFailure, FileResult } from "@lxe/desktop-protocol";
let override: DesktopFilesApi | undefined;
export function setFileBridgeForTests(bridge?: DesktopFilesApi) { override = bridge; }
export class FilePreviewError extends Error {
  constructor(readonly failure: FileFailure) { super(failure.diagnostic); }
}
export const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);
export function failureOf(error: unknown, operation = "preview"): FileFailure {
  return error instanceof FilePreviewError ? error.failure : { kind: "unknown", operation, diagnostic: errorText(error) };
}
export function unwrapFileResult<T>(result: FileResult<T>): T {
  if (!result.ok) throw new FilePreviewError(result.error);
  return result.value;
}
export function filesApi(): DesktopFilesApi {
  if (override) return override;
  const bridge = typeof window === "undefined" ? undefined : window.lxe?.files;
  if (!bridge) throw new Error("Desktop file service is unavailable");
  return {
    call: async call => unwrapFileResult(await bridge.call(call)),
    read: async (handle, relative) => unwrapFileResult(await bridge.read(handle, relative)),
    readText: async (handle, range) => unwrapFileResult(await bridge.readText(handle, range)),
  };
}
