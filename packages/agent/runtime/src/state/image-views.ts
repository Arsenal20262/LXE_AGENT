import { basename, isAbsolute } from "node:path";
import type { Database } from "bun:sqlite";
import type { JsonObject } from "@lxe/protocol";
import type { RuntimeImageViewRecord } from "../engine/types";
import { text } from "./sql";

export function transcriptImageView(event: JsonObject): RuntimeImageViewRecord | undefined {
  if (event.kind !== "image_view") return undefined;
  const view: RuntimeImageViewRecord = {
    view_id: text(event.view_id), turn_id: text(event.turn_id), tool_call_id: text(event.tool_call_id),
    path: text(event.path), name: basename(text(event.path)), media_type: text(event.media_type), ts: Number(event.ts),
  };
  return view.view_id && view.turn_id && view.tool_call_id && isAbsolute(view.path)
    && /^image\/[a-z0-9.+-]+$/u.test(view.media_type) && Number.isFinite(view.ts) && view.ts >= 0 ? view : undefined;
}

export function indexImageView(db: Database, sessionId: string, view: RuntimeImageViewRecord): void {
  db.query(`INSERT OR IGNORE INTO transcript_image_views
    (session_id, view_id, turn_id, tool_call_id, path, name, media_type, ts) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(sessionId, view.view_id, view.turn_id, view.tool_call_id, view.path, view.name, view.media_type, view.ts);
}

/** Presentation metadata is separate from model replay and contains no disk path. */
export function attachImageView(message: JsonObject | undefined, view: RuntimeImageViewRecord): void {
  if (!message) return;
  const views = Array.isArray(message.image_views) ? message.image_views : [];
  message.image_views = [...views, { view_id: view.view_id, turn_id: view.turn_id,
    tool_call_id: view.tool_call_id, name: view.name, media_type: view.media_type }];
}
