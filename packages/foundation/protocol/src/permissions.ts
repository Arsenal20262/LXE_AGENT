/** Modes for controlled local file effects. */
export type PermissionMode = "read-only" | "workspace-write" | "danger-full-access";

export const DEFAULT_PERMISSION_MODE: PermissionMode = "workspace-write";

export function parsePermissionMode(value: unknown): PermissionMode {
  if (value === "read-only" || value === "workspace-write" || value === "danger-full-access") return value;
  throw new Error(`Invalid permission mode: ${String(value)}`);
}

export interface PendingApproval {
  request_id: string;
  session_id: string;
  turn_id: string;
  tool_call_id: string;
  tool: "exec" | "write" | "edit";
  target_mode: "workspace-write" | "danger-full-access";
  justification: string;
  arguments: import("./index").JsonObject;
  preview: import("./index").JsonObject;
}
export interface ApprovalDecision {
  session_id: string;
  request_id: string;
  decision: "allow" | "deny";
}
