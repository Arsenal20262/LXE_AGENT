import { canonicalPathCandidate, pathContains } from "@lxe/core";
import { parsePermissionMode } from "@lxe/protocol";
import type { ExecutionPolicy } from "./policy";

export class PermissionBoundaryError extends Error {}

const overlaps = (left: string, right: string) => pathContains(left, right) || pathContains(right, left);
export const samePath = (left: string, right: string): boolean => pathContains(left, right) && pathContains(right, left);

/** Recheck resolved session boundaries before a mutation or process launch. */
export function assertPermissionBoundaries(policy: ExecutionPolicy): void {
  if (!policy) throw new Error("Tool execution requires a session permission policy");
  parsePermissionMode(policy.mode);
  if (policy.mode === "danger-full-access") return;
  if (policy.diagnostics.length) {
    throw new PermissionBoundaryError(`Sandbox boundary conflict: ${JSON.stringify(policy.diagnostics)}`);
  }
  const paths = [policy.workspaceRoot, policy.temporaryDirectory, policy.outputDirectory, policy.artifactRoot];
  for (const path of paths) {
    if (!samePath(path, canonicalPathCandidate(path))) throw new PermissionBoundaryError(`Sandbox path changed after policy resolution: ${path}`);
  }
  if (!pathContains(policy.workspaceRoot, policy.artifactRoot)) throw new PermissionBoundaryError("Sandbox artifact directory escapes workspace");
  if (overlaps(policy.workspaceRoot, policy.temporaryDirectory)
    || overlaps(policy.workspaceRoot, policy.outputDirectory)
    || overlaps(policy.temporaryDirectory, policy.outputDirectory)) {
    throw new PermissionBoundaryError("Sandbox workspace, temporary and host output directories must be disjoint");
  }
  for (const privatePath of policy.privatePaths.map(canonicalPathCandidate)) {
    for (const path of paths) {
      if (overlaps(path, privatePath)) throw new PermissionBoundaryError(`Sandbox boundary overlaps application private path: ${path} / ${privatePath}`);
    }
  }
  const expected = policy.mode === "workspace-write" ? [policy.workspaceRoot, policy.temporaryDirectory] : [];
  if (policy.writeAccess.kind !== "roots" || policy.writeAccess.roots.length !== expected.length
    || !expected.every((path) => policy.writeAccess.kind === "roots" && policy.writeAccess.roots.some(root => samePath(path, root)))) {
    throw new PermissionBoundaryError("Sandbox write roots do not match the session mode");
  }
}
