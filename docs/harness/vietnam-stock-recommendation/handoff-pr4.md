# 越南备货 PR4 交接：确定性生成入口

> 本页记录 PR4 当前已实现并验证的范围。Git 提交、推送和创建 PR 须按用户批准分别进行；状态以本页末尾和实际仓库为准。

## 接手位置与依赖

- 开发分支：`codex/vietnam-stock-pr4-workflow`；worktree：`/Users/hym/.codex/worktrees/e36c/LXE_AGENT1`。起点为个人 PR3 分支 `codex/vietnam-stock-pr3-workbook` 的 `a8dd62aa325c5e09fb590f4c3283fb905519b6d4`，创建前已与远端核对；没有在 `main` 开发。
- PR4 应以个人 [PR #3](https://github.com/Arsenal20262/LXE_AGENT/pull/3) 所在分支为 base。PR3 依赖 PR2，PR2 依赖 PR1；合并前按序核对 base 和提交关系。
- 本模块只接通聊天中的越南备货生成。普通业务人员从 Desktop 上传或替换 SKU 映射表、长期保存四参数属于 PR5；本 PR 不接聊天临时覆盖。

## 已实现内容与调用链

用户提出“生成越南备货清单” → `skills/vietnam-stock-recommendation/SKILL.md` → `lxeskill vietnam stock recommend` → `services.agent_cli.vietnam_replenishment.generate.run()` → `services.vietnam_replenishment.workflow.generate_current_vietnam_recommendation()` → PR2 `export_vietnam_sources()` → PR3 `generate_vietnam_workbook()` → 项目 Office Kit 重算与校验 → terminal 中唯一的 `output_xlsx` 附件候选 → Skill 调用一次 `send_files`。

工作流先读取 `vietnam_sku_parameter_map/current`，复制为本轮私有快照并校验内容；缺失时提示上传，损坏、空表或任一 SKU 缺成本、跨境价、折扣价时返回具体诊断，均在雅仓导出前停止。通过后仅导出一次 VN8806 同轮库存动销、当前库存和全局仓库产品。结果使用 PR3 内置五表骨架，生成独立目录中的 `越南备货清单.xlsx`；只有最终文件有效时才返回成功。失败不交付原始雅仓文件、映射表快照或中间工作簿，也不自动重试生产雅仓。current 在导出期间被替换，不会改变本轮快照。

| 路径 | 本 PR 作用 |
| --- | --- |
| `python/lxeskill_cli/services/vietnam_replenishment/workflow.py`、`tests/vietnam_replenishment/test_workflow.py` | current 快照和导出前校验、单轮组合、失败清理、合成端到端验证。 |
| `python/lxeskill_cli/services/agent_cli/vietnam_replenishment/`、`tests/lxeskill/test_vietnam_recommendation_cli.py` | 无参数命令、真实错误脱敏诊断、单文件交付契约。 |
| `python/lxeskill_cli/lxeskill/business.py`、`catalog.json` | CLI 模块命名、命令与 `vietnam_recommendations` dataset；修正旧模板和映射表槽位说明。 |
| `skills/vietnam-stock-recommendation/SKILL.md`、`skills/southeast-asia-replenishment-workflow-map/SKILL.md`、`skills/yacang-export/SKILL.md` | 越南生成、东南亚路由与独立雅仓导出的业务口径。 |
| `config/skill-labels.json`、`docs/harness/skill/current_skill_catalog.md` | 中文名称和能力清单。 |
| `packages/agent/runtime/test/tooling/{lxeskill-command,skills}.test.ts`、`python/lxeskill_cli/tests/{infra/test_dataset_registry,lxeskill/test_lxeskill_cli}.py` | 双端 catalog、dataset 和 Skill 注册断言。 |
| `docs/superpowers/specs/2026-10-03-vietnam-pr4-workflow-design.md`、`docs/superpowers/plans/2026-10-03-vietnam-pr4-workflow.md`、本页 | 已批准的设计、实施计划和交接。 |

业务口径沿用 PR3：成本、跨境价和折扣价只取当前映射表中相同 SKU 的显式值；缺失热销标记默认 `2`。上架时间取仓库产品 `创建时间`，总在途取当前库存列表 `在途数量`。四参数当前固定使用 `RecommendationConfig()` 默认值 `0.8 / 0.8 / 0 / 3900`。用户明确要求本次改用其他值时，Skill 会说明暂不支持并停止，不忽略该要求。

## 环境与验证

- Python 用当前 worktree 独立 `.venv`，经 `uv sync --frozen` 创建；JS 用 `bun install --frozen-lockfile --ignore-scripts`。没有共用或复制其他 worktree 的 `.venv`，未修改锁文件。
- 开发测试提供宿主 Office Kit 路径 `LXE_OFFICE_NODE` 和 `LXE_OFFICE_CLI`，不需要新增凭据。现有雅仓凭据只经桌面注入 `LXE_YACANG_MOBILE`、`LXE_YACANG_PASSWORD`；数据根目录仍用项目现有 `LXE_DATA_ROOT` 配置。不得把这些值写入日志或 Git。
- 从仓库根运行 `uv run --frozen --no-sync pytest -q python/lxeskill_cli/tests/vietnam_replenishment`：**137 passed**，含项目 Office Kit 的真实重算合成用例；核对了五张表、商品创建时间及当前库存在途，未调用生产雅仓。代码复核发现并修正三类必填价格空白仍触发雅仓的问题；新增三项测试先复现失败，再证实缺值时零雅仓调用。
- 因 catalog 是 Python/Bun 双端契约，运行 `uv run --frozen --no-sync pytest -q python/lxeskill_cli/tests/lxeskill python/lxeskill_cli/tests/infra`：在允许本地测试服务绑定回环地址的环境下 **384 passed, 2 skipped**。初次沙箱内测试服务无法绑定 `127.0.0.1`，属于环境限制，重跑后通过。
- 从仓库根运行 `bun test packages/agent/runtime/test/tooling/lxeskill-command.test.ts packages/agent/runtime/test/tooling/skills.test.ts`：**23 passed, 0 failed**；`bun run --cwd packages/agent/runtime typecheck` 退出码为零。`uv run --frozen --no-sync python -m lxeskill doctor` 返回 `ok=true`，识别 46 条 catalog 命令、40 条业务命令、37 个 Skill。修复预检后重跑 `uv build --wheel --offline` 成功；wheel 中包含新 Python 入口、工作流、catalog 和 PR3 五表骨架。
- `git diff --check` 已通过。完整仓库测试按项目规范留待最终合并前、更新至最新 `main` 后运行一次；本阶段没有在生产雅仓进行联调。

## 已知边界与下一步

- PR5 需完成 Desktop 端候选映射表内容校验、安全替换 current、四参数长期设置及对应配置优先级。PR4 每次对 current 私有快照做内容校验，但目前 Desktop 还没有完整业务上传入口；没有 current 时能明确拒绝且不调用雅仓。
- 真实雅仓当前库存导出及最终 Windows 安装包尚需现场联调。生产账号、密码及业务价格没有进入本 PR；源文件和 Office 中间文件不作为附件交付。
- Git 状态：PR4 从 PR3 提交 `a8dd62aa` 建分支，按已批准的四步组织提交：`fd15314a`（设计与计划）、`bd73d4a5`（current 快照和五表工作流）、`7a6bcb82`（CLI、Skill 与双端契约）及本交接页。开发分支尚未推送或创建 PR；push、创建 PR、merge 分别征求用户确认。提交后应按项目规范核对最新 `main` 和 PR3 base 的关系，冲突先报告。PR4 收口后另开任务窗口处理 PR5。
