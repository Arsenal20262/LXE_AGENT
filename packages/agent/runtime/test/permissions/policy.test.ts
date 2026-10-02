import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { canonicalPathCandidate, pathContains } from "@lxe/core";
import { PermissionPolicyService, assertPermissionExecutionAvailable } from "../../src/permissions/policy";
import { workspaceFor } from "../workspace";

const roots: string[] = [];
const fixture = () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "lxe-permission-")));
  roots.push(root);
  const dataRoot = join(root, "var");
  const directory = join(dataRoot, "workspace");
  const service = new PermissionPolicyService({ dataRoot });
  const session = { session_id: "../session", workspace: workspaceFor(directory, root), permission_mode: "danger-full-access" as const };
  return { root, dataRoot, directory, service, session };
};
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

test("policy resolution is pure and modes describe future capabilities without granting them", () => {
  const { dataRoot, directory, service, session } = fixture();
  const full = service.resolve(session);
  expect(full).toMatchObject({ mode: "danger-full-access", approvalPolicy: "never", workspaceRoot: directory,
    artifactRoot: join(directory, ".lxeagent", "artifacts"), writeAccess: { kind: "unrestricted" }, diagnostics: [] });
  expect(() => assertPermissionExecutionAvailable(full)).not.toThrow();
  const read = service.resolve({ ...session, permission_mode: "read-only" });
  const write = service.resolve({ ...session, permission_mode: "workspace-write" });
  expect(read).toMatchObject({ approvalPolicy: "ask", writeAccess: { kind: "roots", roots: [] } });
  expect(write.writeAccess).toEqual({ kind: "roots", roots: [directory, full.temporaryDirectory] });
  for (const policy of [read, write]) expect(() => assertPermissionExecutionAvailable(policy)).toThrow("backends are not implemented");
  expect(existsSync(dataRoot)).toBe(false);
  expect(() => service.resolve({ ...session, permission_mode: "bogus" as never })).toThrow("Invalid permission mode");
});

test("selected subdirectory stays the boundary; sessions share artifacts but have isolated host temporary paths", () => {
  const { root, dataRoot, service, session } = fixture();
  const first = service.resolve(session);
  const second = service.resolve({ ...session, session_id: "second" });
  const other = service.resolve({ ...session, session_id: "third", workspace: workspaceFor(join(root, "other"), root) });
  expect(service.resolve(session)).toEqual(first);
  expect(first.artifactRoot).toBe(second.artifactRoot);
  expect(first.artifactRoot).not.toBe(other.artifactRoot);
  expect(first.temporaryDirectory).not.toBe(second.temporaryDirectory);
  expect(first.outputDirectory).not.toBe(second.outputDirectory);
  expect(pathContains(join(dataRoot, "tmp", "tools"), first.temporaryDirectory)).toBe(true);
  expect(pathContains(join(dataRoot, "tmp", "exec"), first.outputDirectory)).toBe(true);
  expect(new PermissionPolicyService({ dataRoot }).resolve(session).temporaryDirectory).not.toBe(first.temporaryDirectory);
  const repo = service.resolve({ ...session, workspace: workspaceFor(root) });
  expect(repo.diagnostics).toContainEqual({ code: "private_path_overlap", path: root, boundary: join(dataRoot, "db") });
});

test("real paths diagnose symlink escapes and private overlaps, including missing targets", () => {
  const { root, directory, dataRoot, service, session } = fixture();
  mkdirSync(directory, { recursive: true });
  mkdirSync(join(dataRoot, "tmp"), { recursive: true });
  const privateTarget = join(dataRoot, "db");
  mkdirSync(privateTarget);
  symlinkSync(privateTarget, join(directory, ".lxeagent"), process.platform === "win32" ? "junction" : "dir");
  symlinkSync(privateTarget, join(dataRoot, "tmp", "tools"), process.platform === "win32" ? "junction" : "dir");
  const policy = service.resolve(session);
  expect(policy.artifactRoot).toBe(join(privateTarget, "artifacts"));
  expect(policy.diagnostics.map(item => item.code)).toContain("artifact_outside_workspace");
  expect(policy.diagnostics.map(item => item.code)).toContain("temporary_outside_root");
  expect(policy.diagnostics).toContainEqual({ code: "private_path_overlap", path: policy.artifactRoot, boundary: privateTarget });
  expect(canonicalPathCandidate(`${directory}${sep}.lxeagent${sep}..${sep}missing`)).toBe(join(dataRoot, "missing"));
  writeFileSync(join(root, "file"), "x");
  expect(() => canonicalPathCandidate(join(root, "file", "child"))).toThrow();
  if (process.platform !== "win32") {
    symlinkSync(join(root, "missing-target"), join(root, "dangling"));
    expect(canonicalPathCandidate(join(root, "dangling", "leaf"))).toBe(join(root, "missing-target", "leaf"));
  }
});

test("path comparisons respect components, traversal, separators, Windows drives and casing", () => {
  expect(pathContains("/work/project", "/work/project-child", "linux")).toBe(false);
  expect(pathContains("/work/project/", "/work/project/a/../b", "linux")).toBe(true);
  expect(pathContains("/work/project", "/work/project/../secret", "linux")).toBe(false);
  expect(pathContains("C:\\Work\\Project", "c:/work/project/a", "win32")).toBe(true);
  expect(pathContains("C:\\Work\\Project", "C:\\Work\\Project-other", "win32")).toBe(false);
  expect(pathContains("C:\\Work", "D:\\Work", "win32")).toBe(false);
  expect(pathContains("\\\\server\\share\\work", "\\\\SERVER\\share\\work\\file", "win32")).toBe(true);
  expect(pathContains("/Work", "/work/file", "linux")).toBe(false);
});

test("a tools symlink into host output storage is diagnosed even inside the shared tmp parent", () => {
  const { dataRoot, service, session } = fixture();
  mkdirSync(join(dataRoot, "tmp", "exec"), { recursive: true });
  symlinkSync(join(dataRoot, "tmp", "exec"), join(dataRoot, "tmp", "tools"), process.platform === "win32" ? "junction" : "dir");
  const policy = service.resolve(session);
  expect(policy.diagnostics).toContainEqual(expect.objectContaining({ code: "temporary_outside_root", path: policy.temporaryDirectory }));
});
