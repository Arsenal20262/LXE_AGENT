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
- 本交接更新时分支比远端 `origin/feature-amazon-replenish-multi-platform` 领先 2 个提交；未 push。

## 已完成：Task 1 雅仓四仓与全局入库契约

### 行为收敛

- 仓库集合和顺序仍只使用现有常量：`MY8801`、`PH8805`、`TH8802`、`VN8806`。
- `inventory-sales` 和 `inventory-current-snapshot` 支持单仓、任意有效多仓，省略仓库时默认四仓；执行顺序固定。
- `inbound-listing-time` 单独请求时，无论用户说单仓、多仓还是四仓，normalizer 都将仓库意图规范化为 omitted，effective warehouses 表示全四仓；planner 始终只产生一个 `global/all` 任务，不传仓库参数。
- 混合请求中，所选仓库只限制库存/销量；入库/上架仍是一份覆盖四仓的全局文件。
- Skill 和 catalog 已明确 `resolved` 必须使用复数 `values` 数组；单选也不接受 `value`。
- 没有修改雅仓 HTTP endpoint、登录、认证、分页、下载、工作簿验证、合并、重试、频控或风控代码。

### 本阶段已提交文件

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

### Git 收口

- 已在当前分支提交：`8a129cb7` (`fix: converge yacang warehouse intent contract`)。
- 该提交仅包含上述 Task 1 文件、实施计划和交接文档；未包含用户的其他 untracked 文件。
- 未 push；后续不得 push，除非用户再次单独确认。

### 已验证

1. 先跑红：新测试稳定暴露 4 个“入库仍保留单/多仓”旧契约失败，实现后消失。
2. `uv run pytest -q python/lxeskill_cli/tests/yacang/test_export_intent.py python/lxeskill_cli/tests/yacang/test_export_workflow.py python/lxeskill_cli/tests/yacang/test_cli_boundaries.py` → `298 passed`。
3. `uv run pytest -q python/lxeskill_cli/tests/lxeskill python/lxeskill_cli/tests/infra` → `332 passed, 4 warnings`；警告是现有 aiohttp/Python 3.12 deprecation warning。
4. `bun test packages/agent/runtime/test/tooling/lxeskill-command.test.ts` → `4 pass, 0 fail`。
5. `git diff --check` → 通过。
6. 上述测试均为本地 fixture/单元测试，未发起任何生产网络请求。

## 已完成：Task 2 马帮巴西海外仓状态同义词契约（待提交）

- `replenishment-workflow-map` 和 catalog 现在使用同一个状态语义表：
  - 未签、未签收、待签、待签收、还没签收、尚未签收 → `allocation_pending_default_3m`。
  - 已签、已签收、已经签收、签收完成 → `allocation_signed_before_3m`。
  - 有巴西海外仓上下文但未指定签收状态的单据/调拨单据 → `allocation_both`。
- 裸词“签收”、“调拨”、“单据”现在明确要求澄清，不猜测已签或待签。
- `validate_brazil_export_parameters(...)` 仍只接受现有四个 canonical enum；其 docstring 明确自然语言翻译归选中 Skill，不进入全局 Runtime filter。
- 没有改动马帮认证、HTTP、分页、下载、工作簿、生产时间范围或重试/频控。

### Task 2 验证

1. 新增表驱动红测试，实现前稳定暴露 catalog 缺失同义词、Skill 缺失模糊边界以及 validator docstring 说明缺失。
2. `uv run pytest -q python/lxeskill_cli/tests/mabang/test_brazil_overseas_*.py python/lxeskill_cli/tests/lxeskill/test_fba_skill_docs.py` → `51 passed`。
3. `uv run pytest -q python/lxeskill_cli/tests/lxeskill python/lxeskill_cli/tests/infra` → `332 passed, 4 warnings`；警告是现有 aiohttp/Python 3.12 deprecation warning。
4. `bun test packages/agent/runtime/test/tooling/lxeskill-command.test.ts` → `4 pass, 0 fail`。
5. `git diff --check` → 通过。未发起真实马帮 API 调用。

## 现有本地状态与保护项

- 2026-09-22 已用 `LXE_DASHBOARD_DEV_PORT=5237 bun run desktop:dev` 完成本地 smoke test：Vite 、Gateway 和 Agent CLI 已就绪，`http://127.0.0.1:5237/` 返回 HTTP 200。未开启生产开关、未发起真实平台导出。
- 不要删除、覆盖或暂存以下用户原有 untracked 文件：
  - `HANDOFF-2026-09-19-auth-refresh-and-dev-launcher.md`
  - `HANDOFF-2026-09-19-four-platform-recovery.md`
  - `HANDOFF.md`
  - `PROBLEM-SUMMARY-2026-09-19.md`
  - `docs/harness/four-platform-export-integration-sop.md`
  - `docs/superpowers/plans/2026-09-18-four-platform-isolation-and-main-sync.md`
- 不得使用 `git reset --hard`、`git checkout --`、`git clean` 或其他破坏性命令。

## 新任务立即执行的顺序

1. 阅读本交接、设计、实施计划和本交接的 Task 2 补充文档，执行 `git status --short --branch`，确认工作目录仍为此目录、分支仍为 `feature-amazon-replenish-multi-platform`。
2. 等待用户对 Task 2 的精确提交授权。提交后从 Task 3 “紧凑 terminal-data 边界”开始；严格按计划实现 Task 3–6，然后才删除旧的 `shangman_captcha` Tool 和智汇 pre-turn/translator。
3. 不得先删旧路径再补替代实现；只有新通用机制和行为测试通过后才能删除。
4. 结束前执行 Task 7 完整验证，包括 workbook 内容、四仓集合、敏感信息、无关改动、`git diff --check`、类型检查和项目现有完整测试。

## 注意的实现原则

- 不新增“四平台总路由”、“总 Skill”、平台关键词 Runtime pre-filter 或每回合额外意图模型调用。
- 验证码迁移必须进入现有通用问题基础设施的 sensitive-image pending 模式，不能把答案、图片、Token 或 Cookie 写进 transcript/terminal/log/Git。
- 智汇确认必须由 catalog 元数据和通用 `UserQuestionService` 执行，绑定 session/turn/tool-call/精确规范化命令，一次性消费；Runtime 不得再出现 `if (zhihui)` 式分支。
- Python terminal 只返回模型下一步需要的业务摘要、恢复信息和附件；不再暴露整份内部 payload。
- 保证导出准确性的方式是不改现有平台底层实现，通过 fixture/工作簿验证端到端输入参数、Sheet、表头、行数和仓库值。

## 当前未知与限制

- Task 1 已提交；本交接更新尚未提交，应与 Task 2 的交接更新一起精确提交，不得混入无关文件。
- 还没有实施 Task 2–7，不得宣称四平台整体改造已完成。
- 本地 Desktop 启动 smoke test 已执行；四平台业务的人工终验尚未执行。
- 未连接任何真实第三方平台，因此最终只能宣称本地模拟/契约验证成功，除非用户以后单独授权生产验收。
