import { expect, test } from "bun:test";
import { appendComposerDraftPrompt, prepareDraftMove } from "../../../src/features/sessions/composer-draft";
import { conversationAttachments, moveConversationAttachments } from "../../../src/features/sessions/attachment-draft";
const callbacks = { changed() {}, error() {}, discard: async () => {}, tooMany: () => "Too many screenshots" };
test("workspace switching merges text and attachments without overwriting or discarding registrations", () => {
  const data = new Map<string, string>(); const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
  appendComposerDraftPrompt(storage, "move-a", "source"); appendComposerDraftPrompt(storage, "move-b", "target");
  const from = conversationAttachments("move-a", callbacks), to = conversationAttachments("move-b", callbacks);
  from.items = [{ attachment_id: "a", name: "a", media_type: "text/plain", size_bytes: 1 }];
  to.items = [{ attachment_id: "b", name: "b", media_type: "text/plain", size_bytes: 1 }];
  const move = prepareDraftMove("move-a", "move-b"); moveConversationAttachments("move-a", "move-b"); move();
  expect(to.items.map(item => item.attachment_id)).toEqual(["b", "a"]); expect(from.items).toEqual([]);
  appendComposerDraftPrompt({ getItem: () => null, setItem: (_key, text) => expect(text).toBe("target\n\nsource\n\nmore") }, "move-b", "more");
});
test("oversized or pending draft moves leave both drafts intact", () => {
  const storage = { getItem: () => null, setItem() {} };
  appendComposerDraftPrompt(storage, "large-a", "x".repeat(8190)); appendComposerDraftPrompt(storage, "large-b", "kept");
  expect(() => prepareDraftMove("large-a", "large-b")).toThrow("8192");
  const from = conversationAttachments("pending-a", callbacks); from.pending = 1;
  expect(() => moveConversationAttachments("pending-a", "pending-b")).toThrow("finish loading");
});
