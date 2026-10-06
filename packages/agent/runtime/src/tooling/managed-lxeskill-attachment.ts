import { lstatSync, realpathSync, statSync } from "node:fs";
import { extname, isAbsolute } from "node:path";
import type { RuntimeAttachmentRecord, RuntimeConversationMessage, RuntimeMessage } from "../engine/types";
import { safeToolFailureObservation, ToolExecutionError } from "./registry";

interface LocalFileBlock {
  attachment_id: string;
  turn_id: string;
  path: string;
  name: string;
  size_bytes: number;
}

const denied = (message: string): never => { throw new ToolExecutionError("invalid_argument", message); };
const userMessage = (message: RuntimeMessage): message is RuntimeConversationMessage => message.role === "user";
const realUser = (message: RuntimeConversationMessage): boolean => Boolean(message.message_id?.trim());
const injectedSkill = (message: RuntimeConversationMessage): boolean =>
  !realUser(message) && Boolean(message.invoked_skills?.length);

function files(message: RuntimeConversationMessage): LocalFileBlock[] {
  if (!Array.isArray(message.content)) return [];
  return message.content.flatMap((value) => {
    if (!value || typeof value !== "object" || value.type !== "local_file") return [];
    const attachmentId = String(value.attachment_id ?? "").trim();
    const turnId = String(value.turn_id ?? "").trim();
    const path = String(value.path ?? "").trim();
    if (!attachmentId || !turnId || !path) return [];
    return [{ attachment_id: attachmentId, turn_id: turnId, path,
      name: String(value.name ?? "").trim(), size_bytes: Number(value.size_bytes ?? 0) }];
  });
}

function selectedFile(messages: readonly RuntimeMessage[], currentTurnId: string, attachmentId?: string): LocalFileBlock {
  if (!currentTurnId) denied("current attachment context is missing");
  const visible = messages.filter(userMessage)
    .filter(message => !message.environmentContext && !injectedSkill(message));
  const current = visible.at(-1);
  if (!current || !realUser(current)) return denied("current message cannot be verified");
  const currentFiles = files(current);
  if (currentFiles.length > 0) {
    if (currentFiles.length > 1) denied("multiple attachments require confirmation in a following message");
    const selected = currentFiles[0]!;
    if (selected.turn_id !== currentTurnId) denied("current attachment turn does not match");
    return selected;
  }
  const previous = visible.at(-2);
  if (!previous || !realUser(previous)) return denied("attachment is not from the current or immediately previous message");
  const previousIndex = messages.lastIndexOf(previous);
  const currentIndex = messages.lastIndexOf(current);
  if (messages.slice(previousIndex + 1, currentIndex).some((message) => message.role === "compactionSummary")) {
    return denied("attachment adjacency cannot be verified across compaction");
  }
  const previousFiles = files(previous);
  if (!attachmentId && previousFiles.length > 1) denied("multiple attachments require confirmation in a following message");
  const selected = attachmentId
    ? previousFiles.find(file => file.attachment_id === attachmentId)
    : previousFiles[0];
  if (!selected) return denied("attachment is not from the current or immediately previous message");
  if (selected.turn_id === currentTurnId) denied("previous attachment turn does not match");
  return selected;
}

/** Select a sole nearby chat attachment without exposing its stored ID to the model. */
export function selectManagedAttachmentId(messages: readonly RuntimeMessage[], currentTurnId: string): string {
  return selectedFile(messages, currentTurnId).attachment_id;
}

/** Check objective source provenance; the Skill still decides whether text confirms a prior attachment. */
export function resolveManagedAttachment(input: {
  messages: readonly RuntimeMessage[];
  attachment: RuntimeAttachmentRecord;
  currentTurnId: string;
  allowedExtensions?: readonly string[];
}): string {
  const { messages, attachment, currentTurnId } = input;
  if (!attachment?.attachment_id) denied("current attachment context is missing");
  const selected = selectedFile(messages, currentTurnId, attachment.attachment_id);
  if (!selected || selected.attachment_id !== attachment.attachment_id
    || selected.turn_id !== attachment.turn_id || selected.path !== attachment.path
    || selected.name !== attachment.name || selected.size_bytes !== attachment.size_bytes) {
    denied("attachment record does not match the selected message file");
  }
  if (!isAbsolute(attachment.path) || !(input.allowedExtensions ?? [".xlsx"]).includes(extname(attachment.path).toLowerCase())) {
    denied(input.allowedExtensions ? "selected attachment has an unsupported extension or path" : "selected attachment must be an absolute XLSX file");
  }
  try {
    if (lstatSync(attachment.path).isSymbolicLink()) denied("selected attachment is a symbolic link");
    const path = realpathSync(attachment.path);
    const info = statSync(path);
    if (!info.isFile() || info.size !== attachment.size_bytes) denied("selected attachment changed since upload");
    return path;
  } catch (cause) {
    if (cause instanceof ToolExecutionError) throw cause;
    if (cause instanceof Error && "code" in cause && cause.code === "ENOENT") {
      denied(`selected attachment is missing: ${safeToolFailureObservation(cause.message.replaceAll(attachment.path, "[attachment-path]"))}`);
    }
    throw cause;
  }
}
