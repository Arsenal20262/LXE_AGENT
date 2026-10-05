import { afterEach, expect, test } from "bun:test";
import { mkdtemp, mkdir, writeFile, rm, rename, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WorkspaceFileSearch, DEFAULT_FILE_SEARCH_EXCLUDED_DIRECTORIES } from "../../src/tooling/file-references";
import { invokedSkillNames } from "../../src/tooling/skill-invocations";
const roots: string[] = [], searches: WorkspaceFileSearch[] = [];
afterEach(async () => { searches.splice(0).forEach(s => s.dispose()); await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function fixture(limit = 50000) {
  const root = await mkdtemp(join(tmpdir(), "lxe-references-")); roots.push(root);
  for (const directory of ["报表", ".hidden", "build", "node_modules"]) await mkdir(join(root, directory));
  for (const name of ["报表/销售 统计.xlsx", "销售.txt", ".hidden/secret.txt", ".env", "build/销售.txt", "node_modules/销售.js", ".gitignore"]) await writeFile(join(root, name), name === ".gitignore" ? "报表/\n" : "fixture");
  const search = new WorkspaceFileSearch(root, { maxResults: 20, maxEntries: limit, excludedDirectories: DEFAULT_FILE_SEARCH_EXCLUDED_DIRECTORIES }); searches.push(search); return { root, search };
}
test("dsh search filters, path completion and hidden files without gitignore exclusion", async () => {
  const { search } = await fixture(); const signal = new AbortController().signal;
  expect((await search.list("", signal)).map(x => x.path)).toEqual(["报表", "销售.txt"]);
  expect((await search.list("销售", signal)).map(x => x.path)).toEqual(["销售.txt", "报表/销售 统计.xlsx"]);
  expect(await search.list("build/", signal)).toEqual([]);
  expect(await search.list("node_modules/", signal)).toEqual([]);
  expect((await search.list(".hidden/", signal)).map(x => x.path)).toEqual([".hidden/secret.txt"]);
  expect((await search.list(".", signal)).map(x => x.path)).toContain(".env");
  expect((await search.list("报表/销售", signal))[0]?.path).toBe("报表/销售 统计.xlsx");
});
test("bounded index and result count; cancelled requests cannot publish results", async () => {
  const { root, search } = await fixture(8); const signal = new AbortController().signal;
  for (let i = 0; i < 25; i++) await writeFile(join(root, `item-${i}.txt`), "x");
  expect(await search.list("item", signal)).toHaveLength(5);
  expect(await search.list("", signal)).toHaveLength(20);
  const abort = new AbortController(); abort.abort(); await expect(search.list("item", abort.signal)).rejects.toThrow();
  search.dispose(); expect(await search.list("item", signal)).toEqual([]);
});
test("renames refresh live directory listings and stale fuzzy indexes rebuild", async () => {
  const { root, search } = await fixture(); const signal = new AbortController().signal;
  expect(await search.list("销售", signal)).toHaveLength(2);
  await rename(join(root, "销售.txt"), join(root, "新销售.txt")); search.invalidate();
  expect((await search.list("销售", signal)).map(x => x.path)).toContain("销售.txt");
  for (let i = 0; i < 100; i++) {
    if ((await search.list("新销售", signal)).length) break;
    await Bun.sleep(5);
  }
  expect((await search.list("新销售", signal))[0]?.path).toBe("新销售.txt");
  await rm(join(root, "报表/销售 统计.xlsx")); expect(await search.list("报表/", signal)).toEqual([]);
});
test("workspace traversal, absolute paths and symlinks never enter candidates", async () => {
  const { root, search } = await fixture(); const signal = new AbortController().signal;
  for (const path of ["../", "/tmp/", "C:\\Users\\", "报表/../../", "报表\0/"]) expect(await search.list(path, signal)).toEqual([]);
  await symlink(join(root, "报表"), join(root, "linked"), process.platform === "win32" ? "junction" : "dir");
  expect(await search.list("linked/", signal)).toEqual([]); expect(await search.list("linked", signal)).toEqual([]);
});
test("explicit skill grammar dedupes names and rejects paths and attached punctuation", () => {
  expect(invokedSkillNames("请使用 /office-xlsx 然后 /office-docx /office-xlsx")).toEqual(["office-xlsx", "office-docx"]);
  expect(invokedSkillNames("/office-xlsx/a /office-xlsx。 5/8 x/office-xlsx")).toEqual([]);
});
