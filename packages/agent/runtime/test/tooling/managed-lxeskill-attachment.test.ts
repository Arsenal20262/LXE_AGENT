import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RuntimeAttachmentRecord, RuntimeMessage, RuntimeMessageContent } from "../../src/engine/types";
import { turnAbortedMessage } from "../../src/engine/turn-aborted";
import { resolveManagedAttachment, resolveManagedAttachmentSet, selectManagedAttachmentIds } from "../../src/tooling/managed-lxeskill-attachment";
import { ToolExecutionError } from "../../src/tooling/registry";

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

  test("ignores Runtime environment context while identifying the current real user message", () => {
    const record = attachment();
    const environment = { role: "user", content: "Synthetic environment context", environmentContext: {} } as RuntimeMessage;
    expect(select([user("message-upload", [block(record)]), environment], record)).toBe(realpathSync(record.path));
    expect(select([
      user("message-upload", [block(record)]), environment,
      user("message-confirm", "确认继续处理这份表"), environment,
    ], record, "turn-confirm")).toBe(realpathSync(record.path));
  });

  test("accepts the immediately previous sole XLSX after a text-only continuation", () => {
    const record = attachment();
    expect(select([
      user("message-upload", [block(record)]),
      { role: "user", content: "Skill instructions", invoked_skills: ["vietnam-stock-recommendation"] },
      user("message-confirm", "确认继续处理这份表"),
    ], record, "turn-confirm")).toBe(realpathSync(record.path));
  });

  test("an interrupted prior turn preserves the immediately previous real upload", () => {
    const record = attachment();
    const marker = turnAbortedMessage();
    const messages = [user("message-upload", [block(record)]), marker,
      user("message-confirm", "继续处理这份表")];
    expect(select(messages, record, "turn-confirm")).toBe(realpathSync(record.path));
    // Old transcripts have the same Runtime-owned message without metadata.
    expect(select([messages[0]!, { role: "user", content: marker.content }, messages[2]!],
      record, "turn-confirm")).toBe(realpathSync(record.path));
    // A real user message with the same text is still an intervening turn.
    expect(() => select([messages[0]!, user("message-intervening", marker.content), messages[2]!],
      record, "turn-confirm")).toThrow(/immediately previous/);
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
    try {
      select([user("message-now", [block(missing)])], missing);
      throw new Error("expected a missing attachment failure");
    } catch (error) {
      expect(error).toBeInstanceOf(ToolExecutionError);
      expect((error as Error).message).toContain("ENOENT");
      expect((error as Error).message).not.toContain(missing.path);
    }
  });

  test("a declared extension can reuse the same provenance check without changing the default XLSX contract", () => {
    const csv = attachment("synthetic.csv");
    expect(resolveManagedAttachment({ messages: [user("message-now", [block(csv)])], attachment: csv,
      currentTurnId: "turn-upload", allowedExtensions: [".csv"] })).toBe(realpathSync(csv.path));
    expect(() => select([user("message-now", [block(csv)])], csv)).toThrow(/XLSX/);
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

  test("selects and verifies an exact current three-file set in upload order", () => {
    const records = ["a", "b", "c"].map(id => ({ ...attachment(`${id}.xlsx`), attachment_id: `attachment-${id}` }));
    const messages = [user("message-now", records.map(block))];
    expect(selectManagedAttachmentIds(messages, "turn-upload", 3)).toEqual(records.map(record => record.attachment_id));
    expect(resolveManagedAttachmentSet({ messages, attachments: records, currentTurnId: "turn-upload", count: 3 }))
      .toEqual(records.map(record => realpathSync(record.path)));
  });

  test("the current upload set takes precedence over an immediately previous set", () => {
    const previous = ["a", "b", "c"].map(id => ({ ...attachment(`previous-${id}.xlsx`),
      attachment_id: `previous-${id}`, turn_id: "turn-previous" }));
    const current = ["a", "b", "c"].map(id => ({ ...attachment(`current-${id}.xlsx`),
      attachment_id: `current-${id}`, turn_id: "turn-current" }));
    const messages = [user("message-previous", previous.map(block)), user("message-current", current.map(block))];
    expect(selectManagedAttachmentIds(messages, "turn-current", 3)).toEqual(current.map(record => record.attachment_id));
  });

  test("three-file set permits only the immediately previous upload after continuation", () => {
    const records = ["a", "b", "c"].map(id => ({ ...attachment(`${id}.xlsx`), attachment_id: `attachment-${id}` }));
    const upload = user("message-upload", records.map(block));
    const current = user("message-confirm", "继续处理这三份文件");
    const messages = [upload, { role: "user", content: "Synthetic environment", environmentContext: {} }, current] as RuntimeMessage[];
    expect(selectManagedAttachmentIds(messages, "turn-confirm", 3)).toEqual(records.map(record => record.attachment_id));
    expect(resolveManagedAttachmentSet({ messages, attachments: records, currentTurnId: "turn-confirm", count: 3 })).toHaveLength(3);
    expect(() => selectManagedAttachmentIds([upload, user("intervening", "别的事"), current], "turn-confirm", 3))
      .toThrow(/immediately previous/);
    expect(() => selectManagedAttachmentIds([upload, { role: "compactionSummary", summary: "Synthetic summary",
      tokensBefore: 10, details: { readFiles: [], modifiedFiles: [] } }, current], "turn-confirm", 3))
      .toThrow(/compaction/);
  });

  test("three-file set rejects extra, non-XLSX, duplicate, and mismatched records", () => {
    const records = ["a", "b", "c"].map(id => ({ ...attachment(`${id}.xlsx`), attachment_id: `attachment-${id}` }));
    const messages = [user("message-now", records.map(block))];
    expect(() => selectManagedAttachmentIds([user("message-now", [...records.map(block), block(attachment("extra.xlsx"))])],
      "turn-upload", 3)).toThrow(/exactly 3/);
    const csv = { ...attachment("c.csv"), attachment_id: "attachment-c" };
    expect(() => resolveManagedAttachmentSet({ messages: [user("message-now", [block(records[0]!), block(records[1]!), block(csv)])],
      attachments: [records[0]!, records[1]!, csv], currentTurnId: "turn-upload", count: 3 })).toThrow(/XLSX/);
    expect(() => selectManagedAttachmentIds([user("message-now", [block(records[0]!), block(records[1]!),
      block({ ...records[2]!, attachment_id: "attachment-a" })])], "turn-upload", 3)).toThrow(/duplicate/);
    expect(() => resolveManagedAttachmentSet({ messages, attachments: [records[0]!, records[2]!, records[1]!],
      currentTurnId: "turn-upload", count: 3 })).toThrow(/record/);
    expect(() => resolveManagedAttachmentSet({ messages, attachments: records.slice(0, 2),
      currentTurnId: "turn-upload", count: 3 })).toThrow(/set/);
    const duplicatePath = { ...records[1]!, path: records[0]!.path, name: records[0]!.name,
      size_bytes: records[0]!.size_bytes };
    const duplicateRecords = [records[0]!, duplicatePath, records[2]!];
    expect(() => resolveManagedAttachmentSet({ messages: [user("message-now", duplicateRecords.map(block))],
      attachments: duplicateRecords, currentTurnId: "turn-upload", count: 3 })).toThrow(/duplicate attachment paths/);
  });

  test("three-file set rejects every malformed file block and never falls back past one", () => {
    const records = ["a", "b", "c"].map(id => ({ ...attachment(`${id}.xlsx`), attachment_id: `attachment-${id}` }));
    const malformed = [
      { ...block(records[0]!), attachment_id: "" },
      { ...block(records[0]!), turn_id: "" },
      { ...block(records[0]!), path: "" },
      { ...block(records[0]!), name: "" },
      { ...block(records[0]!), size_bytes: Number.NaN },
    ];
    for (const value of malformed) {
      expect(() => selectManagedAttachmentIds([user("message-now", [...records.map(block), value])],
        "turn-upload", 3)).toThrow(/malformed/);
      expect(() => selectManagedAttachmentIds([user("message-upload", records.map(block)),
        user("message-now", [value])], "turn-now", 3)).toThrow(/malformed/);
    }
  });

  test("immediately previous files must share one prior upload turn", () => {
    const records = ["a", "b", "c"].map((id, index) => ({ ...attachment(`${id}.xlsx`),
      attachment_id: `attachment-${id}`, turn_id: `turn-upload-${index}` }));
    expect(() => selectManagedAttachmentIds([user("message-upload", records.map(block)),
      user("message-confirm", "继续处理这些文件")], "turn-confirm", 3)).toThrow(/one prior upload turn/);
    expect(() => selectManagedAttachmentIds([user("message-now", records.map(block))], "turn-upload-0", 3))
      .toThrow(/current attachment turn/);
  });

  test("only a declared fixed count from two to eight is accepted", () => {
    const records = ["a", "b", "c"].map(id => ({ ...attachment(`${id}.xlsx`), attachment_id: `attachment-${id}` }));
    const messages = [user("message-now", records.map(block))];
    for (const count of [0, 1, 9, 2.5]) {
      expect(() => selectManagedAttachmentIds(messages, "turn-upload", count)).toThrow(/invalid managed attachment count/);
    }
  });
});
