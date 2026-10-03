import { existsSync, statSync } from "node:fs";
import { assertPermissionBoundaries } from "./boundaries";
import type { ExecSpawnSpec } from "../tooling/exec-shell";
import type { ExecutionPolicy } from "./policy";

export interface ExecSandboxInfo {
  backend: "none" | "seatbelt" | "windows-acl";
  mode: ExecutionPolicy["mode"];
  enforcement: "none" | "file-write" | "partial";
}

export interface SandboxedExecSpec extends ExecSpawnSpec {
  sandbox: ExecSandboxInfo;
}

// Retain the internal exec entry point while sharing its checks with file tools.
export const assertExecSandboxBoundaries = assertPermissionBoundaries;

const sbplString = (path: string) => JSON.stringify(path);

/** DSH's Seatbelt write policy, using LXE's private temporary root instead of global /tmp. */
export function seatbeltProfile(policy: ExecutionPolicy): string {
  const forms = ['(version 1)', '(allow default)', '(deny file-write*)', '(allow file-write* (literal "/dev/null"))'];
  if (policy.mode === "workspace-write") {
    forms.push(`(allow file-write* ${[policy.workspaceRoot, policy.temporaryDirectory].map(root => `(subpath ${sbplString(root)})`).join(" ")})`);
  }
  return forms.join(" ");
}

/** Internal exec backend only. Runtime/registry still reject restricted product sessions. */
export class ExecSandbox {
  constructor(private readonly options: {
    platform?: NodeJS.Platform;
    environment?: Record<string, string | undefined>;
  } = {}) {}

  prepare(policy: ExecutionPolicy, command: ExecSpawnSpec): SandboxedExecSpec {
    assertExecSandboxBoundaries(policy);
    if (policy.mode === "danger-full-access") {
      return { ...command, sandbox: { backend: "none", mode: policy.mode, enforcement: "none" } };
    }
    if (!statSync(policy.workspaceRoot).isDirectory()) throw new Error(`Sandbox workspace is not a directory: ${policy.workspaceRoot}`);
    const platform = this.options.platform ?? process.platform;
    if (platform === "darwin") {
      if (!existsSync("/usr/bin/sandbox-exec")) throw new Error("Seatbelt sandbox launcher is unavailable: /usr/bin/sandbox-exec");
      return {
        argv: ["/usr/bin/sandbox-exec", "-p", seatbeltProfile(policy), ...command.argv],
        detached: command.detached,
        sandbox: { backend: "seatbelt", mode: policy.mode, enforcement: "file-write" },
      };
    }
    if (platform === "win32") {
      const env = this.options.environment ?? process.env;
      const node = env.LXE_EXEC_SANDBOX_NODE;
      const runner = env.LXE_EXEC_SANDBOX_RUNNER;
      if (!node || !runner || !existsSync(node) || !existsSync(runner)) {
        throw new Error(`Windows ACL sandbox launcher is unavailable: node=${node ?? "<unset>"}, runner=${runner ?? "<unset>"}`);
      }
      return {
        argv: [node, runner, "--workspace", policy.workspaceRoot, "--temp", policy.temporaryDirectory,
          "--mode", policy.mode, "--", ...command.argv],
        detached: false,
        sandbox: { backend: "windows-acl", mode: policy.mode, enforcement: "partial" },
      };
    }
    throw new Error(`Exec sandbox is not implemented on ${platform}`);
  }
}
