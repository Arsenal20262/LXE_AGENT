import { afterEach, expect, spyOn, test } from "bun:test";
import * as fs from "node:fs";
import { existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { JsonObject, PermissionMode } from "@lxe/protocol";
import { PermissionPolicyService } from "../../src/permissions/policy";
import { ModelImageProcessor } from "../../src/providers/model-image";
import { createFileTools } from "../../src/tooling/coding/file-tools";
import { FileVersionLedger } from "../../src/tooling/coding/file-version-ledger";
import { CodingPathPolicy } from "../../src/tooling/coding/path-policy";
import { ToolExecutionError, ToolRegistry, type ToolDefinition } from "../../src/tooling/registry";
import { workspaceFor } from "../workspace";

const roots: string[] = [];
const directoryLink = (target: string, path: string) => symlinkSync(target, path, process.platform === "win32" ? "junction" : "dir");
type Context = Parameters<ToolDefinition["execute"]>[1];
const edit = (path: string): JsonObject => ({ path, edits: [{ oldText: "before", newText: "after" }] });
const write = (path: string): JsonObject => ({ file_path: path, content: "after" });

function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "lxe-file-permissions-")));
  roots.push(root);
  const workspace = join(root, "repo", "work 中文 space"), dataRoot = join(root, "var");
  mkdirSync(workspace, { recursive: true });
  const service = new PermissionPolicyService({ dataRoot });
  const ledger = new FileVersionLedger();
  const registry = new ToolRegistry();
  for (const tool of createFileTools({ paths: new CodingPathPolicy({ homeDirectory: root }), ledger,
    imageProcessor: new ModelImageProcessor(), toolOutputLimit: 10_000 })) registry.register(tool);
  const context = (mode: PermissionMode = "workspace-write", sessionId = "first", controller = new AbortController()): Context => ({
    session_id: sessionId,
    workspace: workspaceFor(workspace, dirname(workspace)),
    executionPolicy: service.resolve({ session_id: sessionId, workspace: workspaceFor(workspace, dirname(workspace)), permission_mode: mode }),
    handle: { signal: controller.signal, cancelled: false, drainSteering: () => [], registerProcess: () => () => undefined },
  });
  // Restricted policies are tested only via internal definitions, never a product bypass.
  const execute = (name: string, input: JsonObject, ctx = context()) => registry.definition(name)!.execute(input, ctx);
  const read = (path: string, ctx = context()) => execute("read", { path }, ctx);
  return { root, workspace, dataRoot, ledger, registry, context, execute, read };
}

afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });

async function denied(operation: Promise<unknown>, mode: PermissionMode, target: string, reason?: string) {
  const cause = await operation.then(() => undefined, error => error);
  expect(cause).toBeInstanceOf(ToolExecutionError);
  expect(cause.code).toBe("permission_denied");
  expect(cause.message).toContain(mode);
  expect(cause.message).toContain(target);
  if (reason) expect(cause.message).toContain(reason);
}

test.each(["read-only", "workspace-write", "danger-full-access"] as const)("%s create, overwrite and edit follow policy", async mode => {
  const f = fixture(), ctx = f.context(mode), target = join(f.workspace, "new", "file.txt");
  if (mode === "read-only") {
    await denied(f.execute("write", write(target), ctx), mode, target);
    await denied(f.execute("edit", edit(target), ctx), mode, target);
    expect(existsSync(dirname(target))).toBe(false);
    writeFileSync(join(f.workspace, "existing"), "before");
    await f.read("existing", ctx);
    for (const [tool, input] of [["write", write("existing")], ["edit", edit("existing")]] as const) {
      await denied(f.execute(tool, input, ctx), mode, join(f.workspace, "existing"));
      expect(readFileSync(join(f.workspace, "existing"), "utf8")).toBe("before");
    }
  } else {
    await f.execute("write", { file_path: target, content: "before" }, ctx);
    await f.execute("edit", edit(target), ctx); // Successful write records this session's version.
    expect(readFileSync(target, "utf8")).toBe("after");
    await f.execute("write", { file_path: target, content: "overwritten" }, ctx);
    expect(readFileSync(target, "utf8")).toBe("overwritten");
  }
});

