import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { workspaceArtifactRoot } from "@lxe/core";
import type { JsonObject, PermissionMode } from "@lxe/protocol";
import type { RuntimeAttachmentRecord, RuntimeMessage } from "../../src/engine/types";
import type { CliTerminalResult } from "../../src/tooling/one-shot-cli";
import type { LxeSkillCommandDefinition } from "../../src/tooling/lxeskill-command";
import { createManagedLxeSkillTool } from "../../src/tooling/managed-lxeskill-tool";
import { PermissionPolicyService } from "../../src/permissions/policy";
import { ToolExecutionError, ToolRegistry } from "../../src/tooling/registry";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const owner = "synthetic-file-skill";
const bind: LxeSkillCommandDefinition = { name: "synthetic_single_bind", command: "lxeskill synthetic single bind", visibility: "business", ownerSkills: [owner], managedExecution: { attachmentArgument: "source_path" }, timeoutMs: 180_000 };
const generate: LxeSkillCommandDefinition = { name: "synthetic_result_run", command: "lxeskill synthetic result run", visibility: "business", ownerSkills: [owner], managedExecution: {}, timeoutMs: 3_600_000, artifactPaths: [{ field: "output_xlsx", role: "deliverable" }] };
const batch: LxeSkillCommandDefinition = { name: "synthetic_batch_run", command: "lxeskill synthetic batch run", visibility: "business", ownerSkills: ["synthetic-file-skill"], managedExecution: { attachmentArgument: "source_files", attachmentCount: 3 }, timeoutMs: 180_000, artifactPaths: [{ field: "output_xlsx", role: "deliverable" }] };
const terminal = (command: string, data: JsonObject, files: string[] = [], ok = true): CliTerminalResult => ({ protocol_version: "1", type: "result", command, ok, data, files });

function fixture(mode: PermissionMode = "workspace-write") {
  const root = mkdtempSync(join(tmpdir(), "lxe-managed-tool-")); roots.push(root);
  const workspaceRoot = join(root, "workspace"); mkdirSync(workspaceRoot);
  const source = join(root, "synthetic.xlsx"); writeFileSync(source, "synthetic");
  const attachment: RuntimeAttachmentRecord = { attachment_id: "attachment-1", turn_id: "turn-1", path: source, name: "synthetic.xlsx", size_bytes: 9, media_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ts: 1 };
  const attachments = new Map([[attachment.attachment_id, attachment]]);
  let messages: RuntimeMessage[] = [{ role: "user", message_id: "message-1", content: [{ type: "local_file", ...attachment }] }];
  const calls: Array<{ argv: string[]; workspaceRoot: string; timeoutMs: number }> = [];
  let result: CliTerminalResult = terminal("synthetic single bind", { success: true });
  const registry = new ToolRegistry();
  registry.register(createManagedLxeSkillTool({ commands: [bind, generate, batch],
    loadMessages: async () => messages,
    resolveAttachment: async (_session, id) => attachments.get(id),
    run: async (_entry, argv, workspaceRoot, _signal, timeoutMs) => { calls.push({ argv, workspaceRoot, timeoutMs }); return result; },
  }));
  const workspace = { directory: workspaceRoot, worktree: workspaceRoot };
  const controller = new AbortController();
  const context = { session_id: "session-1", turn_id: "turn-1", platform: "desktop", workspace,
    executionPolicy: new PermissionPolicyService().resolve({ session_id: "session-1", workspace, permission_mode: mode }),
    handle: { signal: controller.signal, cancelled: false, drainSteering: () => [], registerProcess: () => () => {} }, skill_names: [owner] };
  return { root, workspaceRoot, attachment, calls, registry, context, controller,
    addAttachment: (record: RuntimeAttachmentRecord) => { attachments.set(record.attachment_id, record); },
    messages: (next: RuntimeMessage[]) => { messages = next; }, result: (next: CliTerminalResult) => { result = next; } };
}

