/** Desktop-only file viewing. References never accept arbitrary host paths. */
export type SessionFileRef = { session_id: string } & (
  | { kind: "artifact"; id: string }
  | { kind: "attachment"; id: string }
  | { kind: "workspace"; path: string }
);
export type FilePreviewKind = "markdown" | "text" | "image" | "pdf" | "office" | "excel" | "unsupported";
export type FileMetadata = { key: string; name: string; displayPath?: string; size: number; version: string; kind: FilePreviewKind; extension: string; source: "current_file" | "history" };
export type FileApplication = { id: string; name: string; icon: string | null; default: boolean };
export type DirectoryPage = { entries: Array<{ name: string; path: string; kind: "file" | "directory" | "other" }>; next: number | null; rootPath?: string; version?: string };
/** One-based line offset; each read is bounded to 5,000 lines and 2 MiB. */
export type TextPageRequest = { offset?: number; limit?: number };
export type PreviewTextPage = { page: number; text: string; offset: number; lines: number; next: number; eof: boolean; version: string };
export type PreparedPreview = { handle: string; metadata: FileMetadata; missingFonts: string[] };
export interface DesktopFileOperations {
  "focus-preview": { input: { focused: boolean }; result: void };
  stat: { input: { ref: SessionFileRef }; result: FileMetadata };
  list: { input: { session_id: string; path: string; offset?: number }; result: DirectoryPage };
  applications: { input: { ref: SessionFileRef }; result: FileApplication[] };
  open: { input: { ref: SessionFileRef; application?: string; reveal?: boolean }; result: void };
  prepare: { input: { ref: SessionFileRef; request_id: string; mode?: "text" | "bytes" }; result: PreparedPreview };
  "open-workspace": { input: { session_id: string }; result: void };
  "watch-directory": { input: { session_id: string; path: string; request_id: string }; result: { version: string } };
  "directory-version": { input: { request_id: string }; result: { version: string } };
  release: { input: { request_id: string }; result: void };
}
export type DesktopFileCall<K extends keyof DesktopFileOperations = keyof DesktopFileOperations> = K extends keyof DesktopFileOperations ? { operation: K; input: DesktopFileOperations[K]["input"] } : never;
export interface DesktopFilesBridge {
  call<K extends keyof DesktopFileOperations>(call: DesktopFileCall<K>): Promise<DesktopFileOperations[K]["result"]>;
  read(handle: string, relativeImage?: string): Promise<Uint8Array>;
  readText(handle: string, range?: TextPageRequest): Promise<PreviewTextPage>;
}
