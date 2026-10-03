import { statSync } from "node:fs";
import { canonicalPathCandidate, pathContains } from "@lxe/core";
import { ToolExecutionError } from "../tooling/registry";
import { assertPermissionBoundaries, PermissionBoundaryError, samePath } from "./boundaries";
import type { ExecutionPolicy } from "./policy";

const denied = (policy: ExecutionPolicy, target: string, reason: string): never => {
  throw new ToolExecutionError("permission_denied", `File write denied (mode=${policy.mode}, target=${target}): ${reason}`);
};

/** No side effects. Full access retains the original path and filesystem semantics. */
export function resolveFileWriteTarget(policy: ExecutionPolicy, target: string): string {
  try {
    assertPermissionBoundaries(policy);
  } catch (cause) {
    if (cause instanceof PermissionBoundaryError) denied(policy, target, cause.message);
    throw cause; // Preserve actual filesystem errors from boundary resolution.
  }
  if (policy.mode === "danger-full-access") return target;
  if (policy.mode === "read-only") denied(policy, target, "read-only mode does not allow file writes");
  const path = canonicalPathCandidate(target);
  if (policy.writeAccess.kind !== "roots" || !policy.writeAccess.roots.some(root => pathContains(root, path))) {
    denied(policy, target, `resolved target is outside the session write roots: ${path}`);
  }
  try {
    const info = statSync(path, { bigint: true });
    if (info.isFile() && info.nlink > 1n) denied(policy, target, `regular file has multiple hard links: ${path}`);
  } catch (cause) {
    if (!(cause instanceof Error && "code" in cause && cause.code === "ENOENT")) throw cause;
  }
  return path;
}

/** Recheck the original spelling as well as its resolved destination before writing. */
export function recheckFileWriteTarget(policy: ExecutionPolicy, target: string, checkedPath: string): void {
  const current = resolveFileWriteTarget(policy, target);
  if (!samePath(current, checkedPath)) denied(policy, target, `resolved target changed since the initial check: ${checkedPath} -> ${current}`);
}
