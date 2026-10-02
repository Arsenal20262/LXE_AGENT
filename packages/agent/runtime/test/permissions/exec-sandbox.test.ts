import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PermissionMode } from "@lxe/protocol";
import { PermissionPolicyService, assertPermissionExecutionAvailable } from "../../src/permissions/policy";
import { ExecSandbox, assertExecSandboxBoundaries, seatbeltProfile } from "../../src/permissions/exec-sandbox";
import { CodingProcessManager } from "../../src/tooling/coding/process-manager";
import { ExecShellAdapter } from "../../src/tooling/exec-shell";
import { workspaceFor } from "../workspace";

const roots: string[] = [];
const managers: CodingProcessManager[] = [];
function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "lxe-exec-sandbox-")));
  roots.push(root);
  const workspace = join(root, "work 中文 space");
  mkdirSync(workspace);
  const service = new PermissionPolicyService({ dataRoot: join(root, "var") });
  const policy = (mode: PermissionMode, id = "first") => service.resolve({
    session_id: id, workspace: workspaceFor(workspace, root), permission_mode: mode,
  });
  return { root, workspace, policy };
}

afterEach(async () => {
  for (const manager of managers.splice(0)) await manager.stop();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

test("full access bypasses every platform backend; restricted sessions remain unavailable", () => {
  const { policy } = fixture();
  const command = { argv: ["program", "an argument"], detached: false };
  const backend = new ExecSandbox({ platform: "linux", environment: {} });
  expect(backend.prepare(policy("danger-full-access"), command)).toMatchObject({ ...command, sandbox: { backend: "none" } });
  expect(() => backend.prepare(policy("workspace-write"), command)).toThrow("not implemented on linux");
  for (const mode of ["read-only", "workspace-write"] as const) {
    expect(() => assertPermissionExecutionAvailable(policy(mode))).toThrow("backends are not implemented");
  }
});

test("Seatbelt only grants fixed workspace and session temp, with safely quoted paths", () => {
  const { policy } = fixture();
  const p = policy("workspace-write");
  expect(seatbeltProfile(p)).toContain('(deny file-write*)');
  expect(seatbeltProfile(p)).toContain(`(subpath ${JSON.stringify(p.workspaceRoot)})`);
  expect(seatbeltProfile(p)).toContain(`(subpath ${JSON.stringify(p.temporaryDirectory)})`);
  expect(seatbeltProfile(p)).not.toContain('(subpath "/tmp")');
  expect(seatbeltProfile(policy("read-only"))).not.toContain("subpath");
  expect(seatbeltProfile({ ...p, workspaceRoot: '/space/"quote\\line\n' })).toContain(JSON.stringify('/space/"quote\\line\n'));
});

test("unavailable Windows helper fails before launching any command", () => {
  const { policy } = fixture();
  expect(() => new ExecSandbox({ platform: "win32", environment: {} }).prepare(policy("workspace-write"), { argv: ["cmd"], detached: false }))
    .toThrow("Windows ACL sandbox launcher is unavailable");
});

test("reject diagnostics, forged write roots and symlink replacements before spawn", () => {
  const { root, workspace, policy } = fixture();
  const p = policy("workspace-write");
  expect(() => assertExecSandboxBoundaries({ ...p, writeAccess: { kind: "roots", roots: [root, p.temporaryDirectory] } })).toThrow("write roots");
  const overlap = new PermissionPolicyService({ dataRoot: join(workspace, "var") })
    .resolve({ session_id: "s", workspace: workspaceFor(workspace), permission_mode: "workspace-write" });
  expect(() => assertExecSandboxBoundaries(overlap)).toThrow("boundary conflict");
  mkdirSync(join(root, "elsewhere"));
  symlinkSync(join(root, "elsewhere"), join(workspace, ".lxeagent"), process.platform === "win32" ? "junction" : "dir");
  expect(() => assertExecSandboxBoundaries(p)).toThrow("path changed");
});

const native = process.platform === "darwin" || (process.platform === "win32" && process.env.LXE_EXEC_SANDBOX_NATIVE_TEST === "1");
const nativeTest = native ? test : test.skip;
const quote = (text: string) => process.platform === "win32" ? `'${text.replaceAll("'", "''")}'` : `'${text.replaceAll("'", `'"'"'`)}'`;
const node = process.env.LXE_EXEC_SANDBOX_NODE || Bun.which("node") || "";
const invokeNode = (script: string) => `${process.platform === "win32" ? "& " : ""}${quote(node)} ${quote(script)}`;

function manager() {
  const value = new CodingProcessManager({ maxOutputBytes: 100_000, tailBytes: 2_000, shell: new ExecShellAdapter() });
  managers.push(value);
  return value;
}

function execute(m: CodingProcessManager, p: ReturnType<ReturnType<typeof fixture>["policy"]>, command: string, cwd = p.workspaceRoot, yieldMs = 10_000) {
  return m.execute({ executionPolicy: p, workspace: workspaceFor(p.workspaceRoot), command, cwd, sessionId: p.temporaryDirectory,
    responseRouteId: "test", toolCallId: "test", turnId: "test", yieldMs, signal: new AbortController().signal });
}

nativeTest.each(["read-only", "workspace-write"] as const)("native %s enforces writes through PowerShell/sh and Node", async mode => {
  const { root, workspace, policy } = fixture();
  const outside = join(root, "outside.txt");
  writeFileSync(outside, "original");
  const script = join(workspace, "probe.cjs");
  writeFileSync(script, `const fs = require('node:fs'), path = require('node:path');
    const targets = { workspace: path.join(${JSON.stringify(workspace)}, 'written'), temporary: path.join(process.env.TMPDIR, 'written'), outside: ${JSON.stringify(outside)} };
    const result = { read: fs.readFileSync(targets.outside, 'utf8'), cwd: process.cwd(), tmp: process.env.TMPDIR, errors: {} };
    for (const [key, target] of Object.entries(targets)) { try { fs.writeFileSync(target, 'changed'); result[key] = true; } catch (e) { result[key] = false; result.errors[key] = e.message; } }
    fs.writeSync(1, JSON.stringify(result)); fs.writeSync(2, 'real-stderr');`);
  const result = await execute(manager(), policy(mode), invokeNode(script), root);
  expect(result.status, JSON.stringify(result)).toBe("completed");
  expect(result.exit_code).toBe(0);
  const output = String(result.output);
  expect(output).toContain('"read":"original"');
  expect(output).toContain(`"workspace":${mode === "workspace-write"}`);
  expect(output).toContain(`"temporary":${mode === "workspace-write"}`);
  expect(output).toContain('"outside":false');
  expect(output).toContain("real-stderr");
  expect(readFileSync(outside, "utf8")).toBe("original");
  expect(result.sandbox).toMatchObject({ mode, backend: process.platform === "win32" ? "windows-acl" : "seatbelt" });
}, 30_000);

nativeTest("native sandbox blocks junction/symlink targets outside the workspace", async () => {
  const { root, workspace, policy } = fixture();
  const outside = join(root, "outside"); mkdirSync(outside);
  writeFileSync(join(outside, "file"), "original");
  symlinkSync(outside, join(workspace, "link"), process.platform === "win32" ? "junction" : "dir");
  const script = join(workspace, "link.cjs");
  writeFileSync(script, `console.log('before-link-write'); require('node:fs').writeFileSync(${JSON.stringify(join(workspace, "link", "file"))}, 'escaped')`);
  const result = await execute(manager(), policy("workspace-write"), invokeNode(script));
  expect(result.status).toBe("failed");
  expect(String(result.output)).toContain("before-link-write");
  expect(readFileSync(join(outside, "file"), "utf8")).toBe("original");
}, 30_000);

nativeTest("simultaneous workspaces use their own policies and cannot write each other's files", async () => {
  const a = fixture(), b = fixture();
  const script = join(a.root, "parallel.cjs");
  writeFileSync(script, `const fs=require('node:fs'); const own=process.env.LXE_WORKSPACE_ROOT; fs.writeFileSync(require('node:path').join(own, 'own'), 'ok');
    const other=own===${JSON.stringify(a.workspace)}?${JSON.stringify(b.workspace)}:${JSON.stringify(a.workspace)};
    try { fs.writeFileSync(require('node:path').join(other, 'escaped'), 'bad'); process.exit(20); } catch(e) { console.log(e.code); }`);
  const m = manager();
  const results = await Promise.all([a,b].map(f => execute(m, f.policy("workspace-write"), invokeNode(script))));
  for (const r of results) expect(r.status).toBe("completed");
  for (const f of [a,b]) { expect(existsSync(join(f.workspace, "own"))).toBe(true); expect(existsSync(join(f.workspace, "escaped"))).toBe(false); }
}, 30_000);

nativeTest("wait preserves output and cancellation kills a running descendant", async () => {
  const { workspace, policy } = fixture();
  const script = join(workspace, "parent.cjs"), child = join(workspace, "child.cjs");
  const heartbeat = join(workspace, "heartbeat");
  writeFileSync(child, `setInterval(()=>require('node:fs').writeFileSync(${JSON.stringify(heartbeat)}, String(Date.now())), 50);`);
  writeFileSync(script, `require('node:child_process').spawn(process.execPath, [${JSON.stringify(child)}], {stdio:'inherit'}); console.log('started'); setInterval(()=>{},1000);`);
  const p = policy("workspace-write"), m = manager();
  const first = await execute(m, p, invokeNode(script), workspace, 250);
  expect(first.status).toBe("running");
  const deadline = Date.now() + 15_000;
  while (!existsSync(heartbeat) && Date.now() < deadline) await Bun.sleep(50);
  expect(existsSync(heartbeat)).toBe(true);
  const stopped = await m.wait({ execId: String(first.exec_id), sessionId: p.temporaryDirectory, yieldMs: 1_000, terminate: true, signal: new AbortController().signal });
  expect(stopped.status).toBe("killed");
  const after = readFileSync(heartbeat, "utf8");
  await Bun.sleep(250);
  expect(readFileSync(heartbeat, "utf8")).toBe(after);
}, 30_000);

nativeTest("standing workspace grants do not authorize a later read-only command; full access still works", async () => {
  const { root, workspace, policy } = fixture();
  const outside = join(root, "outside"), inside = join(workspace, "inside");
  writeFileSync(outside, "keep");
  const script = join(workspace, "modes.cjs");
  writeFileSync(script, `const fs=require('node:fs'); console.log('entered'); fs.writeFileSync(${JSON.stringify(inside)}, 'inside'); fs.writeFileSync(${JSON.stringify(outside)}, 'outside');`);
  const m = manager();
  const write = await execute(m, policy("workspace-write"), invokeNode(script));
  expect(String(write.output)).toContain("entered");
  expect(write.status).toBe("failed");
  expect(readFileSync(inside, "utf8")).toBe("inside");
  expect(readFileSync(outside, "utf8")).toBe("keep");
  writeFileSync(inside, "readonly-marker");
  const read = await execute(m, policy("read-only"), invokeNode(script));
  expect(String(read.output)).toContain("entered");
  expect(read.status).toBe("failed");
  expect(readFileSync(inside, "utf8")).toBe("readonly-marker");
  const full = await execute(m, policy("danger-full-access"), invokeNode(script));
  expect(full.status, JSON.stringify(full)).toBe("completed");
  expect(readFileSync(outside, "utf8")).toBe("outside");
}, 30_000);

nativeTest("native policy prevents deleting and renaming outside files, and host output can still spill", async () => {
  const { root, workspace, policy } = fixture();
  const outside = join(root, "outside"); writeFileSync(outside, "keep");
  const script = join(workspace, "mutations.cjs");
  writeFileSync(script, `const fs=require('node:fs');
    for(const [name, fn] of [['delete',()=>fs.unlinkSync(${JSON.stringify(outside)})], ['rename',()=>fs.renameSync(${JSON.stringify(outside)}, ${JSON.stringify(join(workspace, "stolen"))})]]) {
      try { fn(); console.log(name+':allowed'); } catch(e) { console.log(name+':denied '+e.code); }
    } console.log('x'.repeat(200000));`);
  const p = policy("workspace-write"), m = manager();
  const result = await execute(m, p, invokeNode(script));
  expect(result.status, JSON.stringify(result)).toBe("completed");
  const saved = await m.ensureOutputFile(String(result.exec_id), p.temporaryDirectory);
  expect(saved.output_file_error).toBeUndefined();
  const snapshot = m.snapshots()[0]!;
  const output = readFileSync(String(snapshot.output_path), "utf8");
  expect(output).toContain("delete:denied");
  expect(output).toContain("rename:denied");
  expect(readFileSync(outside, "utf8")).toBe("keep");
  expect(existsSync(join(workspace, "stolen"))).toBe(false);
}, 30_000);

nativeTest("parallel commands in one workspace keep their temporary directories usable", async () => {
  const { workspace, policy } = fixture();
  const script = join(workspace, "temps.cjs");
  writeFileSync(script, `const fs=require('node:fs'), path=require('node:path');
    const file=path.join(process.env.TMPDIR, process.env.LXE_EXEC_SESSION_ID); fs.writeFileSync(file, 'before');
    setTimeout(()=>{ fs.writeFileSync(file, 'after'); console.log('temp-ok:'+process.env.TMPDIR); }, 250);`);
  const m = manager();
  const results = await Promise.all(["one", "two"].map(id => execute(m, policy("workspace-write", id), invokeNode(script))));
  for (const result of results) { expect(result.status, JSON.stringify(result)).toBe("completed"); expect(String(result.output)).toContain("temp-ok:"); }
  expect(results[0]!.output).not.toBe(results[1]!.output);
  if (process.platform === "win32") {
    for (const result of results) {
      const temporary = String(result.output).match(/temp-ok:([^\r\n]+)/u)?.[1];
      expect(temporary).toBeTruthy();
      expect(existsSync(temporary!)).toBe(false);
    }
    const same = policy("workspace-write", "shared");
    const overlap = await Promise.all([1,2].map(() => execute(m, same, invokeNode(script))));
    for (const result of overlap) expect(result.status, JSON.stringify(result)).toBe("completed");
    expect(overlap[0]!.output).not.toBe(overlap[1]!.output);
  }
}, 30_000);

nativeTest("project Python writes artifacts and private temp but cannot write the host output directory", async () => {
  const { workspace, policy } = fixture();
  const p = policy("workspace-write");
  mkdirSync(p.outputDirectory, { recursive: true });
  const script = join(workspace, "probe.py");
  writeFileSync(script, `import os\nfrom pathlib import Path\nroot = Path(os.environ['LXE_WORKSPACE_ROOT']) / '.lxeagent' / 'artifacts'\nroot.mkdir(parents=True, exist_ok=True)\n(root / 'python.txt').write_text('artifact')\nPath(os.environ['TMPDIR'], 'python.tmp').write_text('temporary')\ntry:\n    Path(${JSON.stringify(join(p.outputDirectory, "escaped"))}).write_text('bad')\nexcept PermissionError as error:\n    print('host-output-denied:', error)\nelse:\n    raise RuntimeError('host output writable')\nprint('python-ok')\n`);
  const python = join(process.cwd(), ".venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
  const result = await execute(manager(), p, `${process.platform === "win32" ? "& " : ""}${quote(python)} -I -B ${quote(script)}`);
  expect(result.status, JSON.stringify(result)).toBe("completed");
  expect(String(result.output)).toContain("host-output-denied:");
  expect(String(result.output)).toContain("python-ok");
  expect(readFileSync(join(p.artifactRoot, "python.txt"), "utf8")).toBe("artifact");
  expect(existsSync(join(p.outputDirectory, "escaped"))).toBe(false);
}, 30_000);
