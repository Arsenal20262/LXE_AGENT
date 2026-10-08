import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { repositoryRoot } from "@lxe/core";
import {
  matchSkillPreselectionAttachment,
  matchSkillPreselectionText,
} from "../../src/tooling/skill-preselection";
import { SkillCatalog, parseSkillManifest } from "../../src/tooling/skills";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const fixture = () => {
  const root = mkdtempSync(join(tmpdir(), "lxe-skill-preselect-"));
  roots.push(root);
  const repository = join(root, "skills");
  const user = join(root, "user-skills");
  mkdirSync(repository, { recursive: true });
  const writeSkill = (directory: string, name: string, preselect = "") => {
    const skill = join(directory, name);
    mkdirSync(skill, { recursive: true });
    const path = join(skill, "SKILL.md");
    writeFileSync(path, ["---", `name: ${name}`, `description: ${name}`, preselect, "---", ""].join("\n"));
    return path;
  };
  const catalog = new SkillCatalog(root, user, { sharedSkillsRoot: false });
  return { catalog, repository, user, writeSkill };
};

const declaration = [
  "preselect:",
  "  text_phrases:",
  "    - 查询越南备货",
  "    - 生成越南备货清单",
  "  attachment:",
  "    extensions: [.xlsx]",
  "    probe_command_id: vietnam_replenishment_probe_sku",
  "    followup_phrases: [仅绑定, 绑定并查询]",
].join("\n");

describe("declarative Skill preselection", () => {
  test("the Vietnam Skill declares business actions without generic inventory or raw export phrases", () => {
    const path = join(repositoryRoot(import.meta.dir), "skills", "vietnam-stock-recommendation", "SKILL.md");
    const rule = parseSkillManifest(path, "repository").preselection;
    expect(rule?.textPhrases).toContain("查询越南备货");
    expect(rule?.textPhrases).toContain("查询越南的备货");
    expect(rule?.textPhrases).not.toContain("绑定越南 SKU 参数表");
    expect(rule?.textPhrases).not.toContain("看看越南库存");
    expect(rule?.textPhrases).not.toContain("导出越南仓库存原表");
    expect(rule?.attachment).toBeUndefined();
  });

  test("matches literal text and exact adjacent replies only for one enabled repository Skill", () => {
    const { catalog, repository, user, writeSkill } = fixture();
    writeSkill(repository, "stock", declaration);
    writeSkill(user, "user", declaration);
    catalog.forceRefresh();
    const snapshot = catalog.snapshot();
    expect(snapshot.preselection).toEqual([{
      name: "stock",
      textPhrases: ["查询越南备货", "生成越南备货清单"],
      attachment: {
        extensions: [".xlsx"],
        probeCommandId: "vietnam_replenishment_probe_sku",
        followupPhrases: ["仅绑定", "绑定并查询"],
      },
    }]);
    expect(matchSkillPreselectionText(snapshot, "帮我查询越南备货")).toBe("stock");
    expect(matchSkillPreselectionText(snapshot, "看看越南库存")).toBeUndefined();
    expect(matchSkillPreselectionText(snapshot, "导出越南仓库存原表")).toBeUndefined();
    expect(matchSkillPreselectionAttachment(snapshot, ".xlsx")?.name).toBe("stock");
    expect(matchSkillPreselectionAttachment(snapshot, ".XLSX", " 仅绑定 ")?.name).toBe("stock");
    expect(matchSkillPreselectionAttachment(snapshot, ".xlsx", "看看库存")).toBeUndefined();
    expect(matchSkillPreselectionAttachment(snapshot, ".csv")).toBeUndefined();
    expect(catalog.snapshot({ disabledNames: new Set(["stock"]) }).preselection).toEqual([]);
  });

  test("returns no candidate when declarations conflict", () => {
    const { catalog, repository, writeSkill } = fixture();
    writeSkill(repository, "one", declaration);
    writeSkill(repository, "two", declaration);
    catalog.forceRefresh();
    const snapshot = catalog.snapshot();
    expect(matchSkillPreselectionText(snapshot, "查询越南备货")).toBeUndefined();
    expect(matchSkillPreselectionAttachment(snapshot, ".xlsx")).toBeUndefined();
  });

  test("refreshes the snapshot when only the declaration changes", () => {
    const { catalog, repository, writeSkill } = fixture();
    const path = writeSkill(repository, "stock", declaration);
    catalog.forceRefresh();
    const original = catalog.snapshot();
    writeFileSync(path, ["---", "name: stock", "description: stock", declaration.replace("查询越南备货", "查询泰国备货"), "---", ""].join("\n"));
    catalog.forceRefresh();
    expect(catalog.snapshot()).not.toBe(original);
    expect(matchSkillPreselectionText(catalog.snapshot(), "查询越南备货")).toBeUndefined();
    expect(matchSkillPreselectionText(catalog.snapshot(), "查询泰国备货")).toBe("stock");
  });

  test.each([
    "preselect: []",
    "preselect:\n  text_phrases: [a]",
    "preselect:\n  text_phrases: [查询越南备货, 查询越南备货]",
    "preselect:\n  text_phrases: [查询越南备货]\n  regex: .*",
    "preselect:\n  attachment:\n    extensions: [xlsx]\n    probe_command_id: safe_probe\n    followup_phrases: [仅绑定]",
    "preselect:\n  attachment:\n    extensions: [.xlsx]\n    probe_command_id: 'lxeskill probe --path'\n    followup_phrases: [仅绑定]",
  ])("rejects malformed repository metadata: %s", (preselect) => {
    const { catalog, repository, writeSkill } = fixture();
    writeSkill(repository, "stock", preselect);
    expect(() => catalog.forceRefresh()).toThrow(/invalid skill preselect/);
  });
});
