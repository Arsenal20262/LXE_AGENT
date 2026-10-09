# 马帮 TMS 菲律宾路由交接

- 当前交付分支：`codex/pr2-mabang-tms-no-pr1`，pool-23；直接基于 `upstream/main` / `5f785341`，不含 PR1。
- 原独立提交 `cb07ec4a` 及原四层分支保留；本层业务代码与原独立提交一致。
- 完成：活跃 Skill 移除旧平台名；马帮 TMS 未写国家时按菲律宾理解，其他国家不列为候选；账号可见全仓、单次导出、合并文件与部分成功交付沿用 main。
- 入口：自然语言 → Skill discovery → `mabang-tms-export` → `lxeskill mabang-tms export run` → terminal.files → 一次 `send_files`。
- 环境变量：沿用 `LXE_MABANG_TMS_ACCOUNT` / `LXE_MABANG_TMS_PASSWORD`；未新增变量，真实凭据不纳入仓库。

## 文件范围

- `skills/mabang-tms-export/SKILL.md`
- `skills/shangman-goods-export/SKILL.md`：仅清理其说明中的旧 TMS 名称。
- `skills/southeast-asia-replenishment-workflow-map/SKILL.md`
- `packages/agent/runtime/test/tooling/skills.test.ts`
- `docs/harness/skill/current_skill_catalog.md`
- `docs/harness/skill/mabang-tms-export-validation.md`
- 本交接文档。

## 验证与边界

- 2026-10-09 去除 PR1 后复验：Skill/catalog Bun 22 passed、0 failed、112 assertions；`replenishment` 下 15 个相关 Skill 可发现，旧 `amazon_replenish` 下为 0。
- 当前 pool-23 workspace typecheck：8 个工作区全部通过。
- 扫描当前仓库 36 个活跃 Skill，旧平台名称无匹配。
- 历史验收：原独立分支 typecheck 8 个工作区通过，四平台 Python/CLI/infra 在 pool-14 为 574 passed、2 skipped。本次组合测试结果记录在仓库外交付资料，不把历史数字作为本次复验结果。
- 新的真实自然语言会话与附件 UI 验收：NOT VERIFIED。国家边界由 Skill 指令约束，不是 CLI 国家筛选。
- Runtime、Cloud、CLI、认证、导出实现和 schema 无本轮修改。

## Git 与后续

- 2026-10-09 用户批准整理不依赖 PR1 的 PR2/PR3/PR4 并启动组合服务验收。新分支先在本地准备，旧 GitHub 分支保留，不覆盖远端。
- TMS 与上马在三个共享文件上存在真实 merge-tree 冲突，按项目规范采用 `main → PR2 → PR3 → PR4`，各层只保留本层业务增量；整链不含 PR1。
- 主仓 review 串行；本层合入后，按当时最新 main 复核下一层。最终 hash、定向/组合测试及服务启动结果记录在仓库外交付资料。
- PR1 的受管状态目录权限和 SQLite 迁移均未包含。按用户选择，现场测试在新会话选择 Full access；此设置不替代 Workspace Write 的权限修复。
