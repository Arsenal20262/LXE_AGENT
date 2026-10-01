import { expect, test } from "bun:test";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openWorkspaceDirectory, workspaceDirectory } from "../src/main/workspace-directory";

test("opens only actual absolute directories and preserves filesystem and OS errors", async () => {
  const root = mkdtempSync(join(tmpdir(), "lxe-workspace-open-"));
  try {
    const opened: string[] = [];
    await openWorkspaceDirectory(root, async directory => { opened.push(directory); return ""; });
    expect(opened).toEqual([realpathSync.native(root)]);
    await expect(openWorkspaceDirectory(root, async () => "OS refused folder")).rejects.toThrow("OS refused folder");
    expect(() => workspaceDirectory("relative")).toThrow("absolute directory");
    expect(() => workspaceDirectory("https://example.com")).toThrow("absolute directory");
    expect(() => workspaceDirectory(join(root, "missing"))).toThrow("ENOENT");
    writeFileSync(join(root, "file.txt"), "hello");
    expect(() => workspaceDirectory(join(root, "file.txt"))).toThrow("not a directory");
  } finally { rmSync(root, { recursive: true, force: true }); }
});
