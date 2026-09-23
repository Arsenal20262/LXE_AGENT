export interface DesktopUpdateRelease {
  version: string;
  build_id: string;
  notes: string;
  file_name: string;
  size: number;
  sha512: string;
}
export interface DesktopUpdateState {
  phase: "unsupported" | "idle" | "checking" | "downloading" | "verifying" | "ready" | "installing" | "error" | "paused";
  release?: DesktopUpdateRelease;
  percent?: number;
  message?: string;
  lastAttempt?: string;
}
