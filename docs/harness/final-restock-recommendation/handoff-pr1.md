# 最终备货建议：PR1 计算公式交接

## 目的与当前状态

为新「最终备货建议」提供独立的 13 列计算公式，保持旧备货算法与报表契约。
本阶段交付内部公式服务；文件读取、34 列 XLSX、CLI 和 Skill 分别在后续阶段接入。
没有另写 Python 数值算法，避免 Excel 与 Python 两套规则产生差异。

- 日期：2026-10-13。
- 分支：`codex/final-restock-formulas`；worktree：`.worktrees/pool-3`。
- 基线：`9f36647a`。
- Git：用户已批准本次 3 个新增文件的本地 add/commit；提交说明为 `feat: add final restock recommendation formulas`，提交标识以本分支 `git log -1` 为准。没有 push、远端 PR 或 merge，主工作区保持干净。
- 本阶段开发已批准。后续 PR 必须新开聊天窗口，并由用户确认后启动。

## 改动与 Review 位置

| 文件 | 职责与 Review 重点 |
|---|---|
| `python/lxeskill_cli/services/mabang/amazon/fba/final_restock_recommendation.py` | 唯一入口 `final_restock_formulas(row_number)`，返回列字母到 Excel 公式的字典；检查 I/J/R/S、U 优先级、V/W 旺季规则、X/Y/Z/AA/AB/AC。 |
| `python/lxeskill_cli/tests/mabang/test_final_restock_recommendation.py` | 公式契约、引用平移、非法行号，以及离线重算的业务边界。 |
| 本文件 | 来源、测试证据、已知限制及后续接入契约。 |

调用链：后续 CLI/文件服务 → `final_restock_formulas(Excel数据行号)` → 将返回公式写入对应列 → 既有 Office 能力重算。
当前入口只接受 2～1048576 的整数行号，返回 I、J、R、S、U、V、W、X、Y、Z、AA、AB、AC 共 13 列，公式含前导 `=`。
源值检查和工作簿生命周期由调用方负责；本模块没有文件、网络、认证或数据库操作。

## 规则来源与已确认决策

以用户确认的最新 `YHQUS转换规则.md` 公式为最高依据；开发方案仅补充未覆盖的细节，不能覆盖明确公式。

- 规则来源：`/Users/hym/Downloads/YHQUS转换规则.md`，SHA-256：`69082a327d4395ac6ef7afa50b7e40b485affc13a0b554d47706dc5f3d518165`。
- 开发方案文件名：`Amazon_%E6%9C%80%E7%BB%88%E5%A4%87%E8%B4%A7%E5%BB%BA%E8%AE%AESkill_%E5%BC%80%E5%8F%91%E6%96%B9%E6%A1%88.md`，位于 Downloads；SHA-256：`ce35746becfbdfb06c114ceb3f34dd2cc6db2f63adcfa5af0a0d03eecfdd4e52`。
- 2026-10-13 用户明确确认 U 采用开发方案附录 IF 顺序：S≤40 急发，40<S≤70 空运；仅在 S>70 且 J>5 分支内判断海运或空运＋海运。
- AA 只检查 W 非空，不增加开发方案中的 V 非空门槛；Y 空字符串按 0 扣减。
- AC 严格为 `AB*AD`，不加入开发方案的空值保护。Z 保留自身已有空值保护。
- 旺季按当前开启效果实施；清货抑制建议，不补只取消加成；加成封顶 120 天，没有新增配置开关。
- PR2 表头 AD 应为「单件重量(g)」，重量计算结果单位为克。
- 公式逐条对照了开发方案附录：实际比较 13 列，只有 AA、AC 两处按更高优先级规则产生差异。未读取或核验方案引用的最新 20261012 工作簿，不宣称与其实际内容完成比对。

## 验证结果

所有命令从本 worktree 根目录运行，使用本 worktree 自己的 `.venv`，已检查解释器和 services 包指向本 checkout。
`UV_CACHE_DIR=/private/tmp/lxe-final-restock-uv-cache` 仅用于本机沙箱测试，不是产品配置；依赖已由 `scripts/wt-claim` 冻结同步。

