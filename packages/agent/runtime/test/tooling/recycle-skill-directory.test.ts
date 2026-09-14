import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, parse } from "node:path";
import { recycleSkillDirectory } from "../../src/tooling/recycle-skill-directory";
import { SkillCatalog } from "../../src/tooling/skills";
import { UserSkillFiles } from "../../src/tooling/user-skill-files";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const fixture = () => {
  const root = mkdtempSync(join(tmpdir(), "lxe-recycle-")); roots.push(root);
  const source = join(root, "source"), destination = join(root, "recycled");
  mkdirSync(join(source, "assets", "empty"), { recursive: true });
  writeFileSync(join(source, "SKILL.md"), "instructions");
  writeFileSync(join(source, "assets", "template.bin"), Buffer.from([0, 255, 23, 4]));
  return { source, destination };
};
const crossDeviceRename = () => { throw Object.assign(new Error("cross-device link not permitted"), { code: "EXDEV" }); };

test("cross-device recycle preserves all resources and checks the original before removal", () => {
  const { source, destination } = fixture();
  recycleSkillDirectory(source, destination, () => {
    expect(readFileSync(join(source, "SKILL.md"), "utf8")).toBe("instructions");
    expect(readFileSync(join(destination, "assets", "template.bin"))).toEqual(Buffer.from([0, 255, 23, 4]));
  }, crossDeviceRename);
  expect(existsSync(source)).toBe(false);
  expect(existsSync(join(destination, "assets", "empty"))).toBe(true);
});

test("an edit during cross-device copying cancels deletion without losing the edited original", () => {
  const { source, destination } = fixture();
  expect(() => recycleSkillDirectory(source, destination, () => {
    writeFileSync(join(source, "SKILL.md"), "external edit");
    throw new Error("Skill changed; reload before modifying");
  }, crossDeviceRename)).toThrow("Skill changed");
  expect(readFileSync(join(source, "SKILL.md"), "utf8")).toBe("external edit");
  expect(existsSync(destination)).toBe(false);
});

test("unrelated rename failures retain their actual error without removing any files", () => {
  const { source, destination } = fixture();
  expect(() => recycleSkillDirectory(source, destination, () => {}, () => {
    throw Object.assign(new Error("fixture file is locked"), { code: "EPERM" });
  })).toThrow("fixture file is locked");
  expect(readFileSync(join(source, "SKILL.md"), "utf8")).toBe("instructions");
  expect(existsSync(destination)).toBe(false);
});

const differentVolumes = process.platform === "win32"
  && parse(tmpdir()).root.toLowerCase() !== parse(process.cwd()).root.toLowerCase();
test.skipIf(!differentVolumes)("Windows recycles an overridden C-drive skill into D-drive app data", () => {
  const user = mkdtempSync(join(tmpdir(), "lxe-skill-volume-")); roots.push(user);
  const temporary = join(process.cwd(), "var", "tmp"); mkdirSync(temporary, { recursive: true });
  const data = mkdtempSync(join(temporary, "lxe-skill-volume-")); roots.push(data);
  const official = join(data, "official"); mkdirSync(official);
  const skillRoot = join(user, "sample"); mkdirSync(skillRoot);
  writeFileSync(join(skillRoot, "SKILL.md"), "---\nname: sample\ndescription: Cross-volume workflow\n---\nInstructions\n");
  const catalog = new SkillCatalog(data, user, { repositorySkillsRoot: official, sharedSkillsRoot: false,
    statePath: join(data, "config", "skill-states.local.json"), refreshIntervalMs: 0 });
  const files = new UserSkillFiles(catalog, data);
  const skill = files.list()[0]!;
  const disabled = files.setEnabled(skill.id, skill.version, false);
  const result = files.delete(disabled.id, disabled.version);
  expect(files.list()).toEqual([]);
  expect(readFileSync(join(result.recycled_path, "SKILL.md"), "utf8")).toContain("Instructions");
  expect(existsSync(skillRoot)).toBe(false);
});
