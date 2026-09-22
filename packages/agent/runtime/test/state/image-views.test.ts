import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Database } from "bun:sqlite";
import { SqliteRuntimeStore } from "../../src/state/storage";
import { testWorkspace } from "../workspace";

test("image views survive call-only history, deduplication, cold reload and index rebuild without entering model replay", async () => {
  const root = mkdtempSync(join(tmpdir(), "lxe-image-views-"));
  const dbPath = join(root, "agent.sqlite3"), imagePath = join(root, "image.png");
  writeFileSync(imagePath, "source file");
  let store = new SqliteRuntimeStore(dbPath);
  try {
    await store.start();
    await store.ensureSession({ session_id: "s", source: {}, workspace: testWorkspace });
    await store.appendMessage("s", { role: "assistant", content: [
      { type: "tool_call", name: "read", id: "a", arguments: { path: imagePath } },
      { type: "tool_call", name: "read", id: "b", arguments: { path: imagePath } },
    ] }, "assistant", "t");
    const view = { view_id: "v1", turn_id: "t", tool_call_id: "a", path: imagePath, name: "image.png", media_type: "image/png", ts: 1 };
    await store.appendImageView("s", view);
    await store.appendImageView("s", view);
    await store.appendImageView("s", { ...view, view_id: "v2", tool_call_id: "b" });
    const check = async () => {
      expect(await store.resolveImageView("s", "v1")).toEqual(view);
      expect(await store.resolveImageView("other", "v1")).toBeUndefined();
      const detail = await store.sessionDetail("s", { limit: 10 });
      const messages = detail!.messages as Array<{ image_views?: unknown[] }>;
      expect(messages.flatMap(message => message.image_views ?? [])).toEqual([
        { view_id: "v1", turn_id: "t", tool_call_id: "a", name: "image.png", media_type: "image/png" },
        { view_id: "v2", turn_id: "t", tool_call_id: "b", name: "image.png", media_type: "image/png" },
      ]);
      expect(JSON.stringify(await store.loadMessages("s"))).not.toContain("view_id");
    };
    await check();
    const events = readFileSync(join(root, "session_transcripts", "s.jsonl"), "utf8").trim().split("\n").map(line => JSON.parse(line));
    expect(events.filter(event => event.kind === "image_view")).toHaveLength(2);
    await store.stop();
    store = new SqliteRuntimeStore(dbPath); await store.start(); await check();
    await store.stop();
    const db = new Database(dbPath);
    db.exec("DELETE FROM transcript_file_state; DELETE FROM transcript_image_views;"); db.close();
    store = new SqliteRuntimeStore(dbPath); await store.start(); await check();
    expect(await store.deleteSession("s")).toBe(true);
    expect(await store.resolveImageView("s", "v1")).toBeUndefined();
    expect(existsSync(imagePath)).toBe(true);
  } finally { await store.stop(); rmSync(root, { recursive: true, force: true }); }
});
