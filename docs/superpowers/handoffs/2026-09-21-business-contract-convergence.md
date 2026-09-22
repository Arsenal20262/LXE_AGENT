# 四平台业务契约收敛交接

## 用户目标与授权边界

- 目标：在保证雅仓、智慧印尼、智汇 TMS 和马帮巴西海外仓导出准确的前提下，收敛 Skill/catalog/terminal 契约，删除平台专用的 Runtime 前置路由和重复 Tool。
- 用户在 2026-09-21 明确要求“直接执行”，期望第二天可以直接启动测试。
- 固定目录：`/Users/hym/Documents/ChatGPT/项目合并/LXE_AGENT-integration`。
- 固定分支：`feature-amazon-replenish-multi-platform`；不得切换到 `main`。
- 不新建 Worktree、Pool 或项目目录；后续任务必须直接使用上述现有目录。
- 不更改现有管理员授权、GitHub Token、平台账号、生产开关或本机密钥链配置。
- 可在每个核心阶段通过测试、diff 和本交接文档收口后在当前分支提交；严禁 push，push 仍需用户单独确认。

## 设计与计划

- 已确认设计：`docs/superpowers/specs/2026-09-21-business-contract-convergence-design.md`
- 实施计划：`docs/superpowers/plans/2026-09-21-business-contract-convergence.md`
- 设计文档已在当前分支的 `bdf6bd5c` (`docs: define business contract convergence`) 提交。
- 本交接时分支比远端 `origin/feature-amazon-replenish-multi-platform` 领先 1 个提交；未 push。

## 已完成：Task 1 雅仓四仓与全局入库契约

### 行为收敛

- 仓库集合和顺序仍只使用现有常量：`MY8801`、`PH8805`、`TH8802`、`VN8806`。
- `inventory-sales` 和 `inventory-current-snapshot` 支持单仓、任意有效多仓，省略仓库时默认四仓；执行顺序固定。
- `inbound-listing-time` 单独请求时，无论用户说单仓、多仓还是四仓，normalizer 都将仓库意图规范化为 omitted，effective warehouses 表示全四仓；planner 始终只产生一个 `global/all` 任务，不传仓库参数。
- 混合请求中，所选仓库只限制库存/销量；入库/上架仍是一份覆盖四仓的全局文件。
- Skill 和 catalog 已明确 `resolved` 必须使用复数 `values` 数组；单选也不接受 `value`。
- 没有修改雅仓 HTTP endpoint、登录、认证、分页、下载、工作簿验证、合并、重试、频控或风控代码。

### 本阶段修改文件（尚未提交）

- `python/lxeskill_cli/services/yacang/export_intent.py`
- `python/lxeskill_cli/tests/yacang/test_export_intent.py`
- `python/lxeskill_cli/tests/yacang/test_export_workflow.py`
- `python/lxeskill_cli/tests/yacang/test_cli_boundaries.py`
- `python/lxeskill_cli/tests/yacang/fixtures/export_intent_eval.json`
- `skills/yacang-export-workflow-map/SKILL.md`
- `python/lxeskill_cli/lxeskill/catalog.json`
- `python/lxeskill_cli/tests/lxeskill/test_fba_skill_docs.py`
- `docs/superpowers/plans/2026-09-21-business-contract-convergence.md`
- `docs/superpowers/handoffs/2026-09-21-business-contract-convergence.md`

### 已验证

1. 先跑红：新测试稳定暴露 4 个“入库仍保留单/多仓”旧契约失败，实现后消失。
2. `uv run pytest -q python/lxeskill_cli/tests/yacang/test_export_intent.py python/lxeskill_cli/tests/yacang/test_export_workflow.py python/lxeskill_cli/tests/yacang/test_cli_boundaries.py` → `298 passed`。
3. `uv run pytest -q python/lxeskill_cli/tests/lxeskill python/lxeskill_cli/tests/infra` → `332 passed, 4 warnings`；警告是现有 aiohttp/Python 3.12 deprecation warning。
4. `bun test packages/agent/runtime/test/tooling/lxeskill-command.test.ts` → `4 pass, 0 fail`。
5. `git diff --check` → 通过。
6. 上述测试均为本地 fixture/单元测试，未发起任何生产网络请求。

## 现有本地状态与保护项

- Desktop 开发服务已在本轮之前主动停止，避免定时认证维护干扰测试；不需要清理或重建授权。
- 不要删除、覆盖或暂存以下用户原有 untracked 文件：
  - `HANDOFF-2026-09-19-auth-refresh-and-dev-launcher.md`
  - `HANDOFF-2026-09-19-four-platform-recovery.md`
  - `HANDOFF.md`
  - `PROBLEM-SUMMARY-2026-09-19.md`
  - `docs/harness/four-platform-export-integration-sop.md`
  - `docs/superpowers/plans/2026-09-18-four-platform-isolation-and-main-sync.md`
- 不得使用 `git reset --hard`、`git checkout --`、`git clean` 或其他破坏性命令。

## 新任务立即执行的顺序

1. 阅读本交接、设计和实施计划，执行 `git status --short --branch`，确认目录、分支和上述改动仍在。
2. 检查 Task 1 diff，将上述 Task 1 文件连同本计划和本交接精确暂存，不要包含用户的其他 untracked 文件；提交信息用 `fix: converge yacang warehouse intent contract`。
3. 按计划从 Task 2 “马帮巴西海外仓状态同义词规范化”继续，每个任务都遵循测试先行、最小实现、回归、diff 审查和交接更新。
4. 后续 Task 3–6 严格按计划执行：紧凑 terminal boundary、四平台 adapter、通用敏感输入 pending 模式、通用 catalog confirmation 门禁，然后才删除旧的 `shangman_captcha` Tool 和智汇 pre-turn/translator。
5. 不得先删旧路径再补替代实现；只有新通用机制和行为测试通过后才能删除。
6. 结束前执行 Task 7 完整验证，包括 workbook 内容、四仓集合、敏感信息、无关改动、`git diff --check`、类型检查和项目现有完整测试。
7. 最后启动现有 Desktop 开发服务做本地 smoke test，记录精确启动命令、URL/端口、可测场景和已知限制；不要开启生产开关或发起真实平台导出。

## 注意的实现原则

- 不新增“四平台总路由”、“总 Skill”、平台关键词 Runtime pre-filter 或每回合额外意图模型调用。
- 验证码迁移必须进入现有通用问题基础设施的 sensitive-image pending 模式，不能把答案、图片、Token 或 Cookie 写进 transcript/terminal/log/Git。
- 智汇确认必须由 catalog 元数据和通用 `UserQuestionService` 执行，绑定 session/turn/tool-call/精确规范化命令，一次性消费；Runtime 不得再出现 `if (zhihui)` 式分支。
- Python terminal 只返回模型下一步需要的业务摘要、恢复信息和附件；不再暴露整份内部 payload。
- 保证导出准确性的方式是不改现有平台底层实现，通过 fixture/工作簿验证端到端输入参数、Sheet、表头、行数和仓库值。

## 当前未知与限制

- Task 1 尚未 `git add`/`git commit`；下一任务先精确提交，不得混入无关文件。
- 还没有实施 Task 2–7，不得宣称四平台整体改造已完成。
- 最终本地 Desktop 启动和人工测试尚未执行。
- 未连接任何真实第三方平台，因此最终只能宣称本地模拟/契约验证成功，除非用户以后单独授权生产验收。
