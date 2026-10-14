# 最终备货建议：PR2 实施计划与交接

## 目标与架构

交付一个独立离线 `lxeskill` 命令：读取已核验的 Msku 源文件、深圳库存报告和同店同日的未关联货件快照，保留源表全部 MSKU 行，复用 PR1 的 `final_restock_formulas(row_number)` 生成 `mskulist` 34 列 XLSX，并通过项目托管 Office Kit 重算和检查结果。

实现只增加备货业务服务、薄 CLI 适配、一个 catalog 命令及产物数据集。来源校验复用 `source_verification`、深圳库存来源字段和核验元数据、未关联货件 loader 与同日校验；文件产物遵循 `dataset_dir()`。不实现新 Skill，不改旧算法、认证、数据获取或运营输入文件。

**技术栈：** Python、openpyxl、`uv`、`shared.office.execution.run_kit_bounded()`。

**规则依据：** 2026-10-13 用户最新截图选择 XLSX 提取记录中的 AA（V/W 任一空则空）、AC（AB/AD 任一空则空，否则相乘）及 AD 表头“单件重量”，覆盖此前三项 Markdown 优先选择；其余沿用已确认规则。公式更正归 PR1，本 PR 已 rebase 接入 `70bc0568`；任何实际重算错误仍必须报告失败。

## 全局约束

- 工作分支为 `codex/final-restock-cli`，位于 `.worktrees/pool-4`，当前基于 PR1 `70bc0568`。
- Python 只用 `uv`；不访问生产 ERP，不改运营源文件。
- 保留完整源行；重复 MSKU、无法证明来源/店铺/批次一致、未知关键输入不得静默去重、分摊或当作 0。
- catalog 改动后运行 Python `lxeskill`/`infra` 契约测试和 Bun `lxeskill-command` 测试。
- 2026-10-14 最新授权：独立审核通过后本地提交 PR2，并安全同步到 PR3、保留其未提交修改。PR3 暂不 commit；不 push、merge 或访问生产 ERP。

## 文件职责

- 新建 `python/lxeskill_cli/services/mabang/amazon/fba/final_restock_workbook.py`：输入来源与批次校验、全行字段映射、34 列工作簿生成、Office 重算和错误诊断。
- 新建 `python/lxeskill_cli/services/agent_cli/mabang/generate_final_restock_recommendation.py`：薄 JSON CLI 适配，映射参数、成功结果和真实异常。
- 修改 `python/lxeskill_cli/lxeskill/catalog.json`：登记一个最小命令和对应产物目录。
- 新建 `python/lxeskill_cli/tests/mabang/test_final_restock_workbook.py` 与 `test_final_restock_workbook_cli.py`：来源/覆盖/映射/格式/公式/错误语义与 CLI 契约。
- 本文件：记录最终改动、调用链、命令、验证证据、限制和下一步。

## 实施步骤

1. 先写服务测试，覆盖：源文件及深圳报告核验元数据必须匹配；货件快照店铺和日期必须匹配；重复或缺失 MSKU、关键未知数值拒绝；深圳报告必须覆盖全部源 MSKU，库存数值未知时留空，组合编码读取报告的 `子SKU`，缺失时回退源表本地 SKU；有效确认快照未列出的 MSKU 记为已知 0；每条源行对应一条输出行。
2. 实现唯一服务入口：用 `load_verified_source()` 取得全量源记录；直接解析深圳报告四类业务 Sheet，不调用会过滤行的 `load_inventory_rows()`；复用 `load_unlinked_shipment_quantities()` 和同日校验；按 A:AH 写入列值与 PR1 13 列公式。保持 Calibri 11、冻结 A2、自动筛选、85% 缩放及 J/S 数字格式。
3. 用 `run_kit_bounded()` 执行 `shared.office recalculate`，读取重算后的文件并统计 Excel 错误单元格。错误诊断保留到结构化 CLI 结果；若存在错误，命令结果失败并仍可交付诊断文件，不声称正式 XLSX 通过零错误验收。
4. 写 CLI 参数/成功失败测试，再登记 catalog 命令和 dataset；按仓库契约运行定向 Python 与 Bun 测试。
5. 审查所有新增文件和 catalog diff、运行 `git diff --check`、核对状态/敏感信息/无关改动，完成本交接文件；随后汇报并申请本地 add/commit。

