# 上马印尼路由交接

## 分支、完成范围与入口

- 当前交付分支：`codex/pr3-shangman-no-pr1`，pool-24；基于新的 PR2 `codex/pr2-mabang-tms-no-pr1`，整链基线为 `upstream/main` / `5f785341`，不含 PR1。
- 原 `codex/shangman-skill-routing` / pool-13 / `e57801e1` 保持 clean；main 基线 5f785341。
- “上马”“上马印尼”统一指印尼，不追问国家；其他国家不列为上马候选，也不启动上马登录。
- 入口：自然语言 → shangman-goods-export → lxeskill shangman export run；login_required 按既有 shangman-login 恢复，再返回导出；terminal.files → send_files 交付一份原始 XLSX。
- Credentials、AuthStore、GoodsExporter、persisted authentication、credential revision 和生产门禁均沿用 main；有效 token 的正常导出不碰验证码。
- “最多恢复一次”仍是 Skill/Agent Contract，未新增 Runtime 跨回合计数器、Broker、captcha_channel 或旧 challenge 恢复。
- 既有桌面凭据/环境注入不变，无新增变量或真实凭据入 Git。

## 本层文件与语义融合

- skills/shangman-goods-export/SKILL.md
- skills/shangman-login/SKILL.md
- skills/southeast-asia-replenishment-workflow-map/SKILL.md
- packages/agent/runtime/test/tooling/skills.test.ts
- docs/harness/skill/current_skill_catalog.md
- 本交接；原独立 acceptance 报告已合并。

共享的商品 Skill、流程入口和测试保留 TMS 菲律宾与上马印尼双方规则、全部对应断言及旧名清理；不用 ours/theirs 覆盖。

## 验证与限制

- 2026-10-09 去除 PR1 后复验：本层 Skill/catalog Bun 22 passed、0 failed、121 assertions，保留 TMS 菲律宾、上马印尼及四平台权限可发现性断言。
- 当前 pool-24 workspace typecheck：8 个工作区全部通过。
- 历史四层组合 pool-22 曾通过 Python 590 / 2 skipped、Bun 58 和 typecheck；这些包含 PR1，不能作为当前无 PR1 组合的验收。新组合结果记录在仓库外交付资料。
- 当前自动化验证不调用生产导出/login API；真实自然语言及附件 UI 验收由用户执行。
- 业务 Workflow、认证、command ownership、生产门禁、send_files 和 terminal 语义零改动。PR1 的状态权限和 SQLite 迁移未包含。
- Windows-native/安装包/Excel/WPS 仍 NOT VERIFIED。本次现场测试按用户选择在新会话使用 Full access。

## Git 与下一步

2026-10-09 用户批准整理不依赖 PR1 的三层交付并启动组合测试。仅移植原 PR3 六文件业务增量，修正本交接的依赖和验证记录；旧独立分支、旧四层分支及 GitHub 分支均保留。TMS 与上马三个共享文件存在真实冲突，采用 `main → PR2 → PR3 → PR4`，每层自身可验证，主仓串行 Review。PR2 合入后按当时最新 main 复核本层，避免重复变更；当前新分支只在本地，推送结果另行记录。
