export interface DesktopUpdateIdentity { version: string; build_id: string; }
export interface DesktopUpdateArtifact { file_name: string; size: number; sha512: string; }
export interface DesktopUpdateRelease extends DesktopUpdateIdentity, DesktopUpdateArtifact {
  notes: string;
  blockmap?: DesktopUpdateArtifact;
}
export interface DesktopUpdateState {
  phase: "unsupported" | "idle" | "checking" | "available" | "downloading" | "verifying" | "ready" | "preparing" | "installing" | "error" | "paused";
  release?: DesktopUpdateRelease;
  percent?: number;
  message?: string;
  failedOperation?: "check" | "download" | "install";
  lastAttempt?: string;
}
