# PR9 交接：越南备货在线与离线能力拆分

> 状态：新 Clean Stack PR9 已在本地迁入；本页随 PR9 提交。尚未 push 或创建 PR。测试结果以本页记录的实际命令输出为准；未列出的真实模型聊天、生产雅仓和安装版行为不视为已验证。

## 分支与依赖

- 当前分支/Pool：`codex/vietnam-clean-pr9-offline`，`pool-15`。
- 基线：新 PR8 HEAD `871f69188f0ac7cdaf07952608706fc8b2b48797`。此前 PR1～PR8 的职责与提交均未在本分支改写。
- PR8 提供通用 `attachment_count=3` 受控附件集合；PR9 不修改 Runtime 生产架构，也不回写 PR1～PR8。
- Clean Stack 起点为组长 `main` 的 `5f78534174b76461a352bd326aabba33f2942b48`；本层直接接在新 PR8 后面，无额外 main 同步提交。

## 目标与边界

在线入口保持 `lxeskill vietnam stock recommend`：受信 SKU current → 雅仓 VN8806 三报表 → 本地 Source → Workbook → Office 重算 → Validation → 最终 XLSX。

新增离线入口 `lxeskill vietnam stock generate`：用户已有三份 XLSX → 本地 Source 分类和校验 → 同一受信 SKU current、配置、Workbook、Office、Validation → 最终 XLSX。离线不得调用雅仓或回退在线；任一步失败均不交付部分文件。

`services/vietnam_replenishment/source_parser.py` 负责本地文件及业务来源校验，`yacang_sources.py` 只负责在线采集。parser 复用 `services.yacang.validation` 中纯本地 XLSX 校验函数；该模块只读文件，不依赖认证、session 或网络 workflow。直接 Python CLI 仍须自行验证恰好三份、XLSX、重复路径或同一文件别名、三种来源各一份、表头/行和 VN8806 约束，不能只依赖 Runtime。

不修改补货算法、Excel 公式、雅仓请求实现、SKU 资产机制、Desktop 配置或 shared.office。内部 Source、Office、Validation 函数不逐个暴露给模型。

## Agent 与 CLI Contract

| 用户目标 | 入口 | 附件与交付 |
| --- | --- | --- |
| 只要雅仓原始报表 | `yacang-export` | 按原导出 Skill 的报表契约 |
| 已有三份报表生成越南备货 | `vietnam_replenishment_generate_offline` | 同一当前轮或合规紧邻轮的完整三 XLSX 集合；只交付最终 XLSX |
| 直接查询在线越南备货 | `vietnam_replenishment_generate` | 沿用已绑定 SKU current；单份新 SKU 表先 bind 成功再生成 |

离线 catalog 命令路径是 `vietnam stock generate`，输入字段为 `source_xlsx`，`managed_execution` 声明 `attachment_argument: source_xlsx` 和 `attachment_count: 3`。Desktop 的 `managed_lxeskill` 由宿主提供受控附件集合，模型不传任意本地路径；直接 CLI 用三条显式来源路径。裸三附件用途不明时先澄清，不猜文件角色；单份 SKU 表仍按 PR7 的绑定/查询选择处理。

离线输出只能描述为“基于用户提供的已有报表生成”；程序不证明三份文件属于同一次导出，也不证明它们是今日实时数据。`send_files` 只在 terminal 成功且 `files` 恰好包含 `output_xlsx` 时调用一次，不能发送原始报表或中间工作簿。

已知来源边界：有数据行的动销和当前库存报表逐行校验仓库必须为 `VN8806`；若其中一张表没有数据行，仅凭该 XLSX 的表头不能证明原始导出时设置了哪个仓库筛选。离线入口不会把这种无法证明的来源说成“已核实同批次 VN8806 实时导出”。

## 修改范围

本层只迁入 PR9 的来源拆分、离线入口、Agent 契约、测试和文档。核心功能来自已批准的 19 文件范围，之后确认的口语预选及说明修正也归入本层：

