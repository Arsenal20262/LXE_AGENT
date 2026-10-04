# 越南备货 PR6 交接：缺项 SKU 映射与五表保留

> 本页记录 PR6 的本地实现与已取得的验证结果。截至 2026-10-04，设计、实现和测试已按步骤提交到当前分支；尚未推送或创建 PR6。

## 接手位置与依赖

- 分支：`codex/vietnam-stock-pr6-partial-mapping`；worktree：`/Users/hym/.codex/worktrees/cf36/LXE_AGENT1`。从 PR5 提交 `dbde3e56` 开始；PR5 仍是开放的 [PR #5](https://github.com/Arsenal20262/LXE_AGENT/pull/5)，PR6 应以 PR5 分支为 base。没有在 `main` 开发。
- 已批准设计在 `docs/superpowers/specs/2026-10-04-vietnam-partial-sku-mapping-design.md`，本地实施计划在 `docs/superpowers/plans/2026-10-04-vietnam-partial-sku-mapping.md`。设计已作为独立提交 `f159a2d5` 保存。接手时先核对项目规范、分支状态和这两份文件。
- PR6 只改变当前 SKU 映射缺行、单项价格留空时的五表行为，以及对应的重算校验和说明。Desktop 仍只有一个 SKU 映射表槽；聊天命令仍无参数；没有新增推断匹配、历史数据回填或临时参数覆盖。

## 实现与调用链

Desktop 上传 `.xlsx` → `lxeskill assets vietnam sku install` → 安全 ZIP、表头、非空唯一文本 SKU、非空价格的数值与 Excel 精度校验 → 受信版本与 current 私有快照。候选表必须至少有一个有效 SKU，但行内成本、跨境价、折扣价可分别留空；坏文件、坏清单和无 current 仍在雅仓调用前失败。版本摘要、revision、同卷替换与回滚机制未改。

`skills/vietnam-stock-recommendation/SKILL.md` → `lxeskill vietnam stock recommend` → current 快照和四项配置预检 → 单轮雅仓 VN8806 来源 → 按雅仓当轮 SKU 集合左连接运营映射 → 写入五表 → 项目 Office Kit 重算 → 验证公式与缓存 → 只发布最终 XLSX。雅仓有而映射没有的 SKU 仍出现在主表和三个来源表；B/G/AE/AJ 留空，H/AC/AF:AM 按直接依赖留空。映射行存在但热销标记空白时 B 仍取 `2`；任何显式数值 `0` 都保留为数值。独立的来源字段与计算结果照常填写。

| 文件 | 本 PR 作用 |
| --- | --- |
| `python/lxeskill_cli/services/vietnam_replenishment/{asset_contract,sku_map_store}.py` | 接受非空稀疏映射表，继续拒绝不合法的非空价格。 |
| `python/lxeskill_cli/services/vietnam_replenishment/{formula_dependencies,workbook,recalculation}.py` | 共享直接依赖矩阵、左连接写入、条件公式、Office 重算结果检查；独立数值列与可计算映射列的缓存类型也受校验。 |
| `python/lxeskill_cli/tests/vietnam_replenishment/{test_asset_contract,test_sku_map_store,test_workflow,test_workbook,test_recalculation,test_pr5_integration}.py` | 上传、工作流、公式缓存和隔离的完整 CLI 流程回归。 |
| `docs/harness/vietnam-stock-recommendation/{design,asset-contract,current-sku-map,handoff-pr6}.md`、`docs/harness/skill/current_skill_catalog.md`、`skills/vietnam-stock-recommendation/SKILL.md`、实施计划 | 现行口径、交付要求与接手信息；PR3/PR5 历史文档未改。 |

## 环境与验证证据

- 此 worktree 单独运行过 `uv sync --frozen`；未复用其他 checkout 的 `.venv`，未改锁文件。测试从仓库根以 `uv run --frozen --no-sync pytest` 执行，`UV_CACHE_DIR` 指向私有临时缓存。
- Office 测试使用现有构建中的 `LXE_OFFICE_NODE`、`LXE_OFFICE_CLI` 只读路径。实际运行 `test_pr5_integration.py` 的新缺项用例，结果 **1 passed**；假雅仓只导出一次，三条 SKU 保留在主表与三个来源表，验证了独立结果和空白依赖结果。Office 用例没有被跳过。
- 越南备货测试目录加两个业务 CLI 测试文件的定向回归结果为 **238 passed, 0 skipped**（8.00 秒）。这包括 Office Kit 重算与最终五表校验，没有连接生产雅仓。
- 复跑上述定向回归时，从仓库根运行以下命令。本次 Office Kit 路径来自本机已有构建，仅作只读测试资源；若该构建已移走，先换成项目当前可用的配套路径。

  ```sh
  LXE_OFFICE_NODE=/Users/hym/.codex/worktrees/3062/LXE_AGENT1/build/desktop-runtime/darwin-arm64/node/node \
  LXE_OFFICE_CLI=/Users/hym/.codex/worktrees/3062/LXE_AGENT1/build/desktop-runtime/darwin-arm64/office/node_modules/@deepseek-ai/libreoffice-kit/lib/cli.js \
  UV_CACHE_DIR=/private/tmp/lxe-pr6-uv-cache \
  uv run --frozen --no-sync pytest \
    python/lxeskill_cli/tests/vietnam_replenishment \
    python/lxeskill_cli/tests/lxeskill/test_vietnam_recommendation_cli.py \
    python/lxeskill_cli/tests/lxeskill/test_vietnam_sku_management_cli.py -q -rs
  ```
- `uv build --wheel --offline` 成功；wheel 包含新增 `formula_dependencies.py` 和内置 `skeleton.xlsx`。`dist/` 受 Git 忽略。
- 只读检查一份工作区外的既有运营映射表：1108 个 SKU，其中 2 个折扣价留空；新校验器接受该文件。该表没有复制到仓库或交给生产雅仓。`git diff --check` 已通过。
- 仓库全量测试按规范留待上游 PR 合并、最终同步 `main` 后仅运行一次；本次不把定向结果称为全量验收。

四项长期参数仍由 Desktop 注入 `LXE_VIETNAM_WEIGHT_30D`、`LXE_VIETNAM_WEIGHT_15D`、`LXE_VIETNAM_WEIGHT_7D`、`LXE_VIETNAM_EXCHANGE_RATE`；数据根目录用 `LXE_DATA_ROOT`。雅仓凭据只走现有配置，不进入代码、交接页或 Git。PR6 不新增环境变量。

## 已知边界、Git 状态与下一步

- 本机只验证了合成雅仓数据和隔离资产状态。Windows 安装包、文件占用行为，以及真实雅仓 VN8806 导出和业务 XLSX 均需现场验收；没有进行生产请求。对应利润率的其他输入齐全时，显式零价触发既有除零诊断；其他依赖输入缺失时按依赖留空，零价始终不能当作空价处理。
- 本地设计提交为 `f159a2d5`；随后四个独立提交依次为稀疏映射校验 `a120774a`、五表左连接与条件公式 `1f9333a3`、重算结果校验 `d1b19e01`、隔离集成测试 `28232d32`。现行文档、实施计划和本交接页作为最后一个文档提交；该提交的哈希以当前分支 `git log -1` 为准。提交前工作区只余这七个文档路径；提交后应再次核对 `git status`。没有修改锁文件、提交真实业务表或触及其他模块。推送、创建 PR6、合并各需单独确认。
- 下一步确认 PR5 分支和 PR6 差异，汇报范围、验证和限制，分别申请推送与创建 PR6。PR5 及其上游仍未合并；最终合并前在当前开发分支同步最新 `main` 并处理任何冲突，再做一次全量验证。PR6 收口后用本页在新任务接手下一模块。
