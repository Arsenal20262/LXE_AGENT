import { canonicalPathCandidate, pathContains } from "@lxe/core";
import type { ExecutionPaths } from "./execution-paths";
import type { ExecutionPolicy } from "./policy";

export class PermissionBoundaryError extends Error {}
export const samePath = (left: string, right: string): boolean => pathContains(left, right) && pathContains(right, left);
export interface ExecutionBoundary { workspace: string; roots: readonly string[] }

/** Resolve only the boundaries needed by this operation, never application-private paths. */
export function executionBoundary(policy: ExecutionPolicy, paths: ExecutionPaths): ExecutionBoundary {
  if (policy.mode === "danger-full-access") return { workspace: policy.workspaceRoot, roots: [] };
  const workspace = canonicalPathCandidate(policy.workspaceRoot);
  const temporary = paths.temporaryRoots(policy).map(canonicalPathCandidate);
  if (paths.platform === "win32" && temporary.some(root => pathContains(workspace, root) || pathContains(root, workspace))) {
    throw new PermissionBoundaryError(`Windows sandbox workspace and temporary directory must be disjoint: ${workspace} / ${temporary.join(", ")}`);
  }
  const roots = policy.mode === "workspace-write" ? [workspace, ...temporary] : [];
  return { workspace, roots: roots.filter((root, index) => roots.findIndex(other => samePath(root, other)) === index) };
}

export function recheckExecutionBoundary(policy: ExecutionPolicy, paths: ExecutionPaths, expected: ExecutionBoundary): ExecutionBoundary {
  const current = executionBoundary(policy, paths);
  if (!samePath(current.workspace, expected.workspace) || current.roots.length !== expected.roots.length
    || !current.roots.every((root, index) => samePath(root, expected.roots[index]!))) {
    throw new PermissionBoundaryError("Sandbox boundary changed while the operation was waiting");
  }
  return current;
}
