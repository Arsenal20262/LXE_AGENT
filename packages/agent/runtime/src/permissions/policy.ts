import { createHash, randomUUID } from "node:crypto";
import { join } from "node:path";
import { canonicalPathCandidate, pathContains, workspaceArtifactRoot } from "@lxe/core";
import { parsePermissionMode, type PermissionMode, type WorkspaceContext } from "@lxe/protocol";

export interface PermissionBoundaryDiagnostic {
  code: "private_path_overlap" | "artifact_outside_workspace" | "temporary_outside_root" | "workspace_temporary_overlap";
  path: string;
  boundary: string;
}

export interface ExecutionPolicy {
  readonly mode: PermissionMode;
  readonly approvalPolicy: "ask" | "never";
  readonly workspaceRoot: string;
  readonly artifactRoot: string;
  readonly temporaryDirectory: string;
  readonly outputDirectory: string;
  readonly writeAccess: { readonly kind: "unrestricted" } | { readonly kind: "roots"; readonly roots: readonly string[] };
  readonly privatePaths: readonly string[];
  readonly diagnostics: readonly PermissionBoundaryDiagnostic[];
}

export interface PermissionPolicyOptions {
  dataRoot: string;
  /** Include configured database/config paths outside the standard data layout. */
  privatePaths?: readonly string[];
}

const sessionPathKey = (sessionId: string): string => createHash("sha256").update(sessionId).digest("hex");

/** Pure policy resolution: no directory creation, permission grants, or session writes. */
export class PermissionPolicyService {
  private readonly runtimeId = randomUUID();
  constructor(private readonly options: PermissionPolicyOptions) {}

  resolve(session: { session_id: string; workspace: WorkspaceContext; permission_mode: PermissionMode }): ExecutionPolicy {
    const mode = parsePermissionMode(session.permission_mode);
    const workspaceRoot = canonicalPathCandidate(session.workspace.directory);
    const artifactRoot = canonicalPathCandidate(workspaceArtifactRoot(session.workspace.directory));
    const dataRoot = canonicalPathCandidate(this.options.dataRoot);
    const temporaryRoot = canonicalPathCandidate(join(dataRoot, "tmp"));
    const temporaryDirectory = canonicalPathCandidate(join(this.options.dataRoot, "tmp", "tools", this.runtimeId, sessionPathKey(session.session_id)));
    const outputDirectory = canonicalPathCandidate(join(this.options.dataRoot, "tmp", "exec", sessionPathKey(session.session_id)));
    const privatePaths = [...new Set([
      ...["db", "config", "logs", "inputs", "lxeskill", "cache", "electron", "migrations", "trash"].map(name => join(this.options.dataRoot, name)),
      ...(this.options.privatePaths ?? []),
    ].map(canonicalPathCandidate))];
    const diagnostics: PermissionBoundaryDiagnostic[] = [];
    if (!pathContains(workspaceRoot, artifactRoot)) diagnostics.push({ code: "artifact_outside_workspace", path: artifactRoot, boundary: workspaceRoot });
    for (const [path, boundary] of [
      [temporaryDirectory, join(temporaryRoot, "tools", this.runtimeId, sessionPathKey(session.session_id))],
      [outputDirectory, join(temporaryRoot, "exec", sessionPathKey(session.session_id))],
    ] as const) {
      if (!pathContains(dataRoot, temporaryRoot) || !pathContains(boundary, path)) {
        diagnostics.push({ code: "temporary_outside_root", path, boundary });
      }
      if (pathContains(workspaceRoot, path) || pathContains(path, workspaceRoot)) {
        diagnostics.push({ code: "workspace_temporary_overlap", path, boundary: workspaceRoot });
      }
    }
    for (const boundary of privatePaths) {
      for (const path of new Set([workspaceRoot, artifactRoot, temporaryDirectory, outputDirectory])) {
        if (pathContains(path, boundary) || pathContains(boundary, path)) diagnostics.push({ code: "private_path_overlap", path, boundary });
      }
    }
    return {
      mode, approvalPolicy: mode === "danger-full-access" ? "never" : "ask",
      workspaceRoot, artifactRoot, temporaryDirectory, outputDirectory, privatePaths, diagnostics,
      writeAccess: mode === "danger-full-access" ? { kind: "unrestricted" }
        : { kind: "roots", roots: mode === "read-only" ? [] : [...new Set([workspaceRoot, temporaryDirectory])] },
    };
  }
}

export function assertPermissionExecutionAvailable(policy: ExecutionPolicy): void {
  if (!policy) throw new Error("Tool execution requires a session permission policy");
  if (policy.mode !== "danger-full-access") {
    throw new Error(`Permission mode ${policy.mode} cannot execute: filesystem sandbox and approval backends are not implemented. No operation was authorized.`);
  }
}
