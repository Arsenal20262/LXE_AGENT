import { isAbsolute } from "node:path";
import { parsePermissionMode, type PermissionMode, type WorkspaceContext } from "@lxe/protocol";

/** Immutable authority for one invocation. Resolving it does not touch the filesystem. */
export interface ExecutionPolicy {
  readonly mode: PermissionMode;
  readonly workspaceRoot: string;
  readonly sessionId: string;
}

export class PermissionPolicyService {
  resolve(session: { session_id: string; workspace: WorkspaceContext; permission_mode: PermissionMode }): ExecutionPolicy {
    if (!isAbsolute(session.workspace.directory)) throw new Error(`Session workspace must be absolute: ${session.workspace.directory}`);
    return Object.freeze({ mode: parsePermissionMode(session.permission_mode), workspaceRoot: session.workspace.directory, sessionId: session.session_id });
  }
}
