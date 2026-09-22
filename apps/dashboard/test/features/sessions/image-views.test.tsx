import React from "react";
import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { conversationRows, type ConversationRow } from "../../../src/features/sessions/presentation";
import { groupImageViewRows } from "../../../src/features/sessions/image-view-groups";
import { UnifiedConversationRow } from "../../../src/features/sessions/view";
import type { SessionMessage } from "../../../src/api/payloads";

const view = (id: string) => ({ view_id: id, name: "same.png", media_type: "image/png" });
const read = (id: string, status: "success" | "running" | "error" = "success"): ConversationRow => ({
  id, groupId: "g", turnId: "t", kind: "tool", createdAt: 1,
  liveTool: { id, name: "read", title: "Read", detail: "same.png", icon_token: "file", status, duration_ms: 1, image_view: view(id) },
});
const groups = (rows: ConversationRow[]) => groupImageViewRows(rows).map(row => row.kind === "image_views" ? row.imageRows!.map(r => r.id) : row.id);

test("groups sequential reads, preserves boundaries and deduplicates only repeated identities", () => {
  expect(groups([read("a"), read("b"), read("b")])).toEqual([["a", "b"]]);
  expect(groupImageViewRows([read("a")])[0]!.id).toBe(groupImageViewRows([read("a"), read("b")])[0]!.id);
  for (const boundary of [read("x", "running"), read("x", "error"),
    { ...read("x"), liveTool: { ...read("x").liveTool!, name: "exec" } },
    { id: "x", groupId: "g", turnId: "t", createdAt: 1, kind: "message", message: { role: "assistant", display_group_id: "g", content: "text" } } as ConversationRow,
    { id: "x", groupId: "g", turnId: "t", createdAt: 1, kind: "message", message: { role: "assistant", display_group_id: "g", content: [{ type: "thinking", thinking: "reason" }] } } as ConversationRow]) {
    expect(groups([read("a"), boundary, read("b")])).toEqual([["a"], "x", ["b"]]);
  }
  expect(groups([read("a"), { ...read("b"), turnId: "other" }])).toEqual([["a"], ["b"]]);
});

test("call-only saved success and fully persisted results produce the same groups; old calls are not inferred", () => {
  const message: SessionMessage = { role: "assistant", display_group_id: "g", turn: { turn_id: "t", status: "cancelled", elapsed_ms: 1 },
    content: ["a", "b"].map(id => ({ type: "tool_call", name: "read", id, arguments: { path: "same.png" } })),
    image_views: ["a", "b"].map(id => ({ ...view(id), turn_id: "t", tool_call_id: id })),
  };
  const before = groupImageViewRows(conversationRows([message], [], []));
  const result: SessionMessage = { ...message, role: "tool", image_views: undefined,
    content: ["a", "b"].map(id => ({ type: "tool_result", tool_call_id: id, content: "[Image omitted]" })),
  };
  const after = groupImageViewRows(conversationRows([message, result], [], []));
  expect(after.filter(row => row.kind === "image_views").map(row => row.id)).toEqual(before.filter(row => row.kind === "image_views").map(row => row.id));
  expect(before.find(row => row.kind === "image_views")?.imageRows).toHaveLength(2);
  expect(groupImageViewRows(conversationRows([{ ...message, image_views: undefined }], [], [])).some(row => row.kind === "image_views")).toBe(false);
});

test("renders one expanded image group with details instead of duplicate read rows", () => {
  const row = groupImageViewRows([read("a"), read("b")])[0]!;
  const noop = async () => {};
  const html = renderToStaticMarkup(<QueryClientProvider client={new QueryClient()}>
    <UnifiedConversationRow row={row} expanded={false} onToggle={() => {}} onOpenFile={noop} onRevealFile={noop} onOpenAttachment={noop} attachmentSessionId="s" />
  </QueryClientProvider>);
  expect(html).toContain("查看了 2 张图片");
  expect(html.match(/class="sent-image-tile"/g)).toHaveLength(2);
  expect(html).toContain('aria-expanded="true"');
  expect(html).toContain("调用详情");
  expect(html).not.toContain("tool-op-summary");
});
