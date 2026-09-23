import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync, unlinkSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Database } from "bun:sqlite";
import { SqliteRuntimeStore } from "../../src/state/storage";
import { testWorkspace } from "../workspace";
const image = (data: string) => ({ type: "image", source: { type: "base64", media_type: "image/png", data } });

test("historical attachment and tool images remain independently addressable after compaction, reset, restart and index migration", async () => {
  const root = mkdtempSync(join(tmpdir(), "history-images-"));
  const path = join(root, "source.png"), dbPath = join(root, "agent.sqlite3");
  let store = new SqliteRuntimeStore(dbPath);
  const attachment = (id: string) => ({ type: "local_file", attachment_id: id, turn_id: "t1", path, name: "source.png", size_bytes: 3, media_type: "image/png", ts: 1 });
  const view = (turn: string) => ({ view_id: turn, turn_id: turn, tool_call_id: "same-call", path, name: "source.png", media_type: "image/png", ts: 1 });
  try {
    writeFileSync(path, "original");
    await store.start();
    await store.ensureSession({ session_id: "s", source: {}, workspace: testWorkspace });
    await store.appendMessage("s", { role: "user", content: [attachment("a"), image("first"), attachment("b"), image("second"), attachment("file")] }, "input", "t1");
    for (const turn of ["t1", "t2"]) {
      await store.appendImageView("s", view(turn), image(turn));
      expect(await store.resolveImagePreview("s", "image_view", turn)).toEqual({ source: "history", image: image(turn) });
      await store.appendMessage("s", { role: "tool", content: [
        { type: "tool_result", tool_call_id: "other", content: [image("unrelated")] },
        { type: "tool_result", tool_call_id: "same-call", content: [{ type: "text", text: "result" }, image(turn)] },
      ] }, "tools", turn);
      store.clearPendingImageViews("s", turn);
    }
    writeFileSync(path, "overwritten");
    await store.replaceMessages("s", [{ role: "user", content: "summary" }], "compaction");
    await store.resetContext("s");
    const transcriptPath = join(root, "session_transcripts", "s.jsonl");
    const before = readFileSync(transcriptPath, "utf8");
    await store.stop();
    const db = new Database(dbPath); db.exec("DROP TABLE transcript_history_images"); db.close();
    store = new SqliteRuntimeStore(dbPath); await store.start();
    unlinkSync(path);
    expect(await store.resolveImagePreview("s", "attachment", "a")).toEqual({ source: "history", image: image("first") });
    expect(await store.resolveImagePreview("s", "attachment", "b")).toEqual({ source: "history", image: image("second") });
    expect(await store.resolveImagePreview("s", "attachment", "file")).toEqual({ source: "current_file", path });
    for (const turn of ["t1", "t2"]) expect(await store.resolveImagePreview("s", "image_view", turn)).toEqual({ source: "history", image: image(turn) });
    expect(await store.resolveImagePreview("other", "attachment", "a")).toBeUndefined();
    expect(await store.resolveImagePreview("other", "image_view", "t1")).toBeUndefined();
    expect(await store.loadMessages("s")).toEqual([]);
    expect(readFileSync(transcriptPath, "utf8")).toBe(before);
    // Broken historical image data remains authoritative, so the preview layer can report it.
    await store.appendMessage("s", { role: "user", content: [attachment("bad"), image("not base64")] }, "input", "t3");
    expect(await store.resolveImagePreview("s", "attachment", "bad")).toEqual({ source: "history", image: image("not base64") });
    const display = JSON.stringify(await store.loadTranscriptDisplayPage("s", { limit: 100 }));
    expect(display).not.toContain('"data":"first"');
    writeFileSync(path, "external image");
    await store.deleteSession("s");
    expect(existsSync(path)).toBe(true);
    expect(await store.resolveImagePreview("s", "image_view", "t1")).toBeUndefined();
    const check = new Database(dbPath); expect(check.query("SELECT count(*) AS n FROM transcript_history_images").get()).toEqual({ n: 0 }); check.close();
  } finally { await store.stop(); rmSync(root, { recursive: true, force: true }); }
});

test("pending images are session scoped and release on cancellation; old records without image payloads use paths", async () => {
  const root = mkdtempSync(join(tmpdir(), "pending-images-"));
  let store = new SqliteRuntimeStore(join(root, "agent.sqlite3"));
  const view = { view_id: "v", turn_id: "t", tool_call_id: "call", path: join(root, "old.png"), name: "old.png", media_type: "image/png", ts: 1 };
  try {
    await store.start(); await store.ensureSession({ session_id: "s", source: {}, workspace: testWorkspace });
    await store.appendImageView("s", view, image("pending"));
    expect(await store.resolveImagePreview("s", "image_view", "v")).toEqual({ source: "history", image: image("pending") });
    expect(await store.resolveImagePreview("other", "image_view", "v")).toBeUndefined();
    store.clearPendingImageViews("s", "other-turn");
    expect((await store.resolveImagePreview("s", "image_view", "v"))?.source).toBe("history");
    await store.appendImageView("s", view, image("duplicate must not replace the first preview"));
    expect(await store.resolveImagePreview("s", "image_view", "v")).toEqual({ source: "history", image: image("pending") });
    store.clearPendingImageViews("s", "t");
    expect(await store.resolveImagePreview("s", "image_view", "v")).toEqual({ source: "current_file", path: view.path });
    await store.appendMessage("s", { role: "tool", content: [{ type: "tool_result", tool_call_id: "call", content: [{ type: "text", text: "[image omitted]" }] }] }, "tools", "t");
    const pendingWrite = store.appendImageView("s", { ...view, view_id: "pending-stop", tool_call_id: "pending-stop" }, image("pending stop"));
    await store.stop(); await pendingWrite; await store.start();
    expect(await store.resolveImagePreview("s", "image_view", "pending-stop")).toEqual({ source: "current_file", path: view.path });
    await store.stop(); store = new SqliteRuntimeStore(join(root, "agent.sqlite3")); await store.start();
    expect(await store.resolveImagePreview("s", "image_view", "v")).toEqual({ source: "current_file", path: view.path });
  } finally { await store.stop(); rmSync(root, { recursive: true, force: true }); }
});
