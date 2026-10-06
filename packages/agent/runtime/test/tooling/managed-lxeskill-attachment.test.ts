import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RuntimeAttachmentRecord, RuntimeMessage, RuntimeMessageContent } from "../../src/engine/types";
import { resolveManagedAttachment } from "../../src/tooling/managed-lxeskill-attachment";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function attachment(name = "synthetic.xlsx", contents = "fake"): RuntimeAttachmentRecord {
  const root = mkdtempSync(join(tmpdir(), "lxe-attachment-"));
  roots.push(root);
  const path = join(root, name);
  writeFileSync(path, contents);
  return { attachment_id: "attachment-a", turn_id: "turn-upload", path, name,
    size_bytes: Buffer.byteLength(contents), media_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ts: 1 };
}
const block = (value: RuntimeAttachmentRecord) => ({ type: "local_file", ...value });
const user = (message_id: string, content: RuntimeMessageContent): RuntimeMessage =>
  ({ role: "user", message_id, content });
const select = (messages: RuntimeMessage[], record: RuntimeAttachmentRecord, currentTurnId = "turn-upload") =>
  resolveManagedAttachment({ messages, attachment: record, currentTurnId });

describe("managed lxeskill attachment source", () => {
  test("accepts the current message's sole XLSX", () => {
    const record = attachment();
    expect(select([user("message-now", [{ type: "text", text: "生成" }, block(record)])], record)).toBe(realpathSync(record.path));
  });

  test("accepts the immediately previous sole XLSX after a text-only continuation", () => {
    const record = attachment();
    expect(select([
      user("message-upload", [block(record)]),
      { role: "user", content: "Skill instructions", invoked_skills: ["vietnam-stock-recommendation"] },
      user("message-confirm", "确认继续处理这份表"),
    ], record, "turn-confirm")).toBe(realpathSync(record.path));
  });

  test("rejects an attachment from an older message", () => {
    const record = attachment();
    expect(() => select([
      user("message-upload", [block(record)]), user("message-other", "别的事"),
      user("message-now", "查询越南备货"),
    ], record, "turn-now")).toThrow(/current or immediately previous/);
  });

  test("rejects multiple attachments in the current message", () => {
    const record = attachment();
    const other = { ...record, attachment_id: "attachment-b" };
    expect(() => select([user("message-now", [block(record), block(other)])], record)).toThrow(/multiple attachments/);
  });

  test("permits a selected attachment from a preceding multi-file message after confirmation", () => {
    const record = attachment();
    const other = { ...record, attachment_id: "attachment-b" };
    expect(select([user("message-upload", [block(record), block(other)]),
      user("message-confirm", "用第一份 XLSX")], record, "turn-confirm")).toBe(realpathSync(record.path));
  });

  test("rejects non-XLSX, changed and missing files", () => {
    const csv = attachment("synthetic.csv");
    expect(() => select([user("message-now", [block(csv)])], csv)).toThrow(/XLSX/);
    const changed = attachment();
    writeFileSync(changed.path, "changed-size");
    expect(() => select([user("message-now", [block(changed)])], changed)).toThrow(/changed/);
    const missing = attachment();
    rmSync(missing.path);
    expect(() => select([user("message-now", [block(missing)])], missing)).toThrow(/missing/);
  });

  test("does not skip an unidentified user message or a compaction boundary", () => {
    const record = attachment();
    expect(() => select([
      user("message-upload", [block(record)]), { role: "user", content: "intervening input" },
      user("message-confirm", "继续处理"),
    ], record, "turn-confirm")).toThrow(/immediately previous/);
    expect(() => select([
      user("message-upload", [block(record)]),
      { role: "compactionSummary", summary: "Synthetic summary", tokensBefore: 100,
        details: { readFiles: [], modifiedFiles: [] } },
      user("message-confirm", "继续处理"),
    ], record, "turn-confirm")).toThrow(/compaction/);
  });

  test("rejects mismatched record identity and a later steering message", () => {
    const record = attachment();
    const wrong = { ...record, path: join(tmpdir(), "other.xlsx") };
    expect(() => select([user("message-now", [block(record)])], wrong)).toThrow(/record/);
    expect(() => select([user("message-now", [block(record)]), user("", "改做别的")], record)).toThrow(/current message/);
  });
});
