import { pathContains, workspaceArtifactRoot } from "@lxe/core";
import type { JsonObject } from "@lxe/protocol";
import { lstatSync, realpathSync, statSync } from "node:fs";
import { extname, isAbsolute } from "node:path";
import type { RuntimeAttachmentRecord, RuntimeMessage } from "../engine/types";
import type { LxeSkillCommandDefinition } from "./lxeskill-command";
import type { CliTerminalResult } from "./one-shot-cli";
import { resolveManagedAttachment, selectManagedAttachmentId } from "./managed-lxeskill-attachment";
import { safeToolFailureObservation, ToolExecutionError, type ToolDefinition } from "./registry";

export interface ManagedLxeSkillToolOptions {
  commands: readonly LxeSkillCommandDefinition[];
  loadMessages(sessionId: string): Promise<RuntimeMessage[]>;
  resolveAttachment(sessionId: string, attachmentId: string): Promise<RuntimeAttachmentRecord | undefined>;
  run(entry: LxeSkillCommandDefinition, argv: string[], workspaceRoot: string, signal: AbortSignal, timeoutMs: number): Promise<CliTerminalResult>;
}

const reject = (message: string): never => { throw new ToolExecutionError("invalid_argument", message); };
const rejectResult = (message: string): never => { throw new ToolExecutionError("unclassified", message); };

function validateDeliverable(terminal: CliTerminalResult, entry: LxeSkillCommandDefinition, workspaceRoot: string): void {
  const deliverables = entry.artifactPaths?.filter((path) => path.role === "deliverable") ?? [];
  if (deliverables.length === 0) {
    if (terminal.files.length !== 0) rejectResult("managed command unexpectedly returned files");
    return;
  }
  if (deliverables.length !== 1 || terminal.files.length !== 1) rejectResult("managed command must return exactly one deliverable");
  const declared = terminal.data[deliverables[0]!.field];
  const raw = terminal.files[0]!;
  if (typeof declared !== "string" || typeof raw !== "string" || raw !== declared
    || !isAbsolute(raw) || extname(raw).toLowerCase() !== ".xlsx") {
    rejectResult("managed command returned an invalid XLSX artifact");
  }
  let operation = "lstat";
  let resolvedFile = "";
  let resolvedRoot = "";
  try {
    if (lstatSync(raw).isSymbolicLink()) rejectResult("managed command artifact is a symbolic link");
    operation = "realpath artifact";
    resolvedFile = realpathSync(raw);
    operation = "realpath workspace artifact root";
    resolvedRoot = realpathSync(workspaceArtifactRoot(workspaceRoot));
    if (!pathContains(resolvedRoot, resolvedFile)) rejectResult("managed command returned an invalid workspace artifact");
    operation = "stat";
    const fileStat = statSync(resolvedFile);
    if (!fileStat.isFile() || fileStat.size <= 0) {
      rejectResult("managed command returned an invalid workspace artifact");
    }
  } catch (error) {
    if (error instanceof ToolExecutionError) throw error;
    const cause = error as NodeJS.ErrnoException;
    const filesystemOperation = typeof cause?.syscall === "string" ? cause.syscall : operation;
    const filesystemCode = typeof cause?.code === "string" ? cause.code : undefined;
    let message = (error instanceof Error ? error.message : String(error))
      .replaceAll(raw, "[artifact]");
    if (workspaceRoot) message = message.replaceAll(workspaceRoot, "[workspace]");
    if (resolvedFile) message = message.replaceAll(resolvedFile, "[artifact]");
    if (resolvedRoot) message = message.replaceAll(resolvedRoot, "[artifact root]");
    const observed = safeToolFailureObservation(
      typeof cause?.path === "string" && cause.path
        ? message.replaceAll(cause.path, "[path]") : message,
    );
    throw new ToolExecutionError("unclassified",
      `managed command artifact validation failed during ${filesystemOperation}: ${observed}`,
      { type: "managed_artifact_validation_error", operation: filesystemOperation,
        ...(filesystemCode ? { filesystem_code: filesystemCode } : {}), observed_message: observed });
  }
}

