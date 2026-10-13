# 最终备货建议：PR2 实施计划与交接

## 目标与架构

交付一个独立离线 `lxeskill` 命令：读取已核验的 Msku 源文件、深圳库存报告和同店同日的未关联货件快照，保留源表全部 MSKU 行，复用 PR1 的 `final_restock_formulas(row_number)` 生成 `mskulist` 34 列 XLSX，并通过项目托管 Office Kit 重算和检查结果。

实现只增加备货业务服务、薄 CLI 适配、一个 catalog 命令及产物数据集。来源校验复用 `source_verification`、深圳库存来源字段和核验元数据、未关联货件 loader 与同日校验；文件产物遵循 `dataset_dir()`。不实现新 Skill，不改旧算法、认证、数据获取或运营输入文件。

**技术栈：** Python、openpyxl、`uv`、`shared.office.execution.run_kit_bounded()`。

**规则依据：** `/Users/hym/Downloads/YHQUS转换规则.md` 优先；`/Users/hym/Downloads/Amazon_%E6%9C%80%E7%BB%88%E5%A4%87%E8%B4%A7%E5%BB%BA%E8%AE%AESkill_%E5%BC%80%E5%8F%91%E6%96%B9%E6%A1%88.md` 补充未覆盖细节；PR1 契约见 `handoff-pr1.md`。AC 保持 `AB*AD` 严格公式，LibreOffice 的 `#VALUE!` 与“零错误”验收冲突待用户后续确认，命令不得吞掉错误或报告正式验收通过。

## 全局约束

- 工作分支为 `codex/final-restock-cli`，位于 `.worktrees/pool-4`，以 PR1 `e9b88b92` 为父提交。
- Python 只用 `uv`；不访问生产 ERP，不改运营源文件。
- 保留完整源行；重复 MSKU、无法证明来源/店铺/批次一致、未知关键输入不得静默去重、分摊或当作 0。
- catalog 改动后运行 Python `lxeskill`/`infra` 契约测试和 Bun `lxeskill-command` 测试。
- 不 push、不创建远端 PR、不 merge；本地 add/commit 另行申请。

## 文件职责

- 新建 `python/lxeskill_cli/services/mabang/amazon/fba/final_restock_workbook.py`：输入来源与批次校验、全行字段映射、34 列工作簿生成、Office 重算和错误诊断。
- 新建 `python/lxeskill_cli/services/agent_cli/mabang/generate_final_restock_recommendation.py`：薄 JSON CLI 适配，映射参数、成功结果和真实异常。
- 修改 `python/lxeskill_cli/lxeskill/catalog.json`：登记一个最小命令和对应产物目录。
- 新建 `python/lxeskill_cli/tests/mabang/test_final_restock_workbook.py` 与 `test_final_restock_workbook_cli.py`：来源/覆盖/映射/格式/公式/错误语义与 CLI 契约。
- 本文件：记录最终改动、调用链、命令、验证证据、限制和下一步。

## 实施步骤

1. 先写服务测试，覆盖：源文件及深圳报告元数据/来源路径必须匹配；货件快照店铺和日期必须匹配；重复或缺失 MSKU、关键未知数值拒绝；缺少深圳行时库存留空，组合编码读取报告的 `子SKU`，缺失时回退源表本地 SKU；有效确认快照未列出的 MSKU 记为已知 0；每条源行对应一条输出行。
2. 实现唯一服务入口：用 `load_verified_source()` 取得全量源记录；直接解析深圳报告四类业务 Sheet，不调用会过滤行的 `load_inventory_rows()`；复用 `load_unlinked_shipment_quantities()` 和同日校验；按 A:AH 写入列值与 PR1 13 列公式。保持 Calibri 11、冻结 A2、自动筛选、85% 缩放及 J/S 数字格式。
3. 用 `run_kit_bounded()` 执行 `shared.office recalculate`，读取重算后的文件并统计 Excel 错误单元格。错误诊断保留到结构化 CLI 结果；若存在错误，命令结果失败并仍可交付诊断文件，不声称正式 XLSX 通过零错误验收。
4. 写 CLI 参数/成功失败测试，再登记 catalog 命令和 dataset；按仓库契约运行定向 Python 与 Bun 测试。
5. 审查所有新增文件和 catalog diff、运行 `git diff --check`、核对状态/敏感信息/无关改动，完成本交接文件；随后汇报并申请本地 add/commit。

## 最终交接

### 完成范围

