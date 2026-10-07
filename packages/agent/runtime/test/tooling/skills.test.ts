import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { cpSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { repositoryRoot } from "@lxe/core";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  MAX_SKILL_MANIFEST_BYTES,
  SkillCatalog,
  buildSkillIndexPrompt,
} from "../../src/tooling/skills";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("skill context", () => {
  test("cached readers never touch disk; concurrent uses share a scan and failed refreshes can retry", async () => {
    const root = mkdtempSync(join(tmpdir(), "lxe-skill-use-")); roots.push(root);
    const directory = join(root, "skills", "demo"); mkdirSync(directory, { recursive: true });
    const path = join(directory, "SKILL.md");
    writeFileSync(path, "---\nname: demo\ndescription: First\n---\n", "utf8");
    const catalog = new SkillCatalog(root, join(root, "user"), { sharedSkillsRoot: false });
    const scan = spyOn(catalog, "forceRefresh");
    try {
      const first = catalog.refreshForUse();
      expect(catalog.refreshForUse()).toBe(first);
      await first;
      expect(scan).toHaveBeenCalledTimes(1);
      const snapshot = catalog.snapshot();
      rmSync(directory, { recursive: true });
      expect(catalog.list()).toHaveLength(1);
      expect(catalog.entries()).toHaveLength(1);
      expect(catalog.diagnostics()).toEqual([]);
      expect(catalog.get("demo")?.description).toBe("First");
      expect(catalog.snapshot()).toBe(snapshot);
      expect(scan).toHaveBeenCalledTimes(1);
      await catalog.refreshForUse();
      expect(catalog.list()).toEqual([]);
      expect(snapshot.names).toEqual(["demo"]);
      mkdirSync(directory); writeFileSync(path, "broken", "utf8");
      await expect(catalog.refreshForUse()).rejects.toThrow("missing YAML frontmatter");
      expect(catalog.list()).toEqual([]);
      writeFileSync(path, "---\nname: renamed\ndescription: Second\n---\n", "utf8");
      await catalog.refreshForUse();
      expect(catalog.snapshot().names).toEqual(["renamed"]);
      expect(scan).toHaveBeenCalledTimes(4);
    } finally { scan.mockRestore(); }
  });
  test("loads Amazon and Southeast Asia replenishment skills under the existing permission outside the source checkout", () => {
    const root = mkdtempSync(join(tmpdir(), "lxe-replenishment-skills-"));
    roots.push(root);
    const source = join(repositoryRoot(import.meta.dir), "skills");
    const names = readdirSync(source).filter((name) => name.startsWith("replenishment-")
      || name === "mabang-brazil-export" || name === "mabang-tms-export" || name === "yacang-export" || name.startsWith("shangman-") || name === "southeast-asia-replenishment-workflow-map" || name === "vietnam-stock-recommendation");
    expect(names).toHaveLength(16);
    for (const name of names) cpSync(join(source, name), join(root, "skills", name), { recursive: true });
    const catalog = new SkillCatalog(root, join(root, "missing-user"), { sharedSkillsRoot: false });
    catalog.forceRefresh();
    const skills = catalog.list({ allowedTypes: new Set(["replenishment"]) });
    expect(skills).toHaveLength(16);
    expect(skills.every(skill => skill.type === "replenishment")).toBe(true);
    expect(catalog.list({ allowedTypes: new Set(["amazon_replenish"]) })).toHaveLength(0);
    expect(catalog.list({ allowedTypes: new Set() })).toHaveLength(0);
    const references = skills.flatMap((skill) => skill.references.map((reference) => {
      expect(readFileSync(join(skill.root, reference.path), "utf8").length).toBeGreaterThan(100);
      return reference;
    }));
    expect(references).toHaveLength(5);
    expect(skills.find((skill) => skill.name === "replenishment-workflow-map")?.commands).toEqual([]);
    expect(skills.find((skill) => skill.name === "southeast-asia-replenishment-workflow-map")?.commands).toEqual([]);
    expect(skills.find((skill) => skill.name === "vietnam-stock-recommendation")?.commands).toEqual([
      "lxeskill vietnam sku bind",
      "lxeskill vietnam stock recommend",
      "lxeskill vietnam stock generate",
    ]);
    expect(skills.find((skill) => skill.name === "vietnam-stock-recommendation")?.description).toContain("生成越南备货清单");
    expect(skills.find((skill) => skill.name === "vietnam-stock-recommendation")?.description).toContain("越南补货建议");
    expect(skills.find((skill) => skill.name === "vietnam-stock-recommendation")?.description).toContain("越南补货量");
    expect(skills.find((skill) => skill.name === "vietnam-stock-recommendation")?.description).toContain("越南这批该补多少");
    const vietnamPolicy = skills.find((skill) => skill.name === "vietnam-stock-recommendation")?.content ?? "";
    expect(vietnamPolicy).toContain("当前消息恰好只有一个附件，且它是 `.xlsx` `local_file`");
    expect(vietnamPolicy).toContain("managed_lxeskill");
    expect(vietnamPolicy).toContain('{"command_id":"vietnam_replenishment_bind_sku"}');
    expect(vietnamPolicy).toContain("唯一合规 XLSX 加明确在线生成要求时，直接绑定再生成");
    expect(vietnamPolicy).toContain("不要为取得附件 ID 搜索目录、读取会话记录或读取 XLSX");
    expect(vietnamPolicy).toContain("vietnam_replenishment_bind_sku");
    expect(vietnamPolicy).toContain("vietnam_replenishment_generate");
    expect(vietnamPolicy).toContain("attachment_id");
    expect(vietnamPolicy).not.toContain("通过 `exec`");
    expect(vietnamPolicy).not.toContain("--source-path <");
    expect(vietnamPolicy).toContain("紧邻上一条用户消息");
    expect(vietnamPolicy).toContain("确认、澄清或继续处理该附件");
    expect(vietnamPolicy).toContain("查询或生成越南备货清单");
    expect(vietnamPolicy).toContain("帮我出一份越南备货单");
    expect(vietnamPolicy).toContain("按越南库存和销量算要补多少");
    expect(vietnamPolicy).toContain("我刚传了越南 SKU 表");
    expect(vietnamPolicy).toContain("暂时不用算");
    expect(vietnamPolicy).toContain("看看越南仓还有多少货");
    expect(vietnamPolicy).toContain("导出越南仓库存原表");
    expect(vietnamPolicy).toContain("只问当前 SKU 表绑定状态或版本时");
    expect(vietnamPolicy).toContain("只问流程、所需资料或历史文件时");
    expect(vietnamPolicy).toContain("本条恰好只有一个附件，且该附件为 `.xlsx`");
    expect(vietnamPolicy).toContain("只有用户明确要求查询或生成");
    expect(vietnamPolicy).toContain("先绑定该附件，成功后再生成");
    expect(vietnamPolicy).toContain("绑定失败时不得沿用旧 current 生成");
    expect(vietnamPolicy).toContain("若本轮已经收到该附件绑定成功的工具结果，直接继续生成，不重复调用绑定");
    expect(vietnamPolicy).toContain("本轮没有合规新附件则直接用受信 current 生成一次");
    expect(vietnamPolicy).toContain("多附件未确认、非 `.xlsx` 附件或绑定失败时不进入在线生成");
    expect(vietnamPolicy).toContain("`ask_user_question` 弹出“仅绑定 / 绑定并查询”两个单选项");
    expect(vietnamPolicy).toContain('"id":"vietnam_sku_action"');
    expect(vietnamPolicy).toContain("表单答案在当前轮可继续处理当前附件");
    expect(vietnamPolicy).toContain("仅上传一份 `.xlsx`");
    expect(vietnamPolicy).toContain("用户随后在聊天中紧邻回复时按确认/继续处理规则使用该附件");
    expect(vietnamPolicy).toContain("不要求先询问用途");
    expect(vietnamPolicy).toContain("不跨多轮复用历史附件");
    expect(vietnamPolicy).toContain("多附件必须先确认");
    expect(vietnamPolicy).toContain("包括其中只有一份 `.xlsx` 的情况");
    expect(vietnamPolicy).toContain("每条新上传唯一 `.xlsx` 的用户消息都是新的处理请求，即使文件内容与更早上传相同");
    expect(vietnamPolicy).toContain("上一轮被取消或中断，不阻止本轮重新弹出选择框");
    expect(vietnamPolicy).toContain("同一用户消息对应的当前轮最多调用一次 `ask_user_question`");
    expect(vietnamPolicy).toContain("不从长对话历史推断这份新附件已经绑定");
    expect(vietnamPolicy).toContain("绑定返回 `unchanged` 也视为本轮绑定成功");
    expect(vietnamPolicy).not.toContain("且你已询问用途");
    expect(vietnamPolicy).not.toContain("用户要求绑定时");
    expect(vietnamPolicy).toContain('交给 `yacang-export`');
    expect(vietnamPolicy).toContain('明确使用已有三份雅仓 XLSX 生成越南备货');
    expect(vietnamPolicy).toContain('三份文件由宿主从当前消息或符合条件的紧邻上一条消息整组传入 `source_xlsx`');
    expect(vietnamPolicy).toContain('多附件集合必须来自同一上传轮次');
    expect(vietnamPolicy).toContain('只有三份报表用途不明时先澄清');
    expect(vietnamPolicy).toContain('{"command_id":"vietnam_replenishment_generate_offline"}');
    expect(vietnamPolicy).toContain('不调用 `vietnam_replenishment_bind_sku` 或在线 `vietnam_replenishment_generate`');
    expect(vietnamPolicy).toContain('离线失败时绝不调用雅仓补救或回退在线');
    expect(vietnamPolicy).toContain('基于用户提供的已有报表');
    expect(vietnamPolicy).toContain('不声称这些报表来自同一次导出或代表今天的实时数据');
    expect(vietnamPolicy).toContain('仅当生成的 `ok=true`、`data.success=true`');
    const southeastPolicy = skills.find((skill) => skill.name === "southeast-asia-replenishment-workflow-map")?.content ?? "";
    expect(skills.find((skill) => skill.name === "southeast-asia-replenishment-workflow-map")?.description).toContain("越南补货建议");
    expect(skills.find((skill) => skill.name === "southeast-asia-replenishment-workflow-map")?.description).toContain("越南这批该补多少");
    expect(southeastPolicy).toContain("查询越南备货");
    expect(southeastPolicy).toContain("看看越南库存");
    expect(southeastPolicy).toContain("恰好一个附件且为 XLSX");
    expect(southeastPolicy).toContain("交由 `vietnam-stock-recommendation` 判断并优先绑定");
    expect(skills.find((skill) => skill.name === "shangman-goods-export")?.commands).toEqual(["lxeskill shangman export run"]);
    expect(skills.find((skill) => skill.name === "shangman-login")?.commands).toHaveLength(4);
  });

  test("indexes allowed skill manifests and points the agent to their source", () => {
    const root = mkdtempSync(join(tmpdir(), "lxe-skills-"));
    roots.push(root);
    mkdirSync(join(root, "skills", "demo"), { recursive: true });
    writeFileSync(join(root, "skills", "demo", "SKILL.md"), [
      "---", "name: demo", "type: default", "description: Demo workflow",
      "commands:", "  - lxeskill demo run", "---", "# Demo", "",
    ].join("\n"), "utf8");
    mkdirSync(join(root, "skills", "blocked"), { recursive: true });
    writeFileSync(join(root, "skills", "blocked", "SKILL.md"), [
      "---", "name: blocked", "type: internal", "description: Hidden",
      "commands:", "  - lxeskill hidden run", "---", "",
    ].join("\n"), "utf8");
    const prompt = buildSkillIndexPrompt(root, { allowedTypes: new Set(["default"]) });
    expect(prompt).toContain("demo");
    expect(prompt).toContain("skills/demo/SKILL.md");
    expect(prompt).toContain("Commands: lxeskill demo run");
    expect(prompt).toContain("## lxeskill invocation contract");
    expect(prompt).toContain("exec.cwd instead");
    expect(prompt).toContain("managed_lxeskill");
    expect(prompt).not.toContain("blocked");
    expect(prompt).not.toContain("lxeskill hidden run");
  });

  test("treats SKILL.md as a package boundary while discovering nested skill groups", () => {
    const root = mkdtempSync(join(tmpdir(), "lxe-skill-boundary-"));
    roots.push(root);
    mkdirSync(join(root, "skills", "demo", "references", "nested"), { recursive: true });
    mkdirSync(join(root, "skills", "group", "nested"), { recursive: true });
    writeFileSync(
      join(root, "skills", "demo", "SKILL.md"),
      "---\nname: demo\ndescription: Demo workflow\n---\n",
      "utf8",
    );
    writeFileSync(join(root, "skills", "demo", "references", "skill.md"), "# Reference only\n", "utf8");
    writeFileSync(join(root, "skills", "demo", "references", "nested", "SKILL.md"), "# Not a skill\n", "utf8");
    writeFileSync(
      join(root, "skills", "group", "nested", "SKILL.md"),
      "---\nname: nested\ndescription: Nested workflow\n---\n",
      "utf8",
    );

    const catalog = new SkillCatalog(root, join(root, "missing-user"), { sharedSkillsRoot: false });
    catalog.forceRefresh();
    expect(catalog.list().map((skill) => skill.name)).toEqual(["demo", "nested"]);
  });

  test("uses absolute repository instructions when skills live outside the workspace", () => {
    const resourceRoot = mkdtempSync(join(tmpdir(), "lxe-skill-resource-"));
    const workspaceRoot = mkdtempSync(join(tmpdir(), "lxe-skill-workspace-"));
    roots.push(resourceRoot, workspaceRoot);
    const skillPath = join(resourceRoot, "skills", "demo", "SKILL.md");
    mkdirSync(join(resourceRoot, "skills", "demo"), { recursive: true });
    mkdirSync(join(workspaceRoot, "skills", "demo"), { recursive: true });
    writeFileSync(skillPath, "---\nname: demo\ndescription: Bundled workflow\n---\n# Bundled\n", "utf8");
    writeFileSync(
      join(workspaceRoot, "skills", "demo", "SKILL.md"),
      "---\nname: demo\ndescription: Workspace shadow\n---\n# Shadow\n",
      "utf8",
    );

    const catalog = new SkillCatalog(resourceRoot, join(resourceRoot, "missing-user"), { sharedSkillsRoot: false });
    catalog.forceRefresh();
    const normalizedSkillPath = skillPath.replaceAll("\\", "/");
    expect(catalog.buildPrompt({}, workspaceRoot)).toContain(`Instructions: ${normalizedSkillPath}`);
    expect(catalog.buildPrompt({}, workspaceRoot)).not.toContain("Instructions: skills/demo/SKILL.md");
  });

  test("renders a worktree skill relative to the session working directory", () => {
    const worktree = mkdtempSync(join(tmpdir(), "lxe-skill-worktree-"));
    roots.push(worktree);
    const directory = join(worktree, "packages", "app");
    mkdirSync(directory, { recursive: true });
    mkdirSync(join(worktree, "skills", "demo"), { recursive: true });
    writeFileSync(
      join(worktree, "skills", "demo", "SKILL.md"),
      "---\nname: demo\ndescription: Worktree skill\n---\n# Demo\n",
      "utf8",
    );
    const catalog = new SkillCatalog(worktree, join(worktree, "missing-user"), { sharedSkillsRoot: false });
    catalog.forceRefresh();
    const prompt = catalog.buildPrompt({}, {
      directory,
      worktree,
    });
    expect(prompt).toContain("Instructions: ../../skills/demo/SKILL.md");
  });

  test("prefers repository skills, refreshes by signature, and validates references", () => {
    const root = mkdtempSync(join(tmpdir(), "lxe-skills-catalog-"));
    roots.push(root);
    const userRoot = join(root, "user-skills");
    mkdirSync(join(root, "skills", "demo", "references"), { recursive: true });
    mkdirSync(join(userRoot, "demo"), { recursive: true });
    writeFileSync(join(root, "skills", "demo", "references", "help.md"), "help", "utf8");
    writeFileSync(join(root, "skills", "demo", "SKILL.md"), [
      "---", "name: demo", "type: default", "description: Repository version",
      "references:", "  - path: references/help.md", "---", "# Demo", "",
    ].join("\n"), "utf8");
    writeFileSync(join(userRoot, "demo", "SKILL.md"), "---\nname: demo\ndescription: User version\n---\n", "utf8");
    const catalog = new SkillCatalog(root, userRoot, { sharedSkillsRoot: false });
    catalog.forceRefresh();
    expect(catalog.get("demo")?.description).toBe("Repository version");
    expect(catalog.get("demo")?.references).toEqual([{ path: "references/help.md", description: "" }]);
    expect(catalog.diagnostics()).toEqual([expect.objectContaining({
      code: "user_skill_shadowed",
      skill_name: "demo",
      repository_path: join(root, "skills", "demo", "SKILL.md"),
      user_path: join(userRoot, "demo", "SKILL.md"),
    })]);

    writeFileSync(join(root, "skills", "demo", "SKILL.md"), [
      "---", "name: demo", "type: default", "description: Repository version updated",
      "references:", "  - path: references/help.md", "---", "# Demo", "",
    ].join("\n"), "utf8");
    catalog.forceRefresh();
    expect(catalog.get("demo")?.description).toBe("Repository version updated");

    mkdirSync(join(root, "skills", "broken"), { recursive: true });
    writeFileSync(join(root, "skills", "broken", "SKILL.md"), [
      "---", "name: broken", "references:", "  - path: ../outside.md", "---", "",
    ].join("\n"), "utf8");
    expect(() => catalog.forceRefresh()).toThrow("skill reference escapes its root");
  });

  test("reads plural commands, accepts legacy command, and rejects duplicate ownership", () => {
    const root = mkdtempSync(join(tmpdir(), "lxe-skill-commands-"));
    roots.push(root);
    mkdirSync(join(root, "skills", "plural"), { recursive: true });
    mkdirSync(join(root, "skills", "legacy"), { recursive: true });
    writeFileSync(join(root, "skills", "plural", "SKILL.md"), [
      "---", "name: plural", "commands:", "  - scripts.one", "  - scripts.two", "---", "",
    ].join("\n"), "utf8");
    writeFileSync(join(root, "skills", "legacy", "SKILL.md"), [
      "---", "name: legacy", "command: scripts.legacy", "---", "",
    ].join("\n"), "utf8");
    const catalog = new SkillCatalog(root, join(root, "missing-user"), { sharedSkillsRoot: false });
    catalog.forceRefresh();
    expect(catalog.get("plural")?.commands).toEqual(["scripts.one", "scripts.two"]);
    expect(catalog.get("legacy")?.commands).toEqual(["scripts.legacy"]);
    mkdirSync(join(root, "skills", "conflict"), { recursive: true });
    writeFileSync(join(root, "skills", "conflict", "SKILL.md"), [
      "---", "name: conflict", "commands: [scripts.two]", "---", "",
    ].join("\n"), "utf8");
    expect(() => catalog.forceRefresh()).toThrow("duplicate skill command scripts.two");
  });

  test("reuses immutable filtered snapshots until an explicit refresh", () => {
    const root = mkdtempSync(join(tmpdir(), "lxe-skills-snapshot-"));
    roots.push(root);
    const skillPath = join(root, "skills", "demo", "SKILL.md");
    mkdirSync(join(root, "skills", "demo"), { recursive: true });
    writeFileSync(skillPath, [
      "---", "name: demo", "type: default", "description: Original", "---", "# Demo", "",
    ].join("\n"), "utf8");
    const catalog = new SkillCatalog(root, join(root, "missing-user"), {
      sharedSkillsRoot: false,
    });
    catalog.forceRefresh();

    const original = catalog.snapshot();
    expect(original.names).toEqual(["demo"]);
    expect(original.modules).toEqual({ demo: "default" });
    expect(original.prompt).toContain("Original");
    expect(Object.isFrozen(original)).toBe(true);
    expect(Object.isFrozen(original.names)).toBe(true);
    expect(Object.isFrozen(original.modules)).toBe(true);

    writeFileSync(skillPath, [
      "---", "name: demo", "type: updated", "description: Updated and longer", "---", "# Demo", "",
    ].join("\n"), "utf8");
    expect(catalog.snapshot()).toBe(original);
    expect(catalog.get("demo")?.description).toBe("Original");

    catalog.forceRefresh();
    const updated = catalog.snapshot();
    expect(updated).not.toBe(original);
    expect(updated.modules).toEqual({ demo: "updated" });
    expect(updated.prompt).toContain("Updated and longer");
  });

  test("applies option changes immediately and keeps returned manifests isolated", () => {
    const root = mkdtempSync(join(tmpdir(), "lxe-skills-filter-"));
    roots.push(root);
    mkdirSync(join(root, "skills", "first"), { recursive: true });
    mkdirSync(join(root, "skills", "second"), { recursive: true });
    writeFileSync(join(root, "skills", "first", "SKILL.md"), [
      "---", "name: first", "type: default", "description: First", "commands: [scripts.first]", "---", "",
    ].join("\n"), "utf8");
    writeFileSync(join(root, "skills", "second", "SKILL.md"), [
      "---", "name: second", "type: internal", "description: Second", "---", "",
    ].join("\n"), "utf8");
    const catalog = new SkillCatalog(root, join(root, "missing-user"), { sharedSkillsRoot: false });
    catalog.forceRefresh();

    const allowed = catalog.snapshot({ allowedTypes: new Set(["default"]) });
    const disabled = catalog.snapshot({
      allowedTypes: new Set(["default"]),
      disabledNames: new Set(["first"]),
    });
    expect(allowed.names).toEqual(["first"]);
    expect(disabled.names).toEqual([]);
    expect(catalog.snapshot({ allowedTypes: new Set(["default"]) })).toBe(allowed);

    const listed = catalog.list({ allowedTypes: new Set(["default"]) });
    listed[0]!.description = "mutated";
    listed[0]!.commands.push("scripts.mutated");
    const selected = catalog.get("first", { allowedTypes: new Set(["default"]) })!;
    expect(selected.description).toBe("First");
    expect(selected.commands).toEqual(["scripts.first"]);
    selected.description = "mutated again";
    expect(catalog.get("first")?.description).toBe("First");
  });

  test("does not publish a failed refresh and retries it on the next request", () => {
    const root = mkdtempSync(join(tmpdir(), "lxe-skills-refresh-failure-"));
    roots.push(root);
    const skillPath = join(root, "skills", "demo", "SKILL.md");
    mkdirSync(join(root, "skills", "demo"), { recursive: true });
    writeFileSync(skillPath, "---\nname: demo\ndescription: Valid\n---\n", "utf8");
    const catalog = new SkillCatalog(root, join(root, "missing-user"), {
      sharedSkillsRoot: false,
    });
    catalog.forceRefresh();
    const valid = catalog.snapshot();

    writeFileSync(skillPath, "# missing frontmatter and deliberately longer\n", "utf8");
    expect(() => catalog.forceRefresh()).toThrow("skill is missing YAML frontmatter");
    expect(valid.names).toEqual(["demo"]);
    expect(valid.prompt).toContain("Valid");

    writeFileSync(skillPath, "---\nname: demo\ndescription: Recovered\n---\n", "utf8");
    expect(catalog.snapshot()).toBe(valid);
    catalog.forceRefresh();
    expect(catalog.snapshot().prompt).toContain("Recovered");
  });

  test("bounds filtered snapshot variants and evicts the oldest entry", () => {
    const root = mkdtempSync(join(tmpdir(), "lxe-skills-cache-bound-"));
    roots.push(root);
    mkdirSync(join(root, "skills", "demo"), { recursive: true });
    writeFileSync(join(root, "skills", "demo", "SKILL.md"), "---\nname: demo\ndescription: Demo\n---\n", "utf8");
    const catalog = new SkillCatalog(root, join(root, "missing-user"), { sharedSkillsRoot: false });
    catalog.forceRefresh();
    const firstOptions = { disabledNames: new Set(["unused-0"]) };
    const first = catalog.snapshot(firstOptions);
    for (let index = 1; index <= 32; index += 1) {
      catalog.snapshot({ disabledNames: new Set([`unused-${index}`]) });
    }
    expect(catalog.snapshot(firstOptions)).not.toBe(first);
  });

  test("rejects oversized and malformed user Skill manifests with the exact path", () => {
    const root = mkdtempSync(join(tmpdir(), "lxe-user-skill-validation-"));
    roots.push(root);
    const userRoot = join(root, "user-skills");
    const userSkillPath = join(userRoot, "broken", "SKILL.md");
    mkdirSync(join(root, "skills", "official"), { recursive: true });
    mkdirSync(join(userRoot, "broken"), { recursive: true });
    writeFileSync(join(root, "skills", "official", "SKILL.md"), "---\nname: official\n---\n", "utf8");
    writeFileSync(userSkillPath, "x".repeat(MAX_SKILL_MANIFEST_BYTES + 1), "utf8");
    const catalog = new SkillCatalog(root, userRoot, { sharedSkillsRoot: false });
    catalog.forceRefresh();

    expect(catalog.list().map(item => item.name)).toEqual(["official"]);
    expect(catalog.diagnostics()[0]?.message).toBe(`skill manifest exceeds ${MAX_SKILL_MANIFEST_BYTES} bytes: ${userSkillPath}`);

    writeFileSync(userSkillPath, "---\nname: [\n---\n", "utf8");
    expect(catalog.list().map(item => item.name)).toEqual(["official"]);
    catalog.forceRefresh();
    expect(catalog.diagnostics()[0]?.message).toContain(`skill YAML is invalid: ${userSkillPath}`);
  });
});
