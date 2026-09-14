import { expect, spyOn, test } from "bun:test";
import { ConversationDisplayController } from "../../../src/features/sessions/display-controller";
import { composeConversationRows, conversationRows, projectConversationHistory, type ConversationHistoryProjection, type PendingMessage } from "../../../src/features/sessions/presentation";
import { toolOperations } from "../../../src/features/sessions/conversation";
import type { DesktopConversationTurnPayload, SessionDetailPayload, SessionMessage } from "../../../src/api/payloads";

const message = (id: string, role: string, content: unknown, turnId = "old"): SessionMessage => ({
  id, display_id: id, message_id: id, display_group_id: `g:${turnId}`, role, content, created_at: 1,
  turn: { turn_id: turnId, status: "completed" },
});
const page = (messages: SessionMessage[]): SessionDetailPayload => {
  const ids = [...new Set(messages.map(value => value.display_group_id))];
  return { session: { session_id: "s" }, messages, messages_page: {
    group_cursors: ids, total: ids.length, raw_message_total: messages.length, limit: 10, fetched_at: 1,
    oldest_cursor: ids[0] ?? null, newest_cursor: ids.at(-1) ?? null,
    previous_cursor: null, next_cursor: null, has_previous: false, has_next: false,
  } } as SessionDetailPayload;
};
const live = (seq: number, state = "running"): DesktopConversationTurnPayload => ({
  turn_id: "live", message_id: "live-user", text: "next", state, created_at: 2000, started_at: 2000, settled_at: state === "running" ? 0 : 3000,
  stream: { seq, tool_steps: [], process_parts: [
    { type: "text", part_id: "live-answer:0", sequence: 1, text: `answer ${seq}`, presentation: "final", status: "running" },
  ], display_metrics: { phase: "generating_answer" } },
} as DesktopConversationTurnPayload);
const activity = (turn: DesktopConversationTurnPayload) => ({ session_id: "s", active: turn.state === "running" ? turn : null, latest: turn.state === "running" ? null : turn, queued: [] });
const projection = (controller: ConversationDisplayController) => (controller as unknown as { historyProjection: ConversationHistoryProjection }).historyProjection;
function freeze(value: unknown): void {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return;
  Object.freeze(value);
  if (value instanceof Map) for (const entry of value.values()) freeze(entry);
  else for (const entry of Object.values(value)) freeze(entry);
}

const history = (): SessionMessage[] => [
  message("user", "user", "inspect"),
  message("call", "assistant", [{ type: "tool_call", id: "c", name: "read", arguments: { path: "file.txt" } }]),
  message("result", "tool", [{ type: "tool_result", tool_call_id: "c", content: "ok" }]),
  { ...message("answer", "assistant", [{ type: "text", text: "done" }]), artifacts: [{ artifact_id: "a", turn_id: "old", name: "report.txt" }] },
];

test("text updates reuse history projection, rows and footers without reading history content or pruning", () => {
  const c = new ConversationDisplayController(); c.select("s");
  let reads = 0;
  const messages = history().map(value => { const content = value.content; return { ...value, get content() { reads++; return content; } }; });
  c.receiveHistory(page(messages), "latest");
  c.receiveActivity(activity(live(1)));
  const cached = projection(c), rows = c.getSnapshot().rows.filter(row => row.turnId === "old");
  const before = reads;
  const cleanup = spyOn(c as unknown as { pruneUnreferencedTurns(): void }, "pruneUnreferencedTurns");
  try {
    for (let seq = 2; seq < 12; seq++) {
      c.receiveActivity(activity(live(seq)));
      expect(projection(c)).toBe(cached);
      for (const row of rows) expect(c.getSnapshot().rows.find(value => value.id === row.id)).toBe(row);
    }
    expect(reads).toBe(before);
    expect(cleanup).not.toHaveBeenCalled();
    c.receiveActivity(activity(live(12, "completed")));
    expect(cleanup).toHaveBeenCalledTimes(1);
  } finally { cleanup.mockRestore(); }
});

test("history replacement, paging, detached tail jumps and selection replace the single cache", () => {
  const c = new ConversationDisplayController(); c.select("s"); c.receiveHistory(page(history()), "latest");
  const first = projection(c);
  c.receiveHistory(page(history()), "latest");
  expect(projection(c)).not.toBe(first);
  c.setFollowing(false);
  const beforeOlder = projection(c);
  c.receiveHistory(page([message("earlier", "user", "earlier", "earlier")]), "older");
  expect(projection(c)).not.toBe(beforeOlder);
  expect(projection(c).byId.has("user:earlier")).toBe(true);
  const beforeNewer = projection(c);
  c.receiveHistory(page([message("later", "user", "later", "later")]), "newer");
  expect(projection(c)).not.toBe(beforeNewer);
  expect(projection(c).byId.has("user:later")).toBe(true);
  c.receiveHistory(page([message("latest", "user", "latest", "latest")]), "latest");
  expect(c.getSnapshot().connection).toBe("detached");
  expect(projection(c).byId.has("user:latest")).toBe(false);
  c.jumpToLatest();
  expect(projection(c).source).toBe(c.getSnapshot().detail!.messages);
  expect([...projection(c).byId.keys()]).toEqual(["user:latest", "status:latest"]);
  c.select("other");
  expect(projection(c).source).toHaveLength(0);
  expect(projection(c).byId.size).toBe(0);
});