test("workspace and own temporary roots allow writes; sibling, traversal, home, private and host output do not", async () => {
  const f = fixture(), ctx = f.context(), other = f.context("workspace-write", "other");
  for (const target of [join(f.workspace, "nested", "..", "allowed"), join(ctx.executionPolicy.temporaryDirectory, "nested", "allowed")]) {
    await f.execute("write", write(target), ctx);
    expect(readFileSync(target, "utf8")).toBe("after");
  }
  for (const target of [join(f.workspace + "-sibling", "new", "file"), "../new/file", "~/new/file",
    join(other.executionPolicy.temporaryDirectory, "new", "file"), join(ctx.executionPolicy.outputDirectory, "new", "file"),
    join(f.dataRoot, "db", "new", "file")]) {
    await denied(f.execute("write", write(target), ctx), "workspace-write", "target=", "outside");
  }
  for (const parent of [f.workspace + "-sibling", join(dirname(f.workspace), "new"), join(f.root, "new"),
    other.executionPolicy.temporaryDirectory, ctx.executionPolicy.outputDirectory, join(f.dataRoot, "db")]) {
    expect(existsSync(parent)).toBe(false);
  }
  const outside = join(f.root, "outside");
  writeFileSync(outside, "before");
  await f.read(outside, ctx);
  for (const [tool, input] of [["write", write(outside)], ["edit", edit(outside)]] as const) {
    await denied(f.execute(tool, input, ctx), "workspace-write", outside);
    expect(readFileSync(outside, "utf8")).toBe("before");
  }
});

test.each(["write", "edit"] as const)("%s preserves full access outside the workspace, including tilde paths", async tool => {
  const f = fixture(), ctx = f.context("danger-full-access"), path = join(f.root, "outside");
  writeFileSync(path, "before");
  await f.read("~/outside", ctx);
  await f.execute(tool, tool === "write" ? write("~/outside") : edit("~/outside"), ctx);
  expect(readFileSync(path, "utf8")).toBe("after");
});

test("allowed directory symlinks/junctions support new files and the original read spelling", async () => {
  const f = fixture(), actual = join(f.workspace, "actual"), alias = join(f.workspace, "alias");
  mkdirSync(actual);
  directoryLink(actual, alias);
  await f.execute("write", { file_path: join(alias, "new", "file"), content: "before" });
  await f.execute("edit", edit(join(alias, "new", "file")));
  const path = join(actual, "existing");
  writeFileSync(path, "before");
  await f.read(join(alias, "existing"));
  await f.execute("edit", edit(join(alias, "existing")));
  await f.execute("write", write(join(alias, "existing")));
  expect(readFileSync(path, "utf8")).toBe("after");
  expect(readFileSync(join(actual, "new", "file"), "utf8")).toBe("after");
});

test.each(["write", "edit"] as const)("%s rejects outside directory symlinks/junctions and leaves existing files unchanged", async tool => {
  const f = fixture(), outside = join(f.root, "outside"), alias = join(f.workspace, "alias");
  mkdirSync(outside);
  writeFileSync(join(outside, "file"), "before");
  directoryLink(outside, alias);
  await f.read(join(alias, "file"));
  const target = join(alias, "file");
  await denied(f.execute(tool, tool === "write" ? write(target) : edit(target)), "workspace-write", target);
  expect(readFileSync(join(outside, "file"), "utf8")).toBe("before");
  await denied(f.execute("write", write(join(alias, "new", "file"))), "workspace-write", "target=");
  expect(existsSync(join(outside, "new"))).toBe(false);
});

test("file symlinks and dangling targets are resolved before mutation", async () => {
  const f = fixture(), target = join(f.workspace, "missing", "target"), alias = join(f.workspace, "file-link");
  symlinkSync(target, alias, "file");
  await f.execute("write", { file_path: alias, content: "before" });
  await f.read(alias);
  await f.execute("edit", edit(alias));
  expect(readFileSync(target, "utf8")).toBe("after");
  const outside = join(f.root, "missing", "outside"), escape = join(f.workspace, "escape");
  symlinkSync(outside, escape, "file");
  await denied(f.execute("write", write(escape)), "workspace-write", escape);
  expect(existsSync(dirname(outside))).toBe(false);
});

test.each(["write", "edit"] as const)("%s rejects actual hard links in restricted mode and retains full access behavior", async tool => {
  const f = fixture(), target = join(f.workspace, "file"), outside = join(f.root, "linked");
  writeFileSync(target, "before");
  linkSync(target, outside);
  expect(statSync(target).nlink).toBe(2);
  await f.read(target);
  const input = tool === "write" ? write(target) : edit(target);
  await denied(f.execute(tool, input), "workspace-write", target, "hard links");
  expect(readFileSync(target, "utf8")).toBe("before");
  expect(readFileSync(outside, "utf8")).toBe("before");
  await f.execute(tool, input, f.context("danger-full-access"));
  expect(readFileSync(target, "utf8")).toBe("after");
  expect(readFileSync(outside, "utf8")).toBe("after");
});

