import type { ExecutionPolicy } from "../permissions/policy";
import type { ExecutionPaths } from "../permissions/execution-paths";
import { platform, release } from "node:os";
import type { WorkspaceContext } from "@lxe/protocol";
import type { RuntimeConversationMessage, RuntimeEnvironmentSnapshot, RuntimeMessage } from "./types";

const fields = ["current_date", "timezone", "cwd", "worktree", "artifact_root", "user_skills_root", "permission_mode", "permission_description", "permission_approvals", "os", "bun_version", "platform", "provider", "model"] as const;
const escapeXml = (value: string): string => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");

export function captureEnvironment(context: {
  workspace: WorkspaceContext; platform: string; provider: string; model: string; artifactRoot?: string; userSkillsRoot?: string; permissions?: Pick<RuntimeEnvironmentSnapshot, "permission_mode" | "permission_description" | "permission_approvals">;
}, now = new Date(), timezone = Intl.DateTimeFormat().resolvedOptions().timeZone): RuntimeEnvironmentSnapshot {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (type: string) => parts.find((item) => item.type === type)!.value;
  return {
    ...context.permissions,
    current_date: `${part("year")}-${part("month")}-${part("day")}`, timezone,
    cwd: context.workspace.directory, worktree: context.workspace.worktree,
    ...(context.artifactRoot ? { artifact_root: context.artifactRoot } : {}),
    ...(context.userSkillsRoot ? { user_skills_root: context.userSkillsRoot } : {}),
    os: `${platform()} ${release()}`, bun_version: Bun.version,
    platform: context.platform || "unknown", provider: context.provider || "custom", model: context.model || "unknown",
  };
}

export function environmentMessage(snapshot: RuntimeEnvironmentSnapshot): RuntimeConversationMessage {
  return { role: "user", environmentContext: structuredClone(snapshot), content: [
    "<environment_context>",
    ...fields.flatMap((field) => snapshot[field] === undefined ? [] : [`  <${field}>${escapeXml(snapshot[field]!)}</${field}>`]),
    "</environment_context>",
  ].join("\n") };
}

/** Only runtime metadata is a baseline; user-authored XML is ordinary content. */
export function environmentMetadata(value: unknown): { environmentContext?: RuntimeEnvironmentSnapshot } {
  if (!value || typeof value !== "object") return {};
  const message = value as Record<string, unknown>;
  const snapshot = message.environmentContext;
  if (message.role !== "user" || !snapshot || typeof snapshot !== "object") return {};
  const record = snapshot as Record<string, unknown>;
  if (!fields.every((key) => (["artifact_root", "user_skills_root", "permission_mode", "permission_description", "permission_approvals"].includes(key)) && record[key] === undefined || typeof record[key] === "string")) return {};
  return { environmentContext: Object.fromEntries(fields.filter((key) => record[key] !== undefined).map((key) => [key, record[key]])) as unknown as RuntimeEnvironmentSnapshot };
}

export function environmentChanged(messages: readonly RuntimeMessage[], snapshot: RuntimeEnvironmentSnapshot): boolean {
  for (let index = messages.length - 1; index >= 0; index--) {
    const previous = environmentMetadata(messages[index]).environmentContext;
    if (previous) return fields.some((field) => previous[field] !== snapshot[field]);
  }
  return true;
}

export function permissionEnvironment(policy: ExecutionPolicy, paths: ExecutionPaths, approvalAvailable: boolean): Pick<RuntimeEnvironmentSnapshot, "permission_mode" | "permission_description" | "permission_approvals"> {
  return {
    permission_mode: policy.mode,
    permission_description: policy.mode === "read-only"
      ? "Controlled local operations (exec, write, edit) cannot modify ordinary files, including temporary files."
      : policy.mode === "workspace-write"
        ? `Controlled local operations (exec, write, edit) may write the fixed workspace ${policy.workspaceRoot} and the platform temporary regions: ${paths.temporaryRoots(policy).join(", ")}. Changing command cwd does not expand this boundary.`
        : "The local file-write sandbox does not apply to exec, write and edit. Operating-system permissions still apply.",
    permission_approvals: approvalAvailable
      ? "Desktop single-operation approval is available for exec, write and edit. If necessary, explicitly request the smallest sufficient wider mode with sandbox_permissions and a non-empty justification. Approval applies only to that invocation."
      : "No single-operation approval channel is available. Do not request an approval that this channel cannot complete.",
  };
}