## 最终交接

### 完成范围

- 已实现离线命令 `lxeskill replenish final-restock generate`，当前要求显式传入店铺、MSKU 源文件、深圳库存报告和未关联货件快照，共四项输入。
- 服务使用 `load_verified_source()` 读取完整 MSKU 行；要求深圳报告核验元数据与源文件批次相同，并核对深圳报告的全量 MSKU 覆盖。重复 MSKU、孤立货件 MSKU、店铺/日期不符及缺失关键数值会报错。
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

- Office 重算依赖宿主配置 `LXE_OFFICE_NODE` / `LXE_OFFICE_CLI`。本轮测试使用临时准备的锁定版本运行环境，具体路径见末节；没有修改应用宿主的持久配置。
- 成功重算后默认产物写入 `dataset_dir("replenish_final_restock_recommendation")`，文件名为 `YYYYMMDD{店铺名}补货最新.xlsx`。
- 公式错误会以坐标和真实单元格错误值返回，错误工作簿仍作为诊断产物保存，命令结果为失败。

### 初始提交验证结果（历史）

- 服务与 CLI 定向测试：`11 passed, 1 skipped`。唯一跳过项为真实 Office 端到端测试，跳过原因是 `LXE_OFFICE_NODE` 未配置。
- 复用模块回归：`184 passed`，覆盖来源核验、深圳库存、未关联快照与既有补货模块。
- 仓库要求的 Python catalog/infra 测试：`478 passed, 4 skipped, 4 warnings`。
- Bun catalog 测试：`12 pass, 0 fail, 85 assertions`。
- CLI `--help` 实际返回 `ok: true`，确认命令参数契约可加载；catalog JSON 解析、命令唯一性和数据集登记检查通过；`git diff --check` 通过。
- **NOT VERIFIED：** 此环境没有实际运行 Office 重算、没有生成最终可交付 XLSX，也未完成真实文件的零错误验收。测试中的真实 Office 端到端路径因此跳过。

### 已知限制与 PR 依赖

- AA/AC 更正已通过 rebase 从 PR1 接入；本 PR 未独立复制公式。项目 Office Kit 的离线小样本实际重算已通过，真实业务同批次输入验收仍为 NOT VERIFIED，服务继续对任何 Excel 错误返回失败并保留错误示例。
- PR2 依赖 PR1 `70bc0568`（分支 `codex/final-restock-formulas`）的 `final_restock_formulas()` 契约；PR1 handoff 位于 `docs/harness/final-restock-recommendation/handoff-pr1.md`。
- 当前没有外部 ERP/API 取数逻辑，也没有创建新 Skill。

### 初始提交 Git 状态（历史）

- 当前分支：`codex/final-restock-cli`，worktree：`.worktrees/pool-4`，基线提交：PR1 `e9b88b92`；主工作区与 PR1 worktree 未修改。
- PR2 的 8 个实现、测试与交接文件已提交为 `caef4809 feat: add final restock recommendation CLI`；没有 push 或创建远端 PR。
- 用户已批准进入下一阶段。PR3 应在新聊天窗口、专用 worktree 中，以本分支最新提交为基线继续；push、创建/更新 PR 与 merge 仍需分别取得明确授权。

## 2026-10-13 截图规则更新（同步前记录）

- 本轮只修改本 PR 的文件服务、文件测试和本 handoff（3 个文件）。AD 表头及行映射键改为“单件重量”，数值仍按克；原始输入字段、输出位置 AD、CLI/catalog 与产物路径不变。
- 正式 Office 小样本测试改为预期零公式错误，并检查清货行 AC 为空、有效海运重量仍为数量乘克数；没有放宽错误检测。该测试须在本分支接入 PR1 新公式且 Office 配置完成后实际运行。
- 本 worktree 执行 `UV_CACHE_DIR=/private/tmp/lxe-final-restock-uv-cache uv run --frozen --no-sync pytest python/lxeskill_cli/tests/mabang/test_final_restock_workbook.py python/lxeskill_cli/tests/mabang/test_final_restock_workbook_cli.py -q -rs`：**11 passed, 1 skipped**。通过项包括 AD 表头和 50 克源值保持；跳过真实 Office 测试，原因为 `LXE_OFFICE_NODE` 未配置。
- **NOT VERIFIED：** PR1 新公式与本 PR 的组合回归、真实 Office 端到端及最终零错误 XLSX。当前测试未伪装为已同步上游。
- Git HEAD 仍为 `afc9528f`。本轮未 add/commit、未 rebase；PR1 新公式尚未进入本 checkout。待用户批准后分别提交本层修改，再同步 PR1，复核后向 PR3 传播。