test("pending attachment and error overlays cannot mutate frozen history or contaminate later composition", () => {
  const attachment = { attachment_id: "image", name: "image.png", media_type: "image/png", size_bytes: 12 };
  const messages = [{ ...message("user", "user", "hello"), client_message_id: "client", attachments: [] }];
  const cached = projectConversationHistory(messages);
  const original = cached.byId.get("user:client")!;
  freeze(cached);
  const pending: PendingMessage = { pendingId: "client", sessionId: "s", text: "hello", createdAt: 1000, attachments: [attachment], error: "actual send failure" };
  const row = composeConversationRows(cached, [], [pending]).find(row => row.id === original.id)!;
  expect(row).not.toBe(original);
  expect(row.message?.attachments).toEqual([attachment]);
  expect(row.error).toBe("actual send failure");
  expect(original.message?.attachments).toEqual([]);
  expect(original.error).toBeUndefined();
  expect(composeConversationRows(cached, [], []).find(row => row.id === original.id)).toBe(original);
});

test("live handoff updates final metadata without changing the cached answer", () => {
  const cached = projectConversationHistory(history()); freeze(cached);
  const turn = { ...live(1), turn_id: "old", message_id: "user", stream: { ...live(1).stream!, process_parts: [
    { type: "text", part_id: "answer:0", sequence: 1, text: "new answer", presentation: "final", status: "running" },
  ] } } as DesktopConversationTurnPayload;
  const rows = composeConversationRows(cached, [turn], [], true);
  expect(rows.find(row => row.kind === "answer_meta")?.answerMeta?.text).toBe("new answer");
  expect(cached.answerRows.get("answer-meta:turn:old")?.answerMeta?.text).toBe("done");
  expect(rows.at(-2)?.kind).toBe("artifacts");
  expect(rows.at(-1)?.kind).toBe("answer_meta");
});

test("empty historical answers are cached without reparsing their text on unrelated updates", () => {
  let reads = 0;
  const block = { type: "text", get text() { reads++; return "   "; } };
  const cached = projectConversationHistory([message("empty", "assistant", [block])]);
  const before = reads;
  for (let seq = 1; seq < 5; seq++) composeConversationRows(cached, [live(seq)], []);
  expect(reads).toBe(before);
});

test("tool queues preserve duplicate IDs, anonymous consumption and orphan result order", () => {
  const calls = [{ type: "tool_call", id: "a", name: "read" }, { type: "tool_call", name: "read" },
    { type: "tool_call", id: "a", name: "read" }, { type: "tool_call", id: "b", name: "read" }, { type: "tool_call", id: "missing", name: "read" }];
  const results = [
    { type: "tool_result", tool_call_id: "b", content: "b1" },
    { type: "tool_result", tool_call_id: "a", content: "a1" },
    { type: "tool_result", tool_call_id: "a", content: "a2" },
    { type: "tool_result", tool_call_id: "b", content: "b2" },
    { type: "tool_result", content: "anonymous orphan" },
    { type: "tool_result", tool_call_id: "z", content: "named orphan" },
  ];
  const operations = toolOperations([message("calls", "assistant", calls), message("results", "tool", results)]);
  expect(operations.map(op => (op.result as { content: string } | undefined)?.content)).toEqual(["a1", "b1", "a2", "b2", undefined, "anonymous orphan", "named orphan"]);
  expect(operations.slice(-2).map(op => op.key)).toEqual(["result-0", "z"]);
});

test("operation lookup keeps first-match precedence when block reference conflicts with duplicate ID", () => {
  const first = { type: "tool_call", id: "dup", name: "read", input: { path: "first" } };
  const second = { type: "tool_call", id: "dup", name: "read", input: { path: "second" } };
  const firstResult = { type: "tool_result", tool_call_id: "dup", content: "first result" };
  const secondResult = { type: "tool_result", tool_call_id: "dup", content: "second result" };
  const rows = conversationRows([message("results", "tool", [secondResult, firstResult]), message("calls", "assistant", [first, second])], [], []);
  expect(rows.filter(row => row.kind === "tool")).toHaveLength(1);
  expect(rows.find(row => row.kind === "tool")?.operation?.call).toBe(first);
  expect(rows.find(row => row.kind === "tool")?.operation?.result).toBe(secondResult);
});

for (const reversed of [false, true]) test(`tool pairing and display lookup inspect IDs linearly (${reversed ? "reverse" : "forward"} results)`, () => {
  const measure = (count: number, project: boolean) => {
    let reads = 0;
    const calls = Array.from({ length: count }, (_, i) => ({ type: "tool_call", get id() { reads++; return `c${i}`; }, name: "read" }));
    const results = calls.map((_, i) => ({ type: "tool_result", get tool_call_id() { reads++; return `c${i}`; }, content: `result${i}` }));
    if (reversed) results.reverse();
    const messages = [message("calls", "assistant", calls), message("results", "tool", results)];
    const operations = project ? conversationRows(messages, [], []).filter(row => row.kind === "tool").map(row => row.operation!) : toolOperations(messages);
    expect(operations).toHaveLength(count);
    expect((operations.at(-1)?.result as { content: string }).content).toBe(`result${count - 1}`);
    return reads;
  };
  for (const project of [false, true]) {
    const small = measure(200, project), large = measure(400, project);
    expect(small).toBeGreaterThan(0);
    expect(large).toBeLessThanOrEqual(small * 2.1);
    expect(large).toBeLessThan(400 * 30);
  }
});