- 来源与 Workflow：`python/lxeskill_cli/services/vietnam_replenishment/` 下的 `source_parser.py`、`yacang_sources.py`、`workflow.py`，以及仅调整类型导入的 `operator_map.py`、`preparation.py`、`recalculation.py`、`workbook.py`。
- 正式入口与契约：`python/lxeskill_cli/services/agent_cli/vietnam_replenishment/generate_offline.py`、`python/lxeskill_cli/lxeskill/catalog.json`、`skills/vietnam-stock-recommendation/SKILL.md`。
- 测试：`python/lxeskill_cli/tests/vietnam_replenishment/test_yacang_sources.py`、`test_workflow.py`，`python/lxeskill_cli/tests/lxeskill/test_vietnam_offline_cli.py`、`test_lxeskill_cli.py`，`packages/agent/runtime/test/tooling/lxeskill-command.test.ts`、`skills.test.ts`、`skill-preselection.test.ts`。`test_lxeskill_cli.py` 只同步新增命令影响的四个 catalog/infra 契约用例，未放宽断言。
- 文档与路由：`docs/harness/vietnam-stock-recommendation/design.md`、本交接页、`docs/harness/skill/current_skill_catalog.md`、`skills/southeast-asia-replenishment-workflow-map/SKILL.md`、`skills/vietnam-stock-recommendation/SKILL.md`，以及保留为历史实施步骤的计划页。设计页按新 PR1～PR9 代码重写，不沿用旧 branch、HEAD 或未实施状态。

新 PR8 的 `docs/harness/managed-lxeskill-execution/handoff-multi-attachment.md` 保持原样，未因旧 PR9 补丁中缺失而删除。旧链和旧工作区保持备份，不纳入新 PR9 diff。

## 本轮验证

- 新 Clean Stack PR9 分支、仓库根运行：`uv run --frozen --no-sync pytest -q python/lxeskill_cli/tests/vietnam_replenishment python/lxeskill_cli/tests/lxeskill python/lxeskill_cli/tests/infra` → **714 passed，7 skipped**。测试使用合成来源和假雅仓调用；离线测试用一旦调用就抛错的 sentinel 证明雅仓在线调用为零。在线仍调用既有雅仓适配器并进入共同生成函数。
- 随后给本 worktree 指向本机已准备的项目 Office Kit，仅重跑此前因 Kit 未配置而跳过的 5 个定向用例 → **5 passed**。其中在线/离线在相同来源、SKU current 和配置下，经真正 Office 重算后的五表核心结果一致；另覆盖在线基础数据、非默认配置、受信版本管理与稀疏 SKU 聊天绑定。这里仍使用合成报表和假雅仓调用，没有请求生产接口。本机 Kit 路径不写入仓库。
- `bun test packages/agent/runtime/test/tooling/lxeskill-command.test.ts packages/agent/runtime/test/tooling/skill-preselection.test.ts packages/agent/runtime/test/tooling/skills.test.ts packages/agent/runtime/test/tooling/managed-lxeskill-attachment.test.ts packages/agent/runtime/test/tooling/managed-lxeskill-tool.test.ts` → **73 passed，0 failed**。覆盖 catalog、离线口语预选及 PR8 多附件契约；不等于真实模型聊天验收。
- `bun run --cwd packages/agent/runtime typecheck` → **通过**。
- `git diff --check` 与 `git diff --cached --check` → **通过**（最终提交前复核）；没有调用生产接口。
- 真实模型三报表聊天、真实雅仓及安装版：**NOT VERIFIED**。用户已有报表无法凭文件内容证明同批次或今日实时；空报表表头无法证明导出时仓库筛选。

## 环境与交付

长期四参数沿用既有 `LXE_VIETNAM_WEIGHT_30D`、`LXE_VIETNAM_WEIGHT_15D`、`LXE_VIETNAM_WEIGHT_7D`、`LXE_VIETNAM_EXCHANGE_RATE` 注入；未设置时使用项目默认值。SKU 参数从受信 current 获取，离线用户不传 SKU 文件路径。失败不回退在线，成功只返回一个经校验的最终 XLSX；聊天端再按 terminal 文件契约发送。

## 下一步

Git 状态：本层仅在本地提交，未 push、未创建 PR；最终工作区状态以提交后的 `git status` 复核结果为准。本地提交后复核单层文件范围、祖先关系、工作区、diff、路径及敏感信息。先只提交新 PR1 供组长串行评审；本层需等待前序层依次合并并按当时 main 复核后再提交。push、创建 PR 与合并需分别获得批准。
