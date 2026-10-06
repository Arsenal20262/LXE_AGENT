import { pathContains, workspaceArtifactRoot } from "@lxe/core";
import type { JsonObject } from "@lxe/protocol";
import { lstatSync, realpathSync, statSync } from "node:fs";
import { extname, isAbsolute } from "node:path";
import type { RuntimeAttachmentRecord, RuntimeMessage } from "../engine/types";
import type { LxeSkillCommandDefinition } from "./lxeskill-command";
import type { CliTerminalResult } from "./one-shot-cli";
import { resolveManagedAttachment } from "./managed-lxeskill-attachment";
import { ToolExecutionError, type ToolDefinition } from "./registry";

export interface ManagedLxeSkillToolOptions {
  commands: readonly LxeSkillCommandDefinition[];
  loadMessages(sessionId: string): Promise<RuntimeMessage[]>;
  resolveAttachment(sessionId: string, attachmentId: string): Promise<RuntimeAttachmentRecord | undefined>;
  run(entry: LxeSkillCommandDefinition, argv: string[], workspaceRoot: string, signal: AbortSignal, timeoutMs: number): Promise<CliTerminalResult>;
}

const reject = (message: string): never => { throw new ToolExecutionError("invalid_argument", message); };

function validateDeliverable(terminal: CliTerminalResult, entry: LxeSkillCommandDefinition, workspaceRoot: string): void {
  const deliverables = entry.artifactPaths?.filter((path) => path.role === "deliverable") ?? [];
  if (deliverables.length === 0) {
    if (terminal.files.length !== 0) reject("managed command unexpectedly returned files");
    return;
  }
  if (deliverables.length !== 1 || terminal.files.length !== 1) reject("managed command must return exactly one deliverable");
  const declared = terminal.data[deliverables[0]!.field];
  const raw = terminal.files[0]!;
  if (typeof declared !== "string" || typeof raw !== "string" || raw !== declared
    || !isAbsolute(raw) || extname(raw).toLowerCase() !== ".xlsx") {
    reject("managed command returned an invalid XLSX artifact");
  }
  try {
    if (lstatSync(raw).isSymbolicLink()) reject("managed command artifact is a symbolic link");
    const file = realpathSync(raw);
    const artifactRoot = realpathSync(workspaceArtifactRoot(workspaceRoot));
    if (!pathContains(artifactRoot, file) || !statSync(file).isFile() || statSync(file).size <= 0) {
      reject("managed command returned an invalid workspace artifact");
    }
  } catch (error) {
    if (error instanceof ToolExecutionError) throw error;
    return reject("managed command artifact is missing or inaccessible");
  }
}

/** Desktop host owns argv, attachment provenance and output validation for explicitly opted-in commands. */
export function createManagedLxeSkillTool(options: ManagedLxeSkillToolOptions): ToolDefinition {
  const commands = new Map(options.commands.filter((entry) => entry.managedExecution !== undefined)
    .map((entry) => [entry.name, entry] as const));
  return {
    name: "managed_lxeskill",
    description: "Run a registered business command using host-verified chat attachments. Use command_id from the lxeskill catalog; pass attachment_id only when binding an uploaded XLSX. The host selects fixed CLI arguments and returns the real CLI result.",
    platforms: ["desktop"],
    ownerSkills: [...new Set([...commands.values()].flatMap((entry) => entry.ownerSkills))],
    input_schema: {
      type: "object",
      properties: {
        command_id: { type: "string", enum: [...commands.keys()], description: "Registered managed lxeskill command ID." },
        attachment_id: { type: "string", description: "Stored ID of the selected chat XLSX attachment, for attachment commands only." },
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
        const attachmentId = input.attachment_id;
        if (typeof attachmentId !== "string" || !attachmentId.trim()) throw new ToolExecutionError("invalid_argument", "attachment_id is required");
        if (!context.turn_id) throw new ToolExecutionError("invalid_argument", "current chat turn is required for attachment binding");
        const attachment = await options.resolveAttachment(context.session_id, attachmentId);
        if (!attachment) throw new ToolExecutionError("invalid_argument", "attachment_id is not a stored attachment in this session");
        const messages = await options.loadMessages(context.session_id);
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
