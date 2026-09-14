import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { SkillCatalog, parseSkillManifest } from "../../src/tooling/skills";
import { UserSkillFiles } from "../../src/tooling/user-skill-files";
import { skillPathKey } from "../../src/tooling/skill-files";
import cases from "./skill-manifests.fixtures.json";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const fixture = () => {
  const root = mkdtempSync(join(tmpdir(), "lxe-user-skills-")); roots.push(root);
  const official = join(root, "official"), user = join(root, "var", "skills"), shared = join(root, "shared");
  for (const path of [official, user, shared]) mkdirSync(path, { recursive: true });
  const statePath = join(root, "var", "config", "skill-states.local.json");
  const changes: number[] = [];
  const catalog = new SkillCatalog(root, user, { repositorySkillsRoot: official, sharedSkillsRoot: shared,
    statePath, refreshIntervalMs: 0, onChanged: revision => changes.push(revision) });
  return { root, official, user, shared, catalog, statePath, changes, files: new UserSkillFiles(catalog, join(root, "var")) };
};
const write = (root: string, folder: string, name = folder, extra = "") => {
  const path = join(root, folder, "SKILL.md"); mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `---\nname: ${name}\ndescription: Workflow ${folder}\n${extra}---\n# Instructions\n`);
  return path;
};

test("official, managed and shared precedence is independent of enabled state", () => {
  const { official, user, shared, catalog, files } = fixture();
  const original = write(shared, "weekly"); write(user, "weekly"); write(official, "official");
  write(shared, "official");
  expect(catalog.list().map(item => [item.name, item.source])).toEqual([["official", "repository"], ["weekly", "user"]]);
  const [entry] = files.list();
  const disabled = files.setEnabled(entry!.id, entry!.version, false);
  expect(disabled.enabled).toBe(false);
  expect(catalog.get("weekly")).toBeUndefined();
  expect(catalog.entries().find(item => item.location === original)?.diagnostics[0]?.code).toBe("user_skill_shadowed");
  expect(readFileSync(original, "utf8")).toContain("Workflow weekly");
});

test("broken and duplicate external entries remain manageable without poisoning valid skills", () => {
  const { official, user, shared, catalog, files } = fixture();
  write(official, "official", "official", "commands: [lxeskill owned]\n");
  write(user, "valid");
  const invalid = write(user, "broken"); writeFileSync(invalid, "---\nname: [\n---\n");
  write(user, "copy-a", "duplicate"); write(user, "copy-b", "duplicate");
  write(shared, "collision", "collision", "commands: [lxeskill owned]\n");
  expect(catalog.list().map(item => item.name)).toEqual(["official", "valid"]);
  expect(files.list()).toHaveLength(4);
  const broken = files.list().find(item => item.name === "broken")!;
  expect(files.content(broken.id).content).toContain("name: [");
  expect(broken.available).toBe(false);
  expect(broken.unavailable_reason).toContain(invalid);
  write(user, "broken");
  expect(catalog.get("broken")).toBeDefined();
  expect(catalog.get("collision")).toBeUndefined();
});

test("state survives restart and editing, stale versions cannot toggle or delete, deletion is recoverable", () => {
  const { root, official, user, shared, catalog, statePath, files } = fixture();
  const path = write(user, "weekly");
  const first = files.list()[0]!;
  const disabled = files.setEnabled(first.id, first.version, false);
  writeFileSync(path, readFileSync(path, "utf8") + "new instructions\n");
  expect(() => files.delete(disabled.id, disabled.version)).toThrow("Skill changed");
  const restarted = new SkillCatalog(root, user, { repositorySkillsRoot: official, sharedSkillsRoot: shared, statePath });
  expect(restarted.get("weekly")).toBeUndefined();
  const current = files.list()[0]!;
  expect(current.enabled).toBe(false);
  expect(() => files.setEnabled(first.id, first.version, true)).toThrow("Skill changed");
  const removed = files.delete(current.id, current.version);
  expect(files.list()).toEqual([]);
  expect(readFileSync(join(removed.recycled_path, "SKILL.md"), "utf8")).toContain("new instructions");
  renameSync(removed.recycled_path, dirname(path));
  expect(files.list()[0]?.id).toBe(first.id);
  expect(files.list()[0]?.enabled).toBe(false);
  const restored = files.list()[0]!;
  files.setEnabled(restored.id, restored.version, true);
  expect(catalog.get("weekly")).toBeDefined();
});

