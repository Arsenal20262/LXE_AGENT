import type { ConversationRow } from "./presentation";

export function rowImageView(row: ConversationRow) {
  const tool = row.liveTool ?? row.operation;
  return row.kind === "tool" && tool?.name === "read" && tool.status === "success" ? tool.image_view : undefined;
}

/** Group only adjacent successful reads after live/history reconciliation. */
export function groupImageViewRows(rows: readonly ConversationRow[]): ConversationRow[] {
  const result: ConversationRow[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const view = rowImageView(row);
    if (!view) { result.push(row); continue; }
    const identity = JSON.stringify([row.turnId || row.groupId, view.view_id]);
    if (seen.has(identity)) continue;
    seen.add(identity);
    const previous = result.at(-1);
    if (previous?.kind === "image_views" && (previous.turnId || previous.groupId) === (row.turnId || row.groupId)) {
      previous.imageRows!.push(row);
    } else {
      result.push({ ...row, id: `image-views:${identity}`, kind: "image_views", imageRows: [row] });
    }
  }
  return result;
}
