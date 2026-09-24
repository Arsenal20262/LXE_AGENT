import { expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cleanupCandidates, lockCandidateFiles, recordPublished } from "./release-retention";
import { writeJsonAtomic, type ReleaseCandidate } from "./release-candidate";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "lxe retention 测试 "));
  const records: ReleaseCandidate[] = [];
  for (let n = 0; n < 10; n++) {
    const build_id = `build-${n}`, file_name = "LXE-Agent-0.2.19-windows-x64.exe";
    const record: ReleaseCandidate = { schema_version: 1, version: "0.2.19", build_id,
      source_commit: "a".repeat(40), built_at: `2026-09-${String(n + 1).padStart(2, "0")}T00:00:00Z`,
      platform: "windows-x64", file_name, object_key: `artifacts/0.2.19/${build_id}/${file_name}`,
      size: 9, sha512: "fixture-hash", notes: "中文更新说明" };
    mkdirSync(join(root, build_id));
    writeJsonAtomic(join(root, build_id, "candidate.json"), record);
    writeFileSync(join(root, build_id, file_name), "installer");
    records.push(record);
  }
  const logs: string[] = [];
  const file = (n: number) => join(root, records[n]!.build_id, records[n]!.file_name);
  return { root, records, logs, file,
    clean: (protectedBuild?: string) => cleanupCandidates(root, protectedBuild, line => logs.push(line)),
    retained: () => records.flatMap((_, n) => existsSync(file(n)) ? [n] : []),
    dispose: () => rmSync(root, { recursive: true, force: true }) };
}

test("ten builds retain the newest three installers and all records; cleanup is repeatable", () => {
  const f = fixture(); try {
    writeFileSync(join(f.root, "unrelated.exe"), "keep");
    f.clean(); expect(f.retained()).toEqual([7, 8, 9]);
    for (const record of f.records) expect(JSON.parse(readFileSync(join(f.root, record.build_id, "candidate.json"), "utf8"))).toEqual(record);
    expect(existsSync(join(f.root, "unrelated.exe"))).toBe(true);
    f.clean(); expect(f.retained()).toEqual([7, 8, 9]);
    expect(f.logs.at(-1)).toContain("removed 0 installer(s)");
  } finally { f.dispose(); }
});
test("latest successful publication is an extra protection that rotates after the next success", () => {
  const f = fixture(); try {
    writeJsonAtomic(join(f.root, "build-0", "publication.json"), { intent: true });
    recordPublished(f.root, f.records[0]!); f.clean();
    expect(f.retained()).toEqual([0, 7, 8, 9]);
    recordPublished(f.root, f.records[9]!); f.clean();
    expect(f.retained()).toEqual([7, 8, 9]);
    expect(existsSync(join(f.root, "build-0", "publication.json"))).toBe(true);
  } finally { f.dispose(); }
});
test("current candidate and explicitly completed build remain protected", () => {
  const f = fixture(); try {
    writeJsonAtomic(join(f.root, "current.json"), { status: "ready", candidate: "build-0/candidate.json" });
    f.clean("build-1"); expect(f.retained()).toEqual([0, 1, 7, 8, 9]);
  } finally { f.dispose(); }
});
test("legacy publication intents are preserved until a confirmed success establishes the latest publication", () => {
  const f = fixture(); try {
    for (const n of [0, 1]) writeJsonAtomic(join(f.root, `build-${n}`, "publication.json"), { intent: true });
    f.clean(); expect(f.retained()).toEqual([0, 1, 7, 8, 9]);
    recordPublished(f.root, f.records[9]!); f.clean(); expect(f.retained()).toEqual([7, 8, 9]);
  } finally { f.dispose(); }
});
for (const name of ["current.json", "last-published.json"]) test(`corrupt ${name} prevents cleanup conservatively`, () => {
  const f = fixture(); try {
    writeFileSync(join(f.root, name), "{"); f.clean(); expect(f.retained()).toHaveLength(10);
    expect(f.logs.join("\n")).toContain("Local cleanup skipped:");
    expect(existsSync(join(f.root, "retention.lock"))).toBe(false);
  } finally { f.dispose(); }
});
test("mismatched publication receipt prevents cleanup", () => {
  const f = fixture(); try {
    recordPublished(f.root, { ...f.records[0]!, source_commit: "b".repeat(40) });
    f.clean(); expect(f.retained()).toHaveLength(10);
  } finally { f.dispose(); }
});
test("active uploader lock prevents cleanup and a second file operation", () => {
  const f = fixture(); try {
    const unlock = lockCandidateFiles(f.root);
    expect(() => lockCandidateFiles(f.root)).toThrow("locked");
    f.clean(); expect(f.retained()).toHaveLength(10);
    expect(existsSync(join(f.root, "retention.lock"))).toBe(true);
    unlock(); f.clean(); expect(f.retained()).toEqual([7, 8, 9]);
  } finally { f.dispose(); }
});
test("invalid metadata and unexpected installer files are preserved without blocking other eligible cleanup", () => {
  const f = fixture(); try {
    writeJsonAtomic(join(f.root, "build-0", "candidate.json"), { ...f.records[0], file_name: "../outside.exe" });
    writeJsonAtomic(join(f.root, "build-1", "candidate.json"), { ...f.records[1], build_id: "wrong",
      object_key: `artifacts/0.2.19/wrong/${f.records[1]!.file_name}` });
    writeFileSync(f.file(2), "changed-size");
    f.clean(); expect(f.retained()).toEqual([0, 1, 2, 7, 8, 9]);
    expect(f.logs.join("\n")).toContain("Invalid candidate path");
    expect(f.logs.join("\n")).toContain("identity mismatch");
    expect(f.logs.join("\n")).toContain("expected regular file");
  } finally { f.dispose(); }
});
test("linked candidate directories are never traversed", () => {
  const f = fixture(); const linkedRoot = mkdtempSync(join(tmpdir(), "lxe retention links "));
  try {
    symlinkSync(join(f.root, "build-0"), join(linkedRoot, "build-0"), process.platform === "win32" ? "junction" : "dir");
    cleanupCandidates(linkedRoot); expect(existsSync(f.file(0))).toBe(true);
  } finally { rmSync(linkedRoot, { recursive: true, force: true }); f.dispose(); }
});
