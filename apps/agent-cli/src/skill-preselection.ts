import { extname } from "node:path";
import type { AgentJob, WorkspaceContext } from "@lxe/protocol";
import {
  matchSkillPreselectionAttachment,
  matchSkillPreselectionText,
  resolveManagedAttachment,
  selectManagedAttachmentId,
  type CliTerminalResult,
  type LxeSkillCommandDefinition,
  type RuntimeAttachmentRecord,
  type RuntimeMessage,
  type RuntimeSkillSnapshot,
  ToolExecutionError,
} from "@lxe/runtime";

export interface SkillPreselectionContext {
  job: AgentJob;
  currentUserMessage: RuntimeMessage;
  persistedMessages: readonly RuntimeMessage[];
  skillSnapshot?: RuntimeSkillSnapshot;
  workspace: WorkspaceContext;
  signal: AbortSignal;
}

export interface SkillPreselectorOptions {
  commands: readonly LxeSkillCommandDefinition[];
  resolveAttachment(sessionId: string, attachmentId: string): Promise<RuntimeAttachmentRecord | undefined>;
  runProbe(
    command: LxeSkillCommandDefinition,
    argv: string[],
    signal: AbortSignal,
    timeoutMs: number,
  ): Promise<CliTerminalResult>;
  reportProbeFailure?(commandId: string, error: unknown, attachmentPath: string): void;
}

const fileCount = (message: RuntimeMessage): number =>
  message.role === "user" && Array.isArray(message.content)
    ? message.content.filter(block => block.type === "local_file").length
    : 0;

const previousRealUser = (messages: readonly RuntimeMessage[]): RuntimeMessage | undefined => {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index]!;
    if (message.role === "user" && message.message_id?.trim() && !message.environmentContext) return message;
  }
  return undefined;
};

const currentAttachmentRecord = (message: RuntimeMessage, attachmentId: string): RuntimeAttachmentRecord | undefined => {
  if (message.role !== "user" || !Array.isArray(message.content) || !message.message_id?.trim()) return undefined;
  const block = message.content.find(item => item.type === "local_file" && item.attachment_id === attachmentId);
  if (!block || typeof block.turn_id !== "string" || typeof block.path !== "string"
    || typeof block.name !== "string" || typeof block.media_type !== "string"
    || typeof block.size_bytes !== "number" || !Number.isSafeInteger(block.size_bytes)
    || block.size_bytes <= 0 || typeof block.ts !== "number") return undefined;
  return block as RuntimeAttachmentRecord;
};

/** Select a declared Skill only; bind, generate and send_files remain Agent tool decisions. */
export function createSkillPreselector(options: SkillPreselectorOptions):
  (context: SkillPreselectionContext) => Promise<readonly string[]> {
  const commands = new Map(options.commands.filter(entry => entry.preselectionProbe === true)
    .map(entry => [entry.name, entry] as const));
  return async ({ job, currentUserMessage, persistedMessages, skillSnapshot, signal }) => {
    if (job.source.platform !== "desktop" || !skillSnapshot?.preselection?.length) return [];
    signal.throwIfAborted();
    const text = job.user_input.trim();
    const direct = matchSkillPreselectionText(skillSnapshot, text);
    if (direct) return [direct];

    const currentFiles = fileCount(currentUserMessage);
    const adjacent = currentFiles === 0 && text.length > 0;
    if (currentFiles > 1 || (!adjacent && currentFiles !== 1)) return [];
    const previous = adjacent ? previousRealUser(persistedMessages) : undefined;
    if (adjacent && (!previous || fileCount(previous) !== 1)) return [];

    let attachment: RuntimeAttachmentRecord | undefined;
    let path = "";
    let commandId = "attachment_resolution";
    try {
      const messages = [...persistedMessages, currentUserMessage];
      const id = selectManagedAttachmentId(messages, job.job_id);
      path = currentAttachmentRecord(adjacent ? previous! : currentUserMessage, id)?.path ?? "";
      attachment = await options.resolveAttachment(job.session_id, id);
      // The current turn has not been appended to the transcript yet. Its Gateway-built
      // local_file block is the only provisional source; prior turns require the store.
      if (!attachment && !adjacent) attachment = currentAttachmentRecord(currentUserMessage, id);
      if (!attachment) return [];
      const candidate = matchSkillPreselectionAttachment(
        skillSnapshot, extname(attachment.path).toLowerCase(), text || undefined,
      );
      if (!candidate?.attachment) return [];
      if (adjacent && !(previous?.role === "user" && previous.invoked_skills?.includes(candidate.name))) return [];
      const command = commands.get(candidate.attachment.probeCommandId);
      if (!command || command.visibility !== "internal" || !command.command.startsWith("lxeskill ")) return [];
      commandId = command.name;
      path = resolveManagedAttachment({
        messages, attachment, currentTurnId: job.job_id,
        allowedExtensions: candidate.attachment.extensions,
      });
      const argv = [...command.command.slice("lxeskill ".length).split(" "), "--source-path", path];
      try {
        const result = await options.runProbe(command, argv, signal, command.timeoutMs ?? 30_000);
        signal.throwIfAborted();
        const expectedCommand = command.command.slice("lxeskill ".length);
        if (result.protocol_version !== "1" || result.type !== "result"
          || result.command !== expectedCommand || !Array.isArray(result.files)
          || result.files.length !== 0 || !result.data || typeof result.data !== "object") {
          options.reportProbeFailure?.(command.name, new Error("probe returned an invalid terminal shape"), path);
          return [];
        }
        if (!result.ok || result.data.success !== true) {
          options.reportProbeFailure?.(command.name,
            result.error ?? new Error("probe reported unsuccessful execution without error details"), path);
          return [];
        }
        if (typeof result.data.matches !== "boolean") {
          options.reportProbeFailure?.(command.name,
            new Error(`probe terminal data.matches must be boolean, received ${typeof result.data.matches}`), path);
          return [];
        }
        return result.data.matches === true ? [candidate.name] : [];
      } catch (error) {
        signal.throwIfAborted();
        options.reportProbeFailure?.(command.name, error, path);
        return [];
      }
    } catch (error) {
      signal.throwIfAborted();
      // Expected attachment selection failures stay on the ordinary route.
      if (error instanceof ToolExecutionError && error.code === "invalid_argument") return [];
      options.reportProbeFailure?.(commandId, error, path);
      return [];
    }
  };
}
