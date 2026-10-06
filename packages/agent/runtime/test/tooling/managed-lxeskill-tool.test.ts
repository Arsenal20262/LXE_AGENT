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
import { ToolRegistry } from "../../src/tooling/registry";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const owner = "vietnam-stock-recommendation";
const bind: LxeSkillCommandDefinition = { name: "vietnam_replenishment_bind_sku", command: "lxeskill vietnam sku bind", visibility: "business", ownerSkills: [owner], managedExecution: { attachmentArgument: "source_path" }, timeoutMs: 180_000 };
const generate: LxeSkillCommandDefinition = { name: "vietnam_replenishment_generate", command: "lxeskill vietnam stock recommend", visibility: "business", ownerSkills: [owner], managedExecution: {}, timeoutMs: 3_600_000, artifactPaths: [{ field: "output_xlsx", role: "deliverable" }] };
const terminal = (command: string, data: JsonObject, files: string[] = [], ok = true): CliTerminalResult => ({ protocol_version: "1", type: "result", command, ok, data, files });

function fixture(mode: PermissionMode = "workspace-write") {
  const root = mkdtempSync(join(tmpdir(), "lxe-managed-tool-")); roots.push(root);
  const workspaceRoot = join(root, "workspace"); mkdirSync(workspaceRoot);
  const source = join(root, "synthetic.xlsx"); writeFileSync(source, "synthetic");
  const attachment: RuntimeAttachmentRecord = { attachment_id: "attachment-1", turn_id: "turn-1", path: source, name: "synthetic.xlsx", size_bytes: 9, media_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ts: 1 };
  let messages: RuntimeMessage[] = [{ role: "user", message_id: "message-1", content: [{ type: "local_file", ...attachment }] }];
  const calls: Array<{ argv: string[]; workspaceRoot: string; timeoutMs: number }> = [];
  let result: CliTerminalResult = terminal("vietnam sku bind", { success: true });
  const registry = new ToolRegistry();
  registry.register(createManagedLxeSkillTool({ commands: [bind, generate],
    loadMessages: async () => messages,
    resolveAttachment: async (_session, id) => id === attachment.attachment_id ? attachment : undefined,
    run: async (_entry, argv, workspaceRoot, _signal, timeoutMs) => { calls.push({ argv, workspaceRoot, timeoutMs }); return result; },
  }));
  const workspace = { directory: workspaceRoot, worktree: workspaceRoot };
  const controller = new AbortController();
  const context = { session_id: "session-1", turn_id: "turn-1", platform: "desktop", workspace,
    executionPolicy: new PermissionPolicyService().resolve({ session_id: "session-1", workspace, permission_mode: mode }),
    handle: { signal: controller.signal, cancelled: false, drainSteering: () => [], registerProcess: () => () => {} }, skill_names: [owner] };
  return { root, workspaceRoot, attachment, calls, registry, context, controller,
    messages: (next: RuntimeMessage[]) => { messages = next; }, result: (next: CliTerminalResult) => { result = next; } };
}

describe("managed lxeskill tool", () => {
  test("bind resolves a current attachment and calls fixed argv once", async () => {
    const f = fixture();
    const response = await f.registry.execute("managed_lxeskill", { command_id: bind.name, attachment_id: f.attachment.attachment_id }, f.context);
    expect(f.calls).toEqual([{ argv: ["vietnam", "sku", "bind", "--source-path", realpathSync(f.attachment.path)], workspaceRoot: f.workspaceRoot, timeoutMs: 180_000 }]);
    expect(String(response.content[0]?.text)).toContain('"success":true');
    expect(response.files).toBeUndefined();
  });

  test("generate accepts no attachment and reports one existing workspace XLSX", async () => {
    const f = fixture(); const artifactRoot = workspaceArtifactRoot(f.workspaceRoot);
    mkdirSync(artifactRoot, { recursive: true }); const output = join(artifactRoot, "recommendation.xlsx"); writeFileSync(output, "synthetic");
    f.result(terminal("vietnam stock recommend", { success: true, output_xlsx: output }, [output]));
    const response = await f.registry.execute("managed_lxeskill", { command_id: generate.name }, f.context);
    expect(f.calls).toEqual([{ argv: ["vietnam", "stock", "recommend"], workspaceRoot: f.workspaceRoot, timeoutMs: 3_600_000 }]);
    expect(response.files).toBeUndefined();
    expect(String(response.content[0]?.text)).toContain(output);
  });

  test("read-only, unknown command, extra arguments and wrong platform never reach the runner", async () => {
    const f = fixture("read-only");
    await expect(f.registry.execute("managed_lxeskill", { command_id: bind.name, attachment_id: "attachment-1" }, f.context)).rejects.toThrow(/read-only/);
    f.context.executionPolicy = new PermissionPolicyService().resolve({ session_id: "session-1", workspace: f.context.workspace, permission_mode: "workspace-write" });
    await expect(f.registry.execute("managed_lxeskill", { command_id: "yacang_export_run" }, f.context)).rejects.toThrow(/registered/);
    await expect(f.registry.execute("managed_lxeskill", { command_id: generate.name, argv: ["anything"] }, f.context)).rejects.toThrow(/unexpected/);
    await expect(f.registry.execute("managed_lxeskill", { command_id: bind.name, attachment_id: "missing" }, f.context)).rejects.toThrow(/attachment/);
    await expect(f.registry.execute("managed_lxeskill", { command_id: generate.name }, { ...f.context, platform: "feishu" })).rejects.toThrow(/platform/);
    expect(f.calls).toEqual([]);
  });

  test("failed CLI result keeps its diagnostic and never delivers files", async () => {
    const f = fixture(); f.result({ ...terminal("vietnam stock recommend", { success: false }, ["/tmp/not-deliverable.xlsx"], false), error: { code: "WorkbookGenerationError", message: "Office exited with code 1" } });
    const response = await f.registry.execute("managed_lxeskill", { command_id: generate.name }, f.context);
    expect(String(response.content[0]?.text)).toContain("Office exited with code 1");
    expect(response.files).toBeUndefined(); expect(f.calls).toHaveLength(1);
  });

  test("rejects a successful output outside workspace and a missing output", async () => {
    const f = fixture(); const outside = join(f.root, "outside.xlsx"); writeFileSync(outside, "synthetic");
    f.result(terminal("vietnam stock recommend", { success: true, output_xlsx: outside }, [outside]));
    await expect(f.registry.execute("managed_lxeskill", { command_id: generate.name }, f.context)).rejects.toThrow(/artifact/);
    const missing = join(workspaceArtifactRoot(f.workspaceRoot), "missing.xlsx");
    f.result(terminal("vietnam stock recommend", { success: true, output_xlsx: missing }, [missing]));
    await expect(f.registry.execute("managed_lxeskill", { command_id: generate.name }, f.context)).rejects.toThrow(/artifact/);
  });

  test("runner timeout and cancellation do not retry", async () => {
    const f = fixture();
    f.result(terminal("vietnam stock recommend", { success: true }));
    const tool = createManagedLxeSkillTool({ commands: [generate], loadMessages: async () => [], resolveAttachment: async () => undefined,
      run: async () => { throw new Error("CLI timed out after 100ms"); } });
    await expect(tool.execute({ command_id: generate.name }, f.context)).rejects.toThrow("CLI timed out after 100ms");
    expect(f.calls).toEqual([]);
    f.controller.abort();
    await expect(f.registry.execute("managed_lxeskill", { command_id: generate.name }, f.context)).rejects.toThrow();
    expect(f.calls).toEqual([]);
  });
});
