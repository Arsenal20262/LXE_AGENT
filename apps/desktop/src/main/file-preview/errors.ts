import type { FileFailure, FileFailureKind, FileResult } from "@lxe/desktop-protocol";

/** Only target filesystem access may assign a file-availability category. */
export class FileAccessError extends Error {
  constructor(readonly kind: FileFailureKind, cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause), { cause });
  }
}
export const invalidFileReference = (message: string) => new FileAccessError("invalid_reference", new Error(message));
export async function sourceAccess<T>(operation: () => Promise<T>): Promise<T> {
  try { return await operation(); }
  catch (error) {
    if (error instanceof FileAccessError) throw error;
    const code = (error as NodeJS.ErrnoException)?.code;
    const kind = code === "ENOENT" || code === "ENOTDIR" ? "not_found" : code === "EACCES" || code === "EPERM" ? "permission_denied" : undefined;
    if (kind) throw new FileAccessError(kind, error);
    throw error;
  }
}
export function fileFailure(error: unknown, operation: string): FileFailure {
  let diagnostic = error instanceof Error ? error.message : String(error);
  // Preserve multiline native diagnostics, but redact credentials and bound IPC output.
  diagnostic = diagnostic.replace(/\bBearer\s+[^\s]+/gi, "Bearer [redacted]")
    .replace(/([?&](?:token|key|secret|password|api_key)=)[^&\s]+/gi, "$1[redacted]")
    .replace(/((?:password|access_token|api[_-]?key|secret)\s*[:=]\s*)[^\s,;]+/gi, "$1[redacted]");
  for (const [key, value] of Object.entries(process.env)) {
    if (value && value.length >= 8 && /token|secret|password|api_?key/i.test(key)) diagnostic = diagnostic.split(value).join("[redacted]");
  }
  if (diagnostic.length > 16384) diagnostic = diagnostic.slice(0, 16384) + "\n… [truncated]";
  return { kind: error instanceof FileAccessError ? error.kind : "unknown", operation, diagnostic };
}
export async function fileResult<T>(operation: string, action: () => Promise<T> | T): Promise<FileResult<T>> {
  try { return { ok: true, value: await action() }; }
  catch (error) { return { ok: false, error: fileFailure(error, operation) }; }
}
