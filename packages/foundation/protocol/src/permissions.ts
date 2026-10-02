/** File-effect modes. Confinement backends are not implemented in phase one. */
export type PermissionMode = "read-only" | "workspace-write" | "danger-full-access";

export const DEFAULT_PERMISSION_MODE: PermissionMode = "danger-full-access";

export function parsePermissionMode(value: unknown): PermissionMode {
  if (value === "read-only" || value === "workspace-write" || value === "danger-full-access") return value;
  throw new Error(`Invalid permission mode: ${String(value)}`);
}
