/** Desktop-only file viewing. References never accept arbitrary host paths. */
export type SessionFileRef = { session_id: string } & (
  | { kind: "artifact"; id: string }
  | { kind: "attachment"; id: string }
  | { kind: "workspace"; path: string }
);
export type FilePreviewKind = "markdown" | "text" | "image" | "pdf" | "office" | "excel" | "unsupported";
export type FileMetadata = { key: string; name: string; size: number; version: string; kind: FilePreviewKind; extension: string; source: "current_file" | "history" };
export type FileApplication = { id: string; name: string; icon: string | null; default: boolean };
export type DirectoryPage = { entries: Array<{ name: string; path: string; kind: "file" | "directory" | "other" }>; next: number | null };
export type PreparedPreview = { handle: string; metadata: FileMetadata; missingFonts: string[] };
export interface DesktopFileOperations {
  stat: { input: { ref: SessionFileRef }; result: FileMetadata };
  list: { input: { session_id: string; path: string; offset?: number }; result: DirectoryPage };
  applications: { input: { ref: SessionFileRef }; result: FileApplication[] };
  open: { input: { ref: SessionFileRef; application?: string; reveal?: boolean }; result: void };
  prepare: { input: { ref: SessionFileRef; request_id: string }; result: PreparedPreview };
  release: { input: { request_id: string }; result: void };
}
export type DesktopFileCall<K extends keyof DesktopFileOperations = keyof DesktopFileOperations> = K extends keyof DesktopFileOperations ? { operation: K; input: DesktopFileOperations[K]["input"] } : never;
export interface DesktopFilesBridge {
  call<K extends keyof DesktopFileOperations>(call: DesktopFileCall<K>): Promise<DesktopFileOperations[K]["result"]>;
  read(handle: string, relativeImage?: string): Promise<Uint8Array>;
}