test("hard links entirely inside the workspace are also refused", async () => {
  const f = fixture(), target = join(f.workspace, "one"), other = join(f.workspace, "two");
  writeFileSync(target, "before"); linkSync(target, other);
  await f.read(target);
  await denied(f.execute("write", write(target)), "workspace-write", target, "hard links");
  expect(readFileSync(other, "utf8")).toBe("before");
});

test.each(["write", "edit"] as const)("%s requires a session read, and rejects changed versions and symlink targets", async tool => {
  const f = fixture(), a = join(f.workspace, "a"), b = join(f.workspace, "b"), alias = join(f.workspace, "link");
  mkdirSync(a); mkdirSync(b);
  writeFileSync(join(a, "file"), "before"); writeFileSync(join(b, "file"), "before");
  directoryLink(a, alias);
  const path = join(alias, "file"), input = tool === "write" ? write(path) : edit(path);
  await expect(f.execute(tool, input)).rejects.toThrow("先用 read");
  await f.read(path);
  await expect(f.execute(tool, input, f.context("workspace-write", "other"))).rejects.toThrow("先用 read");
  writeFileSync(join(a, "file"), "external changed");
  await expect(f.execute(tool, input)).rejects.toThrow("重新 read");
  writeFileSync(join(a, "file"), "before");
  await f.read(path);
  unlinkSync(alias); directoryLink(b, alias);
  await expect(f.execute(tool, input)).rejects.toThrow("重新 read");
  expect(readFileSync(join(a, "file"), "utf8")).toBe("before");
  expect(readFileSync(join(b, "file"), "utf8")).toBe("before");
});

test.each(["write", "edit"] as const)("%s rechecks links, versions and cancellation immediately before mutation", async tool => {
  // Simulate external changes after the first ledger check, without adding an async gap to production code.
  for (const change of ["hardlink", "version", "target", "cancel"] as const) {
    const f = fixture(), controller = new AbortController(), ctx = f.context("workspace-write", "first", controller);
    const a = join(f.workspace, "a"), b = join(f.workspace, "b"), alias = join(f.workspace, "alias");
    mkdirSync(a); mkdirSync(b);
    writeFileSync(join(a, "file"), "before"); writeFileSync(join(b, "file"), "before");
    directoryLink(a, alias);
    const path = join(alias, "file");
    await f.read(path, ctx);
    const original = f.ledger.assertVersion.bind(f.ledger);
    const hook = spyOn(f.ledger, "assertVersion").mockImplementationOnce((...args) => {
      original(...args);
      if (change === "hardlink") linkSync(join(a, "file"), join(f.root, "linked"));
      if (change === "version") writeFileSync(join(a, "file"), "before external change");
      if (change === "target") { unlinkSync(alias); directoryLink(b, alias); }
      if (change === "cancel") controller.abort(new Error("cancel fixture"));
    });
    try {
      const operation = f.execute(tool, tool === "write" ? write(path) : edit(path), ctx);
      if (change === "hardlink" || change === "target") await denied(operation, "workspace-write", path, change === "hardlink" ? "hard links" : "target changed");
      else await expect(operation).rejects.toThrow(change === "cancel" ? "cancel fixture" : "重新 read");
      expect(readFileSync(join(a, "file"), "utf8")).toBe(change === "version" ? "before external change" : "before");
      expect(readFileSync(join(b, "file"), "utf8")).toBe("before");
    } finally { hook.mockRestore(); }
  }
});

test("already cancelled calls create no directories or edits", async () => {
  const f = fixture(), controller = new AbortController(), ctx = f.context("workspace-write", "first", controller);
  writeFileSync(join(f.workspace, "file"), "before");
  await f.read("file", ctx);
  controller.abort(new Error("cancel fixture"));
  await expect(f.execute("write", write("missing/file"), ctx)).rejects.toThrow("cancel fixture");
  await expect(f.execute("edit", edit("file"), ctx)).rejects.toThrow("cancel fixture");
  expect(existsSync(join(f.workspace, "missing"))).toBe(false);
  expect(readFileSync(join(f.workspace, "file"), "utf8")).toBe("before");
});