/** Desktop host owns argv, attachment provenance and output validation for explicitly opted-in commands. */
export function createManagedLxeSkillTool(options: ManagedLxeSkillToolOptions): ToolDefinition {
  const commands = new Map(options.commands.filter((entry) => entry.managedExecution !== undefined)
    .map((entry) => [entry.name, entry] as const));
  return {
    name: "managed_lxeskill",
    description: "Run a registered business command using host-verified chat attachments. Use command_id from the lxeskill catalog; for one eligible chat XLSX, omit attachment_id and the host selects it; use attachment_id only for a confirmed selection from multiple files. The host selects fixed CLI arguments and returns the real CLI result.",
    platforms: ["desktop"],
    ownerSkills: [...new Set([...commands.values()].flatMap((entry) => entry.ownerSkills))],
    input_schema: {
      type: "object",
      properties: {
        command_id: { type: "string", enum: [...commands.keys()], description: "Registered managed lxeskill command ID." },
        attachment_id: { type: "string", description: "Optional stored ID for a confirmed selection from multiple chat files. Omit for one eligible XLSX; the host selects it." },
      },
      required: ["command_id"],
      additionalProperties: false,
    },
    classifyInvocation: (input) => {
      const entry = commands.get(String(input.command_id ?? ""));
      if (!entry) return undefined;
      return { usageName: `lxeskill:${entry.command.slice("lxeskill ".length)}`,
        commandId: entry.command.slice("lxeskill ".length), ownerSkills: [...entry.ownerSkills],
        ...(entry.attributionSkill ? { attributionSkill: entry.attributionSkill } : {}) };
    },
    execute: async (input: JsonObject, context) => {
      if (context.executionPolicy.mode === "read-only") {
        throw new ToolExecutionError("permission_denied", "managed lxeskill cannot run in read-only mode");
      }
      if (context.executionPolicy.sessionId !== context.session_id
        || context.executionPolicy.workspaceRoot !== context.workspace.directory) {
        throw new ToolExecutionError("failed_precondition", "managed lxeskill session workspace changed");
      }
      const unexpected = Object.keys(input).filter((key) => key !== "command_id" && key !== "attachment_id");
      if (unexpected.length > 0) reject(`unexpected managed lxeskill argument: ${unexpected[0]}`);
      const commandId = input.command_id;
      if (typeof commandId !== "string") throw new ToolExecutionError("invalid_argument", "command_id must be a registered command ID");
      const entry = commands.get(commandId);
      if (!entry) throw new ToolExecutionError("invalid_argument", "command_id is not a registered managed command");
      if (context.exposureState && !entry.ownerSkills.some((owner) => context.exposureState?.allowsSkill(owner))) {
        throw new ToolExecutionError("permission_denied", "managed command owner Skill is unavailable");
      }
      const argv = entry.command.slice("lxeskill ".length).split(" ");
      const attachmentArgument = entry.managedExecution?.attachmentArgument;
      if (attachmentArgument) {
        if (!context.turn_id) throw new ToolExecutionError("invalid_argument", "current chat turn is required for attachment binding");
        const messages = await options.loadMessages(context.session_id);
        const requestedId = input.attachment_id;
        if (requestedId !== undefined && (typeof requestedId !== "string" || !requestedId.trim())) {
          throw new ToolExecutionError("invalid_argument", "attachment_id must be a nonempty stored ID");
        }
        const attachmentId = requestedId === undefined
          ? selectManagedAttachmentId(messages, context.turn_id)
          : requestedId as string;
        const attachment = await options.resolveAttachment(context.session_id, attachmentId);
        if (!attachment) throw new ToolExecutionError("invalid_argument", "attachment_id is not a stored attachment in this session");
        const path = resolveManagedAttachment({ messages, attachment, currentTurnId: context.turn_id });
        argv.push(`--${attachmentArgument.replaceAll("_", "-")}`, path);
      } else if (Object.prototype.hasOwnProperty.call(input, "attachment_id")) {
        reject("attachment_id is not accepted by this command");
      }
      if (context.handle.signal.aborted) throw new DOMException("Turn cancelled", "AbortError");
      const terminal = await options.run(entry, argv, context.workspace.directory, context.handle.signal, entry.timeoutMs ?? 180_000);
      if (terminal.protocol_version !== "1" || terminal.type !== "result"
        || terminal.command !== argv.slice(0, entry.command.split(" ").length - 1).join(" ")
        || typeof terminal.ok !== "boolean" || !Array.isArray(terminal.files)
        || !terminal.data || typeof terminal.data !== "object") {
        throw new ToolExecutionError("external_api_error", "managed lxeskill returned an invalid terminal result");
      }
      if (!terminal.ok || terminal.data.success !== true) {
        const failed = { ...terminal, files: [] };
        return { content: [{ type: "text", text: JSON.stringify(failed) }], display_status: "error" };
      }
      validateDeliverable(terminal, entry, context.workspace.directory);
      // Runtime emits ToolExecutionResult.files immediately; the Agent must call send_files after checking the terminal.
      return { content: [{ type: "text", text: JSON.stringify(terminal) }] };
    },
  };
}