## 2026-10-13 已授权同步与 Office 回归

- 用户随后提供原始参考 XLSX 并批准分别本地提交、备份及 PR1 → PR2 → PR3 rebase。旧 PR2 HEAD `afc9528f` 已保存在 `codex/final-restock-cli-before-xlsx-20261013`，原提交和工作区均保留。
- 本层表头、测试和交接更正已独立提交并 rebase 到 PR1 `70bc0568`，无冲突。同步后更正提交为 `a2139ab0`；原 CLI / 交接提交分别映射为 `32661513` / `8028bb1e`，`git range-diff` 确认两者内容未改变。PR1 的服务、测试和 handoff 与其分支完全一致。
- 只读核验用户原件：`/Users/hym/Downloads/20261012Amazon-Yihaiqian-US补货最新.xlsx`，SHA-256 `aafdd45f445e19530c0b1f79ad650a3c6c242473e76101b9dc051a6bb811faf7`。34 个表头、2003 行的 26039 个公式均与本次实现一致；冻结 A2、筛选 A1:AH2004、缩放 85%、J 的 `0.0000` / S 的 `0.00` 格式符合约定。原件公式缓存全部为空，没有覆盖原文件。
- 按既有 `scripts/prepare-office-runtime.ts` 以 frozen 安装准备 Kit 0.1.3 / native engine 0.1.3，校验 733 个文件。没有修改依赖版本、lockfile 或共享 `.venv`。测试命令从本 worktree 根执行：

```sh
LXE_OFFICE_NODE=/Users/hym/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node \
LXE_OFFICE_CLI=/private/tmp/lxe-final-restock-office-runtime/office/node_modules/@deepseek-ai/libreoffice-kit/lib/cli.js \
UV_CACHE_DIR=/private/tmp/lxe-final-restock-uv-cache \
uv run --frozen --no-sync pytest python/lxeskill_cli/tests/mabang/test_final_restock_recommendation.py python/lxeskill_cli/tests/mabang/test_final_restock_workbook.py python/lxeskill_cli/tests/mabang/test_final_restock_workbook_cli.py -q -rs --tb=short
# 148 passed，无 skip
```

- 实际走文件服务 → `run_kit_bounded()` → 项目 Office Kit 重算，四行合成输入生成完整 34 列文件，公式错误数为 0；验证清货行 AC 留空、海运重量正确、完整行覆盖、组合 SKU、格式和缓存。此前因环境缺失跳过的 Office 用例本轮已实际通过。
- **NOT VERIFIED：** Microsoft Excel 原生计算、真实业务同批次 MSKU / 深圳库存 / 未关联货件完整输入集、模型自然语言入口与文件发送。参考结果表不替代业务源输入集，没有访问生产 ERP。未执行全仓库测试或 build/typecheck，留待最终合并阶段按规范处理。
- 收口记录采用本 PR 独立文档提交；最新 HEAD 以本分支 `git log -1` 为准。接下来由 PR3 rebase 接入本层并执行契约回归。main 未修改，没有 push、远端 PR 或 merge。

## 2026-10-14 重复输入收敛（首轮审核记录）