test("boundary diagnostics, changed roots and inconsistent grants fail before mkdir", async () => {
  const f = fixture(), ctx = f.context(), original = ctx.executionPolicy;
  for (const policy of [
    { ...original, writeAccess: { kind: "roots" as const, roots: [f.root, original.temporaryDirectory] } },
    { ...original, privatePaths: [f.workspace] },
    new PermissionPolicyService({ dataRoot: f.dataRoot }).resolve({ session_id: "first", workspace: workspaceFor(f.root), permission_mode: "workspace-write" }),
  ]) {
    await denied(f.execute("write", write("missing/file"), { ...ctx, executionPolicy: policy }), "workspace-write", "target=");
    expect(existsSync(join(f.workspace, "missing"))).toBe(false);
  }
  directoryLink(f.root, join(f.workspace, ".lxeagent"));
  await denied(f.execute("write", write("missing/file"), ctx), "workspace-write", "target=", "path changed");
  expect(existsSync(join(f.workspace, "missing"))).toBe(false);
});

test("missing edit and invalid parent preserve filesystem and path resolution errors", async () => {
  const f = fixture();
  await expect(f.execute("edit", edit("missing"))).rejects.toMatchObject({ code: "ENOENT" });
  writeFileSync(join(f.workspace, "parent"), "before");
  await expect(f.execute("write", write("parent/child"))).rejects.toThrow(`Path parent is not a directory: ${join(f.workspace, "parent")}`);
  expect(readFileSync(join(f.workspace, "parent"), "utf8")).toBe("before");
});

test("write refuses a file that appears after the initial missing-file check", async () => {
  const f = fixture(), target = join(f.workspace, "file");
  const input: JsonObject = { file_path: target, get content() { writeFileSync(target, "external"); return "after"; } };
  await expect(f.execute("write", input)).rejects.toThrow("重新 read");
  expect(readFileSync(target, "utf8")).toBe("external");
});

test("write refuses to recreate a file removed after the first observation", async () => {
  const f = fixture(), target = join(f.workspace, "file");
  writeFileSync(target, "before");
  await f.read(target);
  const input: JsonObject = { file_path: target, get content() { unlinkSync(target); return "after"; } };
  await expect(f.execute("write", input)).rejects.toThrow("重新 read");
  expect(existsSync(target)).toBe(false);
});

test("edit refuses to recreate a file removed after reading its edit source", async () => {
  const f = fixture(), target = join(f.workspace, "file");
  writeFileSync(target, "before");
  await f.read(target);
  const readSource = fs.readFileSync;
  const readThenRemove = ((...args: Parameters<typeof fs.readFileSync>) => {
    const content = readSource(...args);
    unlinkSync(target);
    return content;
  }) as typeof fs.readFileSync;
  const hook = spyOn(fs, "readFileSync").mockImplementationOnce(readThenRemove);
  try {
    await expect(f.execute("edit", edit(target))).rejects.toThrow("重新 read");
    expect(existsSync(target)).toBe(false);
  } finally { hook.mockRestore(); }
});

test("simultaneous sessions use their own workspace, temp and version ledger", async () => {
  const a = fixture(), b = fixture();
  // Share the tool instances, as the runtime does.
  await Promise.all([a.execute("write", write("own"), a.context()), a.execute("write", write("own"), b.context("workspace-write", "second"))]);
  expect(readFileSync(join(a.workspace, "own"), "utf8")).toBe("after");
  expect(readFileSync(join(b.workspace, "own"), "utf8")).toBe("after");
  await denied(a.execute("write", write(join(a.workspace, "escape")), b.context()), "workspace-write", "target=");
  expect(existsSync(join(a.workspace, "escape"))).toBe(false);
});

test.each(["read-only", "workspace-write"] as const)("registry still blocks %s product sessions even for reads", async mode => {
  const f = fixture(), ctx = f.context(mode);
  writeFileSync(join(f.workspace, "file"), "before");
  for (const [tool, input] of [["write", write("missing/file")], ["edit", edit("file")], ["read", { path: "file" }]] as const) {
    await expect(f.registry.execute(tool, input, ctx)).rejects.toThrow("backends are not implemented");
  }
  expect(existsSync(join(f.workspace, "missing"))).toBe(false);
  expect(readFileSync(join(f.workspace, "file"), "utf8")).toBe("before");
});

test.skipIf(process.platform !== "win32")("Windows casing and mixed separators use the same real target and ledger key", async () => {
  const f = fixture(), actual = join(f.workspace, "mixed.txt"), input = actual.toUpperCase().replaceAll("\\", "/");
  writeFileSync(actual, "before");
  await f.read(input);
  await f.execute("edit", edit(input));
  expect(readFileSync(actual, "utf8")).toBe("after");
});
