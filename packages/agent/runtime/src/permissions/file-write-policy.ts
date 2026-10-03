import { type BigIntStats, statSync } from "node:fs";
import { canonicalPathCandidate, pathContains } from "@lxe/core";
import { ToolExecutionError } from "../tooling/registry";
import { assertPermissionBoundaries, PermissionBoundaryError, samePath } from "./boundaries";
import type { ExecutionPolicy } from "./policy";

const denied = (policy: ExecutionPolicy, target: string, reason: string): never => {
  throw new ToolExecutionError("permission_denied", `File write denied (mode=${policy.mode}, target=${target}): ${reason}`);
};

export interface FileWriteTarget {
  path: string;
  info: BigIntStats | undefined;
}

/** One observation per check; callers reuse it for file type and version checks. */
export function inspectFileWriteTarget(policy: ExecutionPolicy, target: string, allowMissing: boolean): FileWriteTarget {
  try {
    assertPermissionBoundaries(policy);
  } catch (cause) {
    if (cause instanceof PermissionBoundaryError) denied(policy, target, cause.message);
    throw cause; // Preserve actual filesystem errors from boundary resolution.
  }
  if (policy.mode === "read-only") denied(policy, target, "read-only mode does not allow file writes");
  // Full access keeps the original spelling and filesystem semantics.
  const path = policy.mode === "danger-full-access" ? target : canonicalPathCandidate(target);
  if (policy.mode !== "danger-full-access"
    && (policy.writeAccess.kind !== "roots" || !policy.writeAccess.roots.some(root => pathContains(root, path)))) {
    denied(policy, target, `resolved target is outside the session write roots: ${path}`);
  }
  try {
    const info = statSync(path, { bigint: true });
    if (policy.mode !== "danger-full-access" && info.isFile() && info.nlink > 1n) {
      denied(policy, target, `regular file has multiple hard links: ${path}`);
    }
    return { path, info };
  } catch (cause) {
    if (!allowMissing || !(cause instanceof Error && "code" in cause && (cause.code === "ENOENT" || cause.code === "ENOTDIR"))) throw cause;
    return { path, info: undefined };
  }
}

/** Recheck the original spelling as well as its resolved destination before writing. */
export function recheckFileWriteTarget(policy: ExecutionPolicy, target: string, checkedPath: string): FileWriteTarget {
  const current = inspectFileWriteTarget(policy, target, true);
  if (!samePath(current.path, checkedPath)) denied(policy, target, `resolved target changed since the initial check: ${checkedPath} -> ${current.path}`);
  return current;
}