- 按用户确认删除 `shenzhen_source_msku_xlsx_path`：catalog 的 property/required、CLI 转传、服务参数及物理路径相等检查。当前输入为店铺和三个本地文件；不增加兼容别名、抽象层或新路由。
- 保留原源表内容指纹、店铺、核验快照及来源元数据比较、深圳报告 MSKU 覆盖、货件同店同日与完整性检查。未修改业务公式、旧备货服务、公共核验模块、Office 执行能力或参数来源导出服务。
- 用新契约测试先在旧实现得到 4 failed / 1 passed，失败均指向重复参数仍存在或仍被转传；更正后通过。正式 Office 文件测试使用原件的等内容复制源表，确认不再错误依赖原物理路径，同时仍保留全部行和零公式错误。
- 增补服务层店铺/源指纹拒绝用例，并将批次冲突用例覆盖到“源内容不同”和“内容相同但核验快照不同”；CLI 测试验证四项输入及旧 flag 的 `unknown option` 失败，不静默接受旧接口。
- 从本 worktree 根、使用自己的 `.venv`，设置上一节 Office 两变量、`PYTHONDONTWRITEBYTECODE=1` 和临时 `UV_CACHE_DIR` 后，执行 `uv run --frozen --no-sync pytest -p no:cacheprovider python/lxeskill_cli/tests/mabang/test_final_restock_workbook.py python/lxeskill_cli/tests/mabang/test_final_restock_workbook_cli.py python/lxeskill_cli/tests/mabang/test_source_verification.py -q -rs --tb=short`：**61 passed，无 skip**，含实际 Office Kit 重算。
- catalog 必需双端回归：Python `tests/lxeskill` / `tests/infra` **477 passed, 4 skipped, 4 warnings**（4 skip 为 Windows 专属，warning 为原有 aiohttp 提示）；Bun `lxeskill-command.test.ts` **12 pass，85 assertions**。Python 模拟服务器测试在沙箱外执行，仅访问本机测试服务器。
- 本轮只修改本 PR 的 catalog、CLI、文件服务、两份测试和本 handoff，共六个文件；diff 已检查，旧参数在活跃实现中无残留，旧 flag 仅保留于拒绝回归用例及历史记录。没有 Git 写操作。
- HEAD 保持 `797436bd`。PR3 需更新其所属 Skill、契约测试和 handoff；本轮不通过跨分支编辑或 rebase 将上游服务/目录覆盖到 PR3。组合验证需明确区别于真正分支同步，后者等待审核及新的 Git 授权。

## 2026-10-14 最终审核与授权收口

- 从 PR1 `70bc0568` 核对 PR2 完整差异，并逐项审查本轮六个文件。代码无需进一步修复：catalog、CLI 和服务均为店铺与三个文件；旧 flag 由既有参数解析器返回 `invalid_arguments / unknown option`。本次仅修正上文“缺少深圳行”表述，实际始终要求完整 MSKU 覆盖。
- `load_verified_source()` 的店铺、内容指纹、快照摘要、绑定标记和数量核验未变；深圳报告完整元数据相等、MSKU 覆盖、货件同店同日校验未变。AST 比对确认 14 个服务辅助函数均未改变，公式、原备货实现及公共核验模块无改动。
- 可删减项已落实为重复参数和路径相等检查；沿用现有 catalog → CLI → 离线服务 → Office 调用链，没有新增公共抽象、适配层、状态或 Runtime 路由。本次参数整改未发现 P0–P3 缺陷或阻塞问题。
- 正式 pool-4 根目录、本工作区独立 `.venv`，使用上一节 Office 两变量，执行 `uv run --frozen --no-sync pytest -p no:cacheprovider python/lxeskill_cli/tests/mabang/test_final_restock_workbook.py python/lxeskill_cli/tests/mabang/test_final_restock_workbook_cli.py python/lxeskill_cli/tests/mabang/test_source_verification.py python/lxeskill_cli/tests/lxeskill python/lxeskill_cli/tests/infra -q -rs --tb=short`：**538 passed, 0 failed, 4 skipped, 4 warnings**。跳过项为 Windows 路径/进程测试，warning 为既有 aiohttp 提示；实际 Office Kit 重算通过。日志：`/private/tmp/final-restock-pr2-close-python.log`。
- Bun `packages/agent/runtime/test/tooling/lxeskill-command.test.ts`：**12 pass, 0 fail, 85 assertions**。工作差异和相对 PR1 的 `git diff --check` 均通过。
- 仅将上述六个 PR2 文件纳入 `fix: remove redundant final restock source path` 本地提交，提交号以本分支 `git log -1` 为准。PR3 后续通过依赖同步继承此修复，自身 Skill/契约/交接修改保持未提交。未执行 push、merge 或生产调用。
- 离线代码具备 Review 条件；主仓库 Review 仍按 PR1 → PR2 → PR3 串行。真实业务完整输入、Microsoft Excel 原生计算、模型选择及附件发送仍为 **NOT VERIFIED**，不将本次定向测试称为全仓库验证。