test("resources refresh versions and notifications; file access stays within the selected skill", () => {
  const { root, user, files, changes, catalog } = fixture();
  const path = write(user, "weekly");
  mkdirSync(join(dirname(path), "assets"));
  const resource = join(dirname(path), "assets", "template.txt"); writeFileSync(resource, "first");
  const first = files.list()[0]!;
  const before = changes.length;
  writeFileSync(resource, "updated resource");
  const updated = files.list()[0]!;
  expect(updated.version).not.toBe(first.version);
  expect(changes.length).toBeGreaterThan(before);
  expect(files.content(updated.id, {}, "assets/template.txt").content).toBe("updated resource");
  writeFileSync(join(root, "secret"), "private");
  symlinkSync(join(root, "secret"), join(dirname(path), "escaped"));
  expect(() => files.content(updated.id, {}, "escaped")).toThrow("escapes its real root");
  expect(() => files.content(updated.id, {}, "../secret")).toThrow("escapes its root");
  expect(() => files.content("../../secret")).toThrow("User skill not found");
  expect(catalog.snapshot().locations).toEqual({ [skillPathKey(path)]: "weekly" });
});

test("permission filters do not hide management entries or grant new command ownership", () => {
  const { user, files, catalog } = fixture();
  write(user, "restricted", "restricted", "type: amazon_fba\n");
  const policy = { allowedTypes: new Set(["default"]) };
  const entry = files.list(policy)[0]!;
  expect(entry.enabled).toBe(true); expect(entry.available).toBe(false);
  expect(files.setEnabled(entry.id, entry.version, true, policy).available).toBe(false);
  expect(catalog.snapshot(policy).names).toEqual([]);
});

test("canonical source aliases are deduplicated before conflicts", () => {
  const { root, user, official } = fixture();
  write(user, "weekly");
  const alias = join(root, "alias"); symlinkSync(user, alias, process.platform === "win32" ? "junction" : "dir");
  const catalog = new SkillCatalog(root, user, { repositorySkillsRoot: official, sharedSkillsRoot: alias });
  expect(catalog.list()).toHaveLength(1); expect(catalog.entries()).toHaveLength(1);
});

for (const fixtureCase of cases) test(`shared parser fixtures: ${fixtureCase.title}`, () => {
  const { user } = fixture(); const directory = join(user, "sample"); mkdirSync(directory);
  for (const [file, content] of Object.entries(fixtureCase.files ?? {})) {
    mkdirSync(dirname(join(directory, file)), { recursive: true }); writeFileSync(join(directory, file), content);
  }
  const path = join(directory, "SKILL.md"); writeFileSync(path, fixtureCase.content);
  const run = () => parseSkillManifest(path, "shared");
  if (fixtureCase.compatible) expect(run().name).toBeTruthy(); else expect(run).toThrow();
});


test("an overridden discovery root cannot discover recycled entries", () => {
  const { root, official } = fixture();
  const user = join(root, "var");
  const trash = join(user, "trash", "skills");
  const catalog = new SkillCatalog(root, user, { repositorySkillsRoot: official, sharedSkillsRoot: false,
    excludedRoots: [trash], refreshIntervalMs: 0 });
  const files = new UserSkillFiles(catalog, user);
  write(user, "weekly");
  const skill = files.list()[0]!;
  files.delete(skill.id, skill.version);
  expect(files.list()).toEqual([]); expect(catalog.list()).toEqual([]);
});
