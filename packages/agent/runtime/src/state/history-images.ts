import type { Database } from "bun:sqlite";
import type { JsonObject } from "@lxe/protocol";
import type { TranscriptByteLine } from "./transcript";

export type ConversationImagePreviewSource =
  | { source: "history"; image: JsonObject }
  | { source: "current_file"; path: string };

/** Index original message locations only; context patches must never replace historical previews. */
export function indexHistoryImages(db: Database, sessionId: string, line: TranscriptByteLine, turnId: string): void {
  if (line.event.kind !== "message") return;
  const message = line.event.message as JsonObject | undefined;
  if (!Array.isArray(message?.content)) return;
  const content = message.content as JsonObject[];
  const insert = (kind: string, id: string, turn: string, outer: number, inner: number) => {
    db.query(`INSERT OR IGNORE INTO transcript_history_images
      (session_id, kind, target_id, turn_id, byte_start, byte_end, outer_index, inner_index)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(sessionId, kind, id, turn, line.byteStart, line.byteEnd, outer, inner);
  };
  for (let index = 0; index < content.length; index++) {
    const block = content[index];
    if (message.role === "user" && block?.type === "local_file" && block.attachment_id
      && content[index + 1]?.type === "image") {
      insert("attachment", String(block.attachment_id), "", index + 1, -1);
    }
    if (message.role === "tool" && block?.type === "tool_result" && block.tool_call_id && turnId
      && Array.isArray(block.content)) {
      const imageIndex = (block.content as JsonObject[]).findIndex(item => item?.type === "image");
      if (imageIndex >= 0) insert("image_view", String(block.tool_call_id), turnId, index, imageIndex);
    }
  }
}

export interface HistoryImageLocation {
  byte_start: number; byte_end: number; outer_index: number; inner_index: number;
}

export function extractHistoryImage(event: JsonObject, location: HistoryImageLocation): JsonObject {
  const message = event.message as JsonObject | undefined;
  const outer = Array.isArray(message?.content) ? message.content[location.outer_index] as JsonObject : undefined;
  const image = location.inner_index < 0 ? outer
    : Array.isArray(outer?.content) ? outer.content[location.inner_index] as JsonObject : undefined;
  if (image?.type !== "image") throw new Error("Historical image location no longer points to an image");
  return image;
}
