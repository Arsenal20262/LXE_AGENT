import { PermissionPolicyService } from "../src/permissions/policy";
import { join } from "node:path";
import { repositoryRoot, resolveWorkspaceContext } from "@lxe/core";
import type { WorkspaceContext } from "@lxe/protocol";

export const testWorkspace: WorkspaceContext = resolveWorkspaceContext(
  repositoryRoot(import.meta.dir),
);

export const workspaceFor = (directory: string, worktree = directory): WorkspaceContext => ({
  directory,
  worktree,
});

export const policyFor = (directory: string, sessionId = "s1", worktree = directory) =>
  new PermissionPolicyService({ dataRoot: join(directory, "var") }).resolve({
    session_id: sessionId, permission_mode: "danger-full-access", workspace: workspaceFor(directory, worktree),
  });