- 已实现离线命令 `lxeskill replenish final-restock generate`，要求显式传入店铺、MSKU 源文件、深圳库存报告、深圳导出时对应的源文件路径和未关联货件快照。
- 服务使用 `load_verified_source()` 读取完整 MSKU 行；要求深圳报告核验元数据与源文件批次相同，显式来源路径解析到同一文件，并核对深圳报告的全量 MSKU 覆盖。重复 MSKU、孤立货件 MSKU、店铺/日期不符及缺失关键数值会报错。
- 按 A:AH 写出 `mskulist`，保留每条源 MSKU 一行，复用 PR1 `final_restock_formulas(row_number)`；生成后调用 `run_kit_bounded()` 重算并检查公式保留、行列数、缓存结果和 Excel 错误单元格。
- 命令当前在 catalog 中标为 `internal`、`exposed: false`、无 owner Skill，仍可直接从 CLI 调用。PR3 的 Skill/Agent 编排与将命令开放给 Skill 路由不属于本 PR。

### 文件与调用链

- `python/lxeskill_cli/services/mabang/amazon/fba/final_restock_workbook.py`：离线输入校验、字段映射、34 列 XLSX、Office 重算和错误诊断。
- `python/lxeskill_cli/services/agent_cli/mabang/generate_final_restock_recommendation.py`：薄 CLI 适配器，保留真实异常文本。
- `python/lxeskill_cli/lxeskill/catalog.json`：命令契约与 `replenish/final_restock_recommendation` 产物目录。
- `python/lxeskill_cli/tests/mabang/test_final_restock_workbook.py`、`test_final_restock_workbook_cli.py`：服务与 CLI 测试。
- `python/lxeskill_cli/tests/lxeskill/test_lxeskill_cli.py`、`packages/agent/runtime/test/tooling/lxeskill-command.test.ts`：catalog 契约数量与双端消费测试。
- 调用链：catalog 命令 → CLI JSON 适配器 → 备货服务 → `load_verified_source()` / 深圳报告核验信息 / `load_unlinked_shipment_quantities()` → PR1 公式模块 → `dataset_dir()` 输出 → `run_kit_bounded()` 重算与检查。

### 环境与产物

- Office 重算依赖宿主配置 `LXE_OFFICE_NODE` 并重启宿主；本环境未配置该变量。
- 成功重算后默认产物写入 `dataset_dir("replenish_final_restock_recommendation")`，文件名为 `YYYYMMDD{店铺名}补货最新.xlsx`。
- 公式错误会以坐标和真实单元格错误值返回，错误工作簿仍作为诊断产物保存，命令结果为失败。

### 验证结果

- 服务与 CLI 定向测试：`11 passed, 1 skipped`。唯一跳过项为真实 Office 端到端测试，跳过原因是 `LXE_OFFICE_NODE` 未配置。
- 复用模块回归：`184 passed`，覆盖来源核验、深圳库存、未关联快照与既有补货模块。
- 仓库要求的 Python catalog/infra 测试：`478 passed, 4 skipped, 4 warnings`。
- Bun catalog 测试：`12 pass, 0 fail, 85 assertions`。
- CLI `--help` 实际返回 `ok: true`，确认命令参数契约可加载；catalog JSON 解析、命令唯一性和数据集登记检查通过；`git diff --check` 通过。
- **NOT VERIFIED：** 此环境没有实际运行 Office 重算、没有生成最终可交付 XLSX，也未完成真实文件的零错误验收。测试中的真实 Office 端到端路径因此跳过。

### 已知限制与 PR 依赖

- 严格 AC 公式按用户确认保持 `AC=AB*AD`。当 AB 为空且 AD=50 时，LibreOffice 可能返回 `#VALUE!`；处理规则仍待后续确认。当前服务不会吞掉该错误，检查到 Excel 错误时会报告失败并保留错误示例。不得把此状态描述为零错误验收通过。
- PR2 依赖 PR1 `e9b88b92`（分支 `codex/final-restock-formulas`）的 `final_restock_formulas()` 契约；PR1 handoff 位于 `docs/harness/final-restock-recommendation/handoff-pr1.md`。
- 当前没有外部 ERP/API 取数逻辑，也没有创建新 Skill。

### Git 状态与下一步

- 当前分支：`codex/final-restock-cli`，worktree：`.worktrees/pool-4`，基线提交：PR1 `e9b88b92`；主工作区与 PR1 worktree 未修改。
- PR2 的 8 个实现、测试与交接文件已提交为 `caef4809 feat: add final restock recommendation CLI`；没有 push 或创建远端 PR。
- 用户已批准进入下一阶段。PR3 应在新聊天窗口、专用 worktree 中，以本分支最新提交为基线继续；push、创建/更新 PR 与 merge 仍需分别取得明确授权。