```sh
UV_CACHE_DIR=/private/tmp/lxe-final-restock-uv-cache uv run --frozen --no-sync pytest python/lxeskill_cli/tests/mabang/test_final_restock_recommendation.py -q
# 129 passed：13 项契约/行号测试，116 组离线重算场景，无 skip。

UV_CACHE_DIR=/private/tmp/lxe-final-restock-uv-cache uv run --frozen --no-sync pytest python/lxeskill_cli/tests/mabang/test_replenishment_formula_sheet.py python/lxeskill_cli/tests/mabang/test_mabang_store_msku_replenishment.py -q
# 69 passed：旧备货公式表及计算服务定向回归。
```

离线重算使用本机 `LibreOfficeDev 26.8.0.0.alpha0`，只创建 pytest 临时小样本工作簿，不构成正式 XLSX 输出实现。
测试覆盖趋势 9/10 与 0.85/1.2 边界、日销权重、库存分项、未取整的可售天数、运输顺序、旺季关键词及冲突优先级、120 天封顶、扣减、4/5/14/15 十位取整和完整行联动。
测试环境没有 LibreOffice 时，116 个重算场景会明确 skip 并标注 NOT VERIFIED，不能当作重算通过。
没有改 catalog，因此本阶段不运行双端 catalog 契约测试；没有运行全量测试。
已审查全部 3 个新增文件的 diff，并逐文件执行 `git diff --no-index --check`（覆盖未跟踪文件），以及常规 `git diff --check`、凭据模式检查和双工作区状态检查；没有发现空白错误、凭据或无关改动。

## 已知限制与验收阻塞

**AC 原式与“零错误单元格”要求存在已验证的冲突。** AB 的公式结果为 `""`、AD=50 时，`AB*AD` 在本次 LibreOffice 重算中得到 `#VALUE!`；AB 真正空白时为 0；AB=10、AD 真正空白时也为 0。
测试明确记录这些原式行为，不把错误伪装为空白。本 PR 没有悄悄修公式，也不能因此宣称正式输出达到零错误要求。
PR2 正式文件验收前需要用户确认如何解决公式与零错误要求之间的冲突；后续不能自行改为 IF/IFERROR，也不能交付含错误的工作簿并称验证通过。

NOT VERIFIED：Microsoft Excel 原生计算、真实业务数据覆盖、生产 ERP、CLI、完整 34 列文件与新 Skill 端到端交付。

## 可删减性复审

只新增一个拥有完整业务公式的函数和测试；没有新增 Tool、Runner、Registry、模板 DSL、数据类、数据库、配置中心或中间命令。
V/W 共享的加成表达式只是函数内局部变量，未对外增加接口。
现有 `replenishment_formula_sheet.py` 使用另一套布局和补货算法，直接复用其计算会改变新规则；没有修改旧模块，也没有复制其文件、缓存或执行能力。
删除当前函数会丢失本阶段的 13 列规则实现；检查后未发现可删除的新增包装层。

## 下一聊天窗口：PR2 接入须知

PR2 依赖本阶段公式契约，须等待用户确认后在新聊天窗口开始，按 Stacked PR 处理。不要在本聊天推进下一阶段。
新增最小 CLI/catalog 与完整 34 列文件能力；现有数据获取、认证、Office 执行和产物机制继续复用。

- 主表读取优先复用 `source_verification.load_verified_source()` 的全量源记录；旧 `store_msku_replenishment.load_inventory_rows()` 不是全量 MSKU 主表。
- 深圳库存导出已有 `source_msku_xlsx_path` 和核验元数据，必须与本次 Msku 来源关联；组合编码沿用现有报告字段，不自创拼接格式。
- 未关联货件快照沿用既有 loader 的店铺、数量、确认空集及汇总校验。
- 保留全部源行、未知值与真实 0 的区别；未定义的重复 MSKU 分摊不自行处理。
- 生产 Office 执行复用 `shared.office.execution.run_kit_bounded()`，文件目录遵循现有 dataset 机制，不复制测试中的 LibreOffice 调用作为生产实现。
- catalog 改动需运行 Python lxeskill/infra 与 Bun lxeskill-command 双端定向测试。
- 若后续发现本 PR 自身公式问题，修复归位本 PR；接口变化时从最早受影响层重新复核。

2026-10-13 用户已明确批准本阶段的本地 add/commit；push、创建远端 PR、merge 均需各自明确授权。
