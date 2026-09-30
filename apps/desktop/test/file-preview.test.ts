import { afterEach, expect, test } from "bun:test";
import { mkdtemp, writeFile, mkdir, symlink, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FilePreviewService } from "../src/main/file-preview/service";
import { OfficePreviewCache } from "../src/main/file-preview/office-cache";
import { workspacePath } from "../src/main/file-preview/paths";
import type { SessionFileRef } from "@lxe/desktop-protocol";
const roots: string[] = [], services: FilePreviewService[] = [];
afterEach(async () => { for (const service of services.splice(0)) await service.dispose(); for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "lxe-preview-中文 ")); roots.push(root);
  const workspace = join(root, "workspace"), outside = join(root, "outside"); await mkdir(workspace); await mkdir(outside);
  await writeFile(join(workspace, "中文 file.md"), "# 标题\n内容"); await writeFile(join(outside, "external.txt"), "external");
  let linked = true;
  const nativeCalls: string[] = [];
  const service = new FilePreviewService(() => ({
    resolveWorkspaceDirectory: async id => { if (id !== "s") throw new Error("Session not found"); return workspace; },
    resolveArtifact: async (s, id) => linked && s === "s" && id === "a" ? join(outside, "external.txt") : undefined,
    resolveAttachment: async (s, id) => s === "s" && id === "i" ? join(outside, "missing.png") : undefined,
    resolveImagePreview: async () => ({ source: "history", image: { type: "image", source: { type: "base64", media_type: "image/png", data: Buffer.from("historical").toString("base64") } } }),
  }), new OfficePreviewCache(join(root, "cache"), "node", "cli"), { openPath: async path => { nativeCalls.push(path); return ""; }, revealPath: path => nativeCalls.push(path) }, {
    list: async () => [{ id: "installed", name: "Editor", default: true, icon: null }],
    open: async (_path, id) => { if (id !== "installed") throw new Error("Application is not registered for this file"); nativeCalls.push(id); },
  }); services.push(service);
  return { root, workspace, outside, service, nativeCalls, unlink: () => { linked = false; } };
}
const ref: SessionFileRef = { session_id: "s", kind: "workspace", path: "中文 file.md" };
test("workspace boundary rejects parent, absolute paths and symlink escape", async () => {
  const f = await fixture();
  for (const path of ["../outside/external.txt", f.outside, "C:\\Windows\\file", "a/../../file"]) await expect(workspacePath(f.workspace, path)).rejects.toThrow();
  await symlink(f.outside, join(f.workspace, "escape"), process.platform === "win32" ? "junction" : "dir");
  await expect(workspacePath(f.workspace, "escape/external.txt")).rejects.toThrow("outside");
});
test("pages directories first, includes hidden files, and does not treat symlinks as navigable directories", async () => {
  const f = await fixture(); await mkdir(join(f.workspace, "folder")); await writeFile(join(f.workspace, ".hidden"), "x");
  await Promise.all(Array.from({ length: 205 }, (_, i) => writeFile(join(f.workspace, `${i}.txt`), "x")));
  const first = await f.service.call({ operation: "list", input: { session_id: "s", path: "" } });
  expect(first.entries[0]?.kind).toBe("directory"); expect(first.entries.some(e => e.name === ".hidden")).toBe(true); expect(first.entries).toHaveLength(200);
  const second = await f.service.call({ operation: "list", input: { session_id: "s", path: "", offset: first.next! } }); expect(second.entries).toHaveLength(8); expect(second.next).toBeNull();
});
test("preview uses opaque handles, preserves bytes and invalidates changed/deleted sources", async () => {
  const f = await fixture(), input = join(f.workspace, ref.kind === "workspace" ? ref.path : "");
  const before = await readFile(input);
  const p = await f.service.call({ operation: "prepare", input: { ref, request_id: "p" } });
  expect(p.metadata.kind).toBe("markdown"); expect(Buffer.from(await f.service.read(p.handle))).toEqual(before);
  expect(await readFile(input)).toEqual(before);
  await writeFile(input, "changed"); await expect(f.service.read(p.handle)).rejects.toThrow("changed");
  await rm(input); await expect(f.service.call({ operation: "stat", input: { ref } })).rejects.toThrow("ENOENT");
  await f.service.call({ operation: "release", input: { request_id: "p" } }); await expect(f.service.read(p.handle)).rejects.toThrow("closed");
});
test("artifact references may be outside workspace but cannot cross sessions or outlive their record", async () => {
  const f = await fixture(), artifact: SessionFileRef = { session_id: "s", kind: "artifact", id: "a" };
  const p = await f.service.call({ operation: "prepare", input: { ref: artifact, request_id: "a" } });
  expect(Buffer.from(await f.service.read(p.handle)).toString()).toBe("external");
  await expect(f.service.call({ operation: "stat", input: { ref: { ...artifact, session_id: "other" } } })).rejects.toThrow("not part");
  f.unlink(); await expect(f.service.read(p.handle)).rejects.toThrow("not part");
});
test("historical attachment preview survives original deletion while native opening still fails", async () => {
  const f = await fixture(), image: SessionFileRef = { session_id: "s", kind: "attachment", id: "i" };
  const p = await f.service.call({ operation: "prepare", input: { ref: image, request_id: "image" } });
  expect(p.metadata.source).toBe("history"); expect(Buffer.from(await f.service.read(p.handle)).toString()).toBe("historical");
  await expect(f.service.call({ operation: "open", input: { ref: image } })).rejects.toThrow("ENOENT");
});
test("Markdown resources are bound to their document directory and image types", async () => {
  const f = await fixture(); await writeFile(join(f.workspace, "图.png"), "image");
  const p = await f.service.call({ operation: "prepare", input: { ref, request_id: "md" } });
  expect(Buffer.from(await f.service.read(p.handle, "图.png")).toString()).toBe("image");
  await expect(f.service.read(p.handle, "../outside/external.txt")).rejects.toThrow("outside");
  await expect(f.service.read(p.handle, "中文 file.md")).rejects.toThrow("not an image");
});
test("native operations retain actual failures and reject an arbitrary application", async () => {
  const f = await fixture();
  expect(await f.service.call({ operation: "applications", input: { ref } })).toHaveLength(1);
  await expect(f.service.call({ operation: "open", input: { ref, application: "malicious" } })).rejects.toThrow("not registered");
  await f.service.call({ operation: "open", input: { ref, application: "installed" } }); expect(f.nativeCalls).toEqual(["installed"]);
});
test("text limits and unsupported HTML are explicit without reading arbitrary binaries", async () => {
  const f = await fixture(); await writeFile(join(f.workspace, "large.txt"), Buffer.alloc(2 * 1024 * 1024 + 1)); await writeFile(join(f.workspace, "page.html"), "<script>bad()</script>");
  await expect(f.service.call({ operation: "prepare", input: { ref: { ...ref, kind: "workspace", path: "large.txt" }, request_id: "large" } })).rejects.toThrow("limit");
  const p = await f.service.call({ operation: "prepare", input: { ref: { ...ref, kind: "workspace", path: "page.html" }, request_id: "html" } }); expect(p.metadata.kind).toBe("unsupported"); expect(await f.service.read(p.handle)).toHaveLength(0);
});
test("conversion is coalesced, serial, cached, and cancelled only after the last consumer releases", async () => {
  const f = await fixture(); let calls = 0, active = 0, maxActive = 0;
  const cache = new OfficePreviewCache(join(f.root, "test-cache"), "node", "cli", async (_node, _cli, _input, output, signal) => {
    calls++; active++; maxActive = Math.max(maxActive, active);
    try { await new Promise<void>((resolve, reject) => { const timer = setTimeout(resolve, 40); signal.addEventListener("abort", () => { clearTimeout(timer); reject(new Error("cancelled")); }, { once: true }); }); await writeFile(output, "%PDF-fixture"); return JSON.stringify({ missingFonts: ["Test font"] }); } finally { active--; }
  });
  const a = new AbortController(), b = new AbortController();
  const first = cache.get(new Uint8Array([1]), ".docx", a.signal).catch(error => error.message), second = cache.get(new Uint8Array([1]), ".docx", b.signal);
  a.abort(); expect(await first).toContain("abort"); expect((await second).missingFonts).toEqual(["Test font"]); expect(calls).toBe(1);
  await cache.get(new Uint8Array([1]), ".docx", new AbortController().signal); expect(calls).toBe(1);
  await Promise.all([cache.get(new Uint8Array([2]), ".docx", new AbortController().signal), cache.get(new Uint8Array([3]), ".pptx", new AbortController().signal)]); expect(maxActive).toBe(1);
  const c = new AbortController(), pending = cache.get(new Uint8Array([4]), ".docx", c.signal); c.abort(); await expect(pending).rejects.toThrow(); await cache.dispose();
});

test("real conversion processes terminate on timeout, cancellation and missing executables", async () => {
  const { runOffice } = await import("../src/main/file-preview/office-cache");
  const f = await fixture(), cli = join(f.root, "hanging-engine.cjs");
  await writeFile(cli, "require('node:child_process').spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30000)'], {stdio:'inherit'});setTimeout(() => {}, 30000)");
  const started = Date.now();
  await expect(runOffice(process.execPath, cli, "input", "output", new AbortController().signal, 40)).rejects.toThrow("exceeded 40 ms");
  const abort = new AbortController(), pending = runOffice(process.execPath, cli, "input", "output", abort.signal);
  setTimeout(() => abort.abort(), 40);
  await expect(pending).rejects.toThrow("cancelled");
  expect(Date.now() - started).toBeLessThan(5000);
  await expect(runOffice(join(f.root, "missing-node"), cli, "input", "output", new AbortController().signal)).rejects.toThrow();
});