describe("managed lxeskill tool", () => {
  test("bind resolves a current attachment and calls fixed argv once", async () => {
    const f = fixture();
    const response = await f.registry.execute("managed_lxeskill", { command_id: bind.name, attachment_id: f.attachment.attachment_id }, f.context);
    expect(f.calls).toEqual([{ argv: ["synthetic", "single", "bind", "--source-path", realpathSync(f.attachment.path)], workspaceRoot: f.workspaceRoot, timeoutMs: 180_000 }]);
    expect(String(response.content[0]?.text)).toContain('"success":true');
    expect(response.files).toBeUndefined();
  });

  test("bind selects the sole current chat XLSX without a model-supplied attachment ID", async () => {
    const f = fixture();
    f.messages([
      { role: "user", message_id: "message-1", content: [{ type: "local_file", ...f.attachment }] },
      { role: "user", content: "Synthetic environment context", environmentContext: {} },
    ] as RuntimeMessage[]);
    await f.registry.execute("managed_lxeskill", { command_id: bind.name }, f.context);
    expect(f.calls).toEqual([{ argv: ["synthetic", "single", "bind", "--source-path", realpathSync(f.attachment.path)], workspaceRoot: f.workspaceRoot, timeoutMs: 180_000 }]);
  });

  test("bind selects a sole immediately previous XLSX after a continuation", async () => {
    const f = fixture();
    f.messages([
      { role: "user", message_id: "message-1", content: [{ type: "local_file", ...f.attachment }] },
      { role: "user", content: "Synthetic environment context", environmentContext: {} },
      { role: "user", message_id: "message-2", content: "继续处理这份表" },
      { role: "user", content: "Synthetic environment context", environmentContext: {} },
    ] as RuntimeMessage[]);
    await f.registry.execute("managed_lxeskill", { command_id: bind.name }, { ...f.context, turn_id: "turn-2" });
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0]?.argv).toEqual(["synthetic", "single", "bind", "--source-path", realpathSync(f.attachment.path)]);
  });

  test("automatic binding rejects multiple or older attachments before the CLI", async () => {
    const f = fixture();
    const block = { type: "local_file", ...f.attachment };
    f.messages([{ role: "user", message_id: "message-1", content: [block, { ...block, attachment_id: "other" }] }] as RuntimeMessage[]);
    await expect(f.registry.execute("managed_lxeskill", { command_id: bind.name }, f.context)).rejects.toThrow(/multiple attachments/);
    f.messages([
      { role: "user", message_id: "message-1", content: [block] },
      { role: "user", message_id: "message-2", content: "unrelated" },
      { role: "user", message_id: "message-3", content: "use old upload" },
    ] as RuntimeMessage[]);
    await expect(f.registry.execute("managed_lxeskill", { command_id: bind.name }, { ...f.context, turn_id: "turn-3" })).rejects.toThrow(/immediately previous/);
    expect(f.calls).toEqual([]);
  });

  test("generate accepts no attachment and reports one existing workspace XLSX", async () => {
    const f = fixture(); const artifactRoot = workspaceArtifactRoot(f.workspaceRoot);
    mkdirSync(artifactRoot, { recursive: true }); const output = join(artifactRoot, "result.xlsx"); writeFileSync(output, "synthetic");
    f.result(terminal("synthetic result run", { success: true, output_xlsx: output }, [output]));
    const response = await f.registry.execute("managed_lxeskill", { command_id: generate.name }, f.context);
    expect(f.calls).toEqual([{ argv: ["synthetic", "result", "run"], workspaceRoot: f.workspaceRoot, timeoutMs: 3_600_000 }]);
    expect(response.files).toBeUndefined();
    expect(String(response.content[0]?.text)).toContain(output);
  });

  test("a synthetic batch command passes exactly three host-verified XLSX paths and one deliverable", async () => {
    const f = fixture();
    const records = [f.attachment, ...[2, 3].map(index => {
      const path = join(f.root, `synthetic-${index}.xlsx`);
      writeFileSync(path, "synthetic");
      return { ...f.attachment, attachment_id: `attachment-${index}`, path, name: `synthetic-${index}.xlsx` };
    })];
    for (const record of records) f.addAttachment(record);
    f.messages([{ role: "user", message_id: "message-1", content: records.map(record => ({ type: "local_file", ...record })) }] as RuntimeMessage[]);
    const artifactRoot = workspaceArtifactRoot(f.workspaceRoot);
    mkdirSync(artifactRoot, { recursive: true });
    const output = join(artifactRoot, "batch.xlsx"); writeFileSync(output, "synthetic");
    f.result(terminal("synthetic batch run", { success: true, output_xlsx: output }, [output]));
    const response = await f.registry.execute("managed_lxeskill", { command_id: batch.name }, f.context);
    expect(f.calls).toEqual([{ argv: ["synthetic", "batch", "run", ...records.flatMap(record =>
      ["--source-files", realpathSync(record.path)])], workspaceRoot: f.workspaceRoot, timeoutMs: 180_000 }]);
    expect(String(response.content[0]?.text)).toContain(output);
    expect(response.files).toBeUndefined();
  });

  test("a synthetic batch command rejects incomplete or unverified upload sets before CLI", async () => {
    const f = fixture();
    const secondPath = join(f.root, "second.xlsx"); writeFileSync(secondPath, "synthetic");
    const second = { ...f.attachment, attachment_id: "attachment-2", path: secondPath, name: "second.xlsx" };
    f.addAttachment(second);
    f.messages([{ role: "user", message_id: "message-1", content: [f.attachment, second].map(record => ({ type: "local_file", ...record })) }] as RuntimeMessage[]);
    await expect(f.registry.execute("managed_lxeskill", { command_id: batch.name }, f.context)).rejects.toThrow(/exactly 3/);
    await expect(f.registry.execute("managed_lxeskill", { command_id: batch.name, attachment_id: f.attachment.attachment_id }, f.context))
      .rejects.toThrow(/complete attachment set/);
    expect(f.calls).toEqual([]);
  });

  test("a synthetic batch command rejects malformed, missing, and mixed-turn files before CLI", async () => {
    const f = fixture();
    const records = [f.attachment, ...[2, 3].map(index => {
      const path = join(f.root, `synthetic-${index}.xlsx`);
      writeFileSync(path, "synthetic");
      return { ...f.attachment, attachment_id: `attachment-${index}`, path, name: `synthetic-${index}.xlsx` };
    })];
    f.addAttachment(records[1]!);
    const content = records.map(record => ({ type: "local_file", ...record }));
    f.messages([{ role: "user", message_id: "message-1", content }] as RuntimeMessage[]);
    await expect(f.registry.execute("managed_lxeskill", { command_id: batch.name }, f.context))
      .rejects.toThrow(/not stored/);

    f.addAttachment(records[2]!);
    f.messages([{ role: "user", message_id: "message-1", content: [...content,
      { ...content[0]!, attachment_id: "" }] }] as RuntimeMessage[]);
    await expect(f.registry.execute("managed_lxeskill", { command_id: batch.name }, f.context))
      .rejects.toThrow(/malformed/);

    const mixed = records.map((record, index) => ({ ...record, turn_id: `earlier-${index}` }));
    f.messages([{ role: "user", message_id: "message-1", content: mixed.map(record => ({ type: "local_file", ...record })) },
      { role: "user", message_id: "message-2", content: "继续处理" }] as RuntimeMessage[]);
    await expect(f.registry.execute("managed_lxeskill", { command_id: batch.name },
      { ...f.context, turn_id: "turn-2" })).rejects.toThrow(/one prior upload turn/);
    expect(f.calls).toEqual([]);
  });

  test("read-only, unknown command, extra arguments and wrong platform never reach the runner", async () => {
    const f = fixture("read-only");
    await expect(f.registry.execute("managed_lxeskill", { command_id: bind.name, attachment_id: "attachment-1" }, f.context)).rejects.toThrow(/read-only/);
    f.context.executionPolicy = new PermissionPolicyService().resolve({ session_id: "session-1", workspace: f.context.workspace, permission_mode: "workspace-write" });
    await expect(f.registry.execute("managed_lxeskill", { command_id: "unregistered_command" }, f.context)).rejects.toThrow(/registered/);
    await expect(f.registry.execute("managed_lxeskill", { command_id: generate.name, argv: ["anything"] }, f.context)).rejects.toThrow(/unexpected/);
    await expect(f.registry.execute("managed_lxeskill", { command_id: bind.name, attachment_id: "missing" }, f.context)).rejects.toThrow(/attachment/);
    await expect(f.registry.execute("managed_lxeskill", { command_id: generate.name }, { ...f.context, platform: "feishu" })).rejects.toThrow(/platform/);
    expect(f.calls).toEqual([]);
  });

  test("failed CLI result keeps its diagnostic and never delivers files", async () => {
    const f = fixture();
    f.result({ ...terminal("synthetic result run", { success: false }, [join(f.root, "not-deliverable.xlsx")], false),
      error: { code: "SyntheticExecutionError", message: "Office exited with code 1" } });
    const response = await f.registry.execute("managed_lxeskill", { command_id: generate.name }, f.context);
    expect(String(response.content[0]?.text)).toContain("Office exited with code 1");
    expect(response.files).toBeUndefined(); expect(f.calls).toHaveLength(1);
  });

  test("rejects a successful output outside workspace and a missing output", async () => {
    const f = fixture(); const outside = join(f.root, "outside.xlsx"); writeFileSync(outside, "synthetic");
    f.result(terminal("synthetic result run", { success: true, output_xlsx: outside }, [outside]));
    await expect(f.registry.execute("managed_lxeskill", { command_id: generate.name }, f.context)).rejects.toThrow(/artifact/);
    const missing = join(workspaceArtifactRoot(f.workspaceRoot), "missing.xlsx");
    f.result(terminal("synthetic result run", { success: true, output_xlsx: missing }, [missing]));
    await expect(f.registry.execute("managed_lxeskill", { command_id: generate.name }, f.context)).rejects.toThrow(/artifact/);
  });

  test("reports output validation as a result failure with the observed filesystem error", async () => {
    const f = fixture();
    const missing = join(workspaceArtifactRoot(f.workspaceRoot), "missing.xlsx");
    f.result(terminal("synthetic result run", { success: true, output_xlsx: missing }, [missing]));
    const failure = await f.registry.execute("managed_lxeskill", { command_id: generate.name }, f.context)
      .then(() => { throw new Error("expected artifact validation to fail"); }, error => {
        if (!(error instanceof ToolExecutionError)) throw error;
        return error;
      });
    expect(failure).toBeInstanceOf(ToolExecutionError);
    expect(failure.code).toBe("unclassified");
    expect(failure.details).toMatchObject({ operation: "lstat", filesystem_code: "ENOENT" });
    expect(failure.modelContent()).toMatch(/lstat.*ENOENT/);
    expect(failure.modelContent()).not.toContain(missing);
  });

  test("does not blame model arguments for malformed successful CLI output", async () => {
    const f = fixture();
    f.result(terminal("synthetic result run", { success: true, output_xlsx: "missing.xlsx" }, []));
    await expect(f.registry.execute("managed_lxeskill", { command_id: generate.name }, f.context))
      .rejects.toMatchObject({ code: "unclassified" });
  });

  test("runner timeout and cancellation do not retry", async () => {
    const f = fixture();
    f.result(terminal("synthetic result run", { success: true }));
    const tool = createManagedLxeSkillTool({ commands: [generate], loadMessages: async () => [], resolveAttachment: async () => undefined,
      run: async () => { throw new Error("CLI timed out after 100ms"); } });
    await expect(tool.execute({ command_id: generate.name }, f.context)).rejects.toThrow("CLI timed out after 100ms");
    expect(f.calls).toEqual([]);
    f.controller.abort();
    await expect(f.registry.execute("managed_lxeskill", { command_id: generate.name }, f.context)).rejects.toThrow();
    expect(f.calls).toEqual([]);
  });
});
