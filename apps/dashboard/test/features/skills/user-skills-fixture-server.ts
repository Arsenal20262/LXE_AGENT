// Run from repository root: bun apps/dashboard/test/features/skills/user-skills-fixture-server.ts
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer } from "vite";
import { parseDashboardRpcCall } from "@lxe/desktop-protocol";
import { SkillCatalog } from "../../../../../packages/agent/runtime/src/tooling/skills";
import { UserSkillFiles } from "../../../../../packages/agent/runtime/src/tooling/user-skill-files";
const dataRoot = mkdtempSync(join(tmpdir(), "lxe-skill-acceptance-"));
const user = join(dataRoot, "skills"); const official = join(dataRoot, "official");
mkdirSync(official); mkdirSync(user);
function writeSkill(root: string, name: string, body: string) {
  const dir = join(root, name); mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "SKILL.md"), `---\nname: ${name}\ndescription: 根据工作记录生成周报，支持公司模板。\n---\n${body}`); return dir;
}
const weekly = writeSkill(user, "weekly-report", "# 周报流程\n\n整理本周完成事项、风险和下周计划。使用 assets/template.md 中的模板。");
mkdirSync(join(weekly, "assets")); writeFileSync(join(weekly, "assets", "template.md"), "# 周报模板\n\n## 完成事项\n## 问题\n## 下周计划");
writeSkill(official, "official-demo", "Official workflow"); writeSkill(user, "official-demo", "Shadowed workflow");
const broken = writeSkill(user, "broken", ""); writeFileSync(join(broken, "SKILL.md"), "---\nname: [\n---\n");
const catalog = new SkillCatalog(dataRoot, user, { repositorySkillsRoot: official, sharedSkillsRoot: false, refreshIntervalMs: 0,
  statePath: join(dataRoot, "config", "skill-states.local.json"), excludedRoots: [join(dataRoot, "trash", "skills")] });
const files = new UserSkillFiles(catalog, dataRoot);
const server = await createServer({ root: resolve("apps/dashboard"), server: { host: "127.0.0.1", port: 5203, strictPort: true },
  plugins: [{ name: "skills-fixture", configureServer(vite) {
    vite.middlewares.use("/__skills", async (req, res) => {
      try {
        let body = ""; for await (const chunk of req) body += chunk;
        const call = parseDashboardRpcCall(JSON.parse(body)); let result: unknown;
        switch (call.operation) {
          case "skills.list": { const items = catalog.list(); result = { items, total: items.length }; break; }
          case "skills.content": {
            result = catalog.get(call.input.name);
            if (!result) throw new Error(`Skill not found: ${call.input.name}`);
            break;
          }
          case "skills.user.list": { const items = files.list(); result = { items, total: items.length }; break; }
          case "skills.user.content": result = files.content(call.input.id, {}, call.input.path); break;
          case "skills.user.setEnabled": result = files.setEnabled(call.input.id, call.input.version, call.input.enabled); break;
          case "skills.user.delete": result = files.delete(call.input.id, call.input.version); break;
          default: throw new Error(`Unexpected operation: ${call.operation}`);
        }
        res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(result));
      } catch (error) { res.statusCode = 500; res.end(String(error)); }
    });
  } }],
});
try { await server.listen(); } catch (error) { rmSync(dataRoot, { recursive: true, force: true }); throw error; }
console.log("Skill acceptance: http://127.0.0.1:5203/test/features/skills/user-skills-fixture.html");
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => {
  void server.close().finally(() => { rmSync(dataRoot, { recursive: true, force: true }); process.exit(0); });
});
