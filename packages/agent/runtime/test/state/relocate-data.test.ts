import { expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SqliteRuntimeStore } from "../../src/state/storage";
import { relocateAgentData } from "../../src/state/relocate-data";

test("offline relocation rejects a corrupt agent database without replacing it", async () => {
  const root = mkdtempSync(join(tmpdir(), "lxe-agent-corrupt-"));
  try {
    mkdirSync(join(root, "copy/db"), {recursive: true});
    const file = join(root, "copy/db/agent.sqlite3");
    writeFileSync(file, "invalid sqlite bytes");
    await expect(relocateAgentData(join(root, "copy"), join(root, "old"), join(root, "new"))).rejects.toThrow();
    expect(readFileSync(file, "utf8")).toBe("invalid sqlite bytes");
  } finally { rmSync(root, {recursive: true, force: true}); }
});

test("offline relocation preserves history text and rebuilds attachment offsets under the new root", async () => {
  const root = mkdtempSync(join(tmpdir(), "lxe-agent-relocation-"));
  const source = join(root,"old"), copy = join(root,"copy"), target = join(root,"new"), workspace = join(source,"workspace");
  try {
    const store = new SqliteRuntimeStore(join(source,"db/agent.sqlite3"));
    await store.start();
    await store.ensureSession({session_id: "s", source: {}, workspace: {directory: workspace, worktree: workspace}});
    await store.appendMessage("s", {role:"user",content:[{type:"text",text:`Read ${workspace}`},{type:"local_file",attachment_id:"a",turn_id:"t",path:join(workspace,"中文.txt"),name:"中文.txt",size_bytes:3,media_type:"text/plain",ts:1}]}, "turn_input", "t");
    await store.stop();
    const before = readFileSync(join(source,"db/session_transcripts/s.jsonl"));
    cpSync(source, copy, {recursive: true});
    await relocateAgentData(copy,source,target);
    expect(readFileSync(join(source,"db/session_transcripts/s.jsonl"))).toEqual(before);
    const history = readFileSync(join(copy,"db/session_transcripts/s.jsonl"),"utf8");
    expect(history).toContain(JSON.stringify(`Read ${workspace}`));
    expect(history).toContain(JSON.stringify(join(target,"workspace/中文.txt")));
    const db = new Database(join(copy,"db/agent.sqlite3"),{readonly:true});
    expect(db.query("SELECT workspace_directory FROM agent_sessions").get()).toEqual({workspace_directory:join(target,"workspace")});
    expect(db.query("SELECT path FROM transcript_attachments").get()).toEqual({path:join(target,"workspace/中文.txt")});
    expect((db.query("SELECT COUNT(*) AS count FROM transcript_display_groups").get() as any).count).toBeGreaterThan(0);
    db.close();
  } finally { rmSync(root,{recursive:true,force:true}); }
});
