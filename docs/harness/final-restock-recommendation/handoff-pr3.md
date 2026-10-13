# 最终备货建议：PR3 Skill 入口与命令契约

## 目标与最小计划

让“最终备货建议”及“将原始备货建议量表转换成新表”进入独立 Skill，使用明确的离线输入调用 PR2 命令；普通备货继续走现有流程。

- 分支：`codex/final-restock-skill`，Pool：`.worktrees/pool-6`。
- 当前基线：PR2 `797436bd`，父链含 PR1 `70bc0568`。本轮按用户授权完成 PR1 → PR2 → PR3 依赖同步，各层更正归位原分支；初始基线 `afc9528f` 已备份。
- 依据：Downloads 中的 `Amazon_%E6%9C%80%E7%BB%88%E5%A4%87%E8%B4%A7%E5%BB%BA%E8%AE%AESkill_%E5%BC%80%E5%8F%91%E6%96%B9%E6%A1%88.md` 的 PR-A；公式以用户确认规则及 PR1 handoff 为准。
- 用户已批准本地下一阶段开发与必要本地提交；push、远端 PR、merge 须另行确认。

### 改动文件与职责

| 文件 | 最小改动 |
|---|---|
| `skills/replenishment-final-restock/SKILL.md`（新增） | 新意图、明确离线输入、一次命令调用、真实失败及产物交付；独立于旧计算规则，因此单独建 Skill。 |
| `skills/replenishment-workflow-map/SKILL.md` | 新意图优先路由到新 Skill，不运行旧完整流程。 |
| `skills/replenishment-calculate/SKILL.md` | 明确普通备货与最终备货建议的选择边界。 |
| `python/lxeskill_cli/lxeskill/catalog.json` | 将既有命令改为 business / exposed，并归属新 Skill；参数和实现不变。 |
| `python/lxeskill_cli/tests/lxeskill/test_final_restock_skill.py`（新增） | 新命令发现、唯一归属、完整参数、缺输入、源店铺不匹配及错误产物 JSONL 契约。 |
| Python `test_lxeskill_cli.py`、Bun `lxeskill-command.test.ts` / `skills.test.ts` | 更新数量并覆盖命令归属、实际 Skill 发现与权限过滤。 |
| `docs/harness/skill/current_skill_catalog.md`、本文件 | 更新清单与本阶段验证/交接。 |

### 实施顺序

1. 先补新入口的 catalog/发现测试，运行确认当前命令仍是 internal，新增 Skill 尚未发现。
2. 新建 Skill，列明五个必需参数：`store_name`、`msku_source_xlsx_path`、`shenzhen_inventory_report_xlsx_path`、`shenzhen_source_msku_xlsx_path`、`unlinked_shipments_snapshot_path`；已有输入直接计算，缺失或名称含糊先澄清，不启动生产取数。
3. 修改最小 metadata 与新旧 Skill 边界，更新清单和既有数量断言。
4. 运行 Python `lxeskill` / `infra` 和 PR2 文件/CLI 定向测试；运行 Bun `lxeskill-command.test.ts` / `skills.test.ts`；实际执行 CLI doctor/help。缺参沿用既有业务校验诊断，不假定 CLI 通用层会执行普通 JSON Schema required 校验。
5. 检查 diff、空白、敏感信息、状态和 PR1/PR2 保护情况，补齐 handoff 后做一次本地功能提交。

## 复用与边界

调用链：Skill discovery / workflow map → 新 Skill → `lxeskill replenish final-restock generate` → PR2 CLI/文件服务 → PR1 公式 → 既有 Office 执行与产物机制。

店铺身份由已有源文件核验判断，不能用模型猜测别名或把本地不匹配说成生产店铺不存在。缺少规范店铺名或任何输入时先报告缺失项；源核验的实际异常仍由既有 CLI 返回。此阶段不额外调用生产店铺查询或导出。

本 PR 不拥有公式、输入映射、数据源、Office 执行、旧 42 列报表或公共架构。2026-10-13 用户最新确认 AA 的 V/W 双空值门槛、AC 的 AB/AD 空值保护及 AD 表头“单件重量”；分别由 PR1/PR2 更正，本 PR 仅同步说明。其他失败文件仍仅作诊断，不声称零错误验收通过。

## 完成范围

- 新增 `replenishment-final-restock`，沿用 `replenishment` 权限域，独占 `lxeskill replenish final-restock generate`。catalog 仅修改既有命令的 visibility、owner_skills、exposed；参数、返回字段、失败产物及执行服务保持 PR2 契约。
- 新旧入口描述明确区分主触发词与转换别名；普通备货仍用原 map/计算，单纯发送旧流程最终文件不切换规则。缺输入先澄清，不扩大为在线采集。
- 真实源核验测试确认错误店铺返回请求/快照名称；五类缺参返回对应输入诊断。JSONL 测试确认成功和公式错误都会保留既有字段、产物路径，错误仍为 `ok=false`。
- 范围共 10 个文件：3 个 Skill 文件、1 个 catalog、4 个测试文件、2 个文档。没有新增业务服务、命令、环境变量或依赖。

## 初始提交测试证据（历史）

2026-10-13，从本 worktree 根执行。已确认解释器位于 `pool-6/.venv`，services 导入路径指向本 checkout，没有共享其他 worktree 的虚拟环境。

```sh
UV_CACHE_DIR=/private/tmp/lxe-final-restock-uv-cache uv run --frozen --no-sync pytest python/lxeskill_cli/tests/lxeskill python/lxeskill_cli/tests/infra python/lxeskill_cli/tests/mabang/test_final_restock_workbook.py python/lxeskill_cli/tests/mabang/test_final_restock_workbook_cli.py -q --tb=short -rs
# 502 passed, 5 skipped, 4 warnings

bun test packages/agent/runtime/test/tooling/lxeskill-command.test.ts packages/agent/runtime/test/tooling/skills.test.ts
# 25 pass, 0 fail, 177 assertions

UV_CACHE_DIR=/private/tmp/lxe-final-restock-uv-cache uv run --frozen --no-sync lxeskill doctor
# ok=true：47 catalog commands / 41 business commands / 38 Skill files / 31 owners / 41 declarations

UV_CACHE_DIR=/private/tmp/lxe-final-restock-uv-cache uv run --frozen --no-sync lxeskill replenish final-restock generate --help
# ok=true：business，owner=replenishment-final-restock，五个原有必需参数
```

- Python 初次在沙箱内运行有 59 项本地模拟服务器相关失败；在沙箱外重跑上述同一范围后全部通过，没有为绕过失败修改生产代码。4 条 warning 为已有 aiohttp 废弃提示。
- 跳过 4 项 Windows 路径/进程归属测试，另 1 项 PR2 真实 Office 端到端测试因 `LXE_OFFICE_NODE` 未配置跳过。
- 新增 12 项 Python 用例覆盖公开发现、scope 隔离、五类缺参、真实源店铺不匹配和成功/失败 terminal；Bun 覆盖实际 manifest 发现、类型权限过滤、归属和新旧描述边界。
- 测试先确认了 internal/未发现状态导致失败；缺参测试最初误假定通用 CLI 执行所有 required 校验，核对调用链后改为验证真实业务诊断，未增加公共校验层。
- 未运行全量测试或 build/typecheck：改动是入口 Markdown、catalog metadata 和测试，依项目规范仅运行直接相关检查；全量验证留待最终合并阶段。

## 环境、限制与下一步

- Office 继续使用 PR2 的 `LXE_OFFICE_NODE` / `LXE_OFFICE_CLI`；本轮已配置临时测试运行环境并完成实际 Kit 重算，路径与准备方式见 PR2 handoff。本次没有修改应用宿主持久配置。`UV_CACHE_DIR` 仅是本次测试缓存，不是产品新增环境变量。
- 正式产物目录仍由 `replenish_final_restock_recommendation` dataset 解析；命名及输出由 PR2 所有，Skill 只交付 terminal 的真实 files。
- **NOT VERIFIED：** 真实模型自然语言选 Skill/文件发送、Microsoft Excel 原生计算、真实业务同批次源文件的最终 XLSX 验收。静态描述与契约检查不等同于模型行为验证；terminal 测试使用隔离模拟服务，实际 Office 重算证据来自独立文件服务端到端测试。
- 本阶段不需要生产 ERP/API；店铺校验仅确认离线来源一致性，不代表查过生产店铺列表。
- AA/AC 及表头规则现已确认，各层提交和依赖同步已完成。下一步准备真实同源离线输入并完成业务验收；模型入口和文件发送仍需单独验收。若要自动取数，需另开范围明确的阶段，不在本 PR 中追加。
- 主仓库 review 仍按 PR1 → PR2 → PR3 串行；本 PR 依赖 PR2 最新提交，不提前 merge 或机械同步整条 stack。

## 初始提交 Git 交接（历史）

- 本阶段实现、测试与本交接采用一个本地提交：`feat: expose final restock recommendation skill`；提交号以 `git log -1 codex/final-restock-skill` 为准。
- 收口检查覆盖全部 10 个改动文件（含 3 个新增文件）、空白和凭据模式。PR1/PR2 服务、CLI 适配器、业务测试及 lockfile 相对 `afc9528f` 无差异。
- PR1 保持 `e9b88b92`，PR2 保持 `afc9528f`，两个工作区及主工作区均未被本任务修改；其他已领取 pool 不参与本任务。
- 没有 push、远端 PR 或 merge。保留 `pool-6` 和 stacked 分支供评审，后续阶段原则上在新聊天、独立 pool 中继续。

## 2026-10-13 截图规则更新（同步前记录）

- 本轮仅修改本 PR 的 Skill 说明及本 handoff（2 个文件），去掉过时的“严格 AC、不允许加空值保护”要求，改为用户新确认的 AA/AC/AD 口径；错误报告和 Office 未验证提示保留。
- 运行 `bun test packages/agent/runtime/test/tooling/skills.test.ts`：**13 pass, 0 fail, 92 assertions**。未改 catalog，因此未重复全套双端测试。
- 公式失败 terminal 的合成测试仍保留，验证任意真实错误可被交付为诊断，不意味着合法输入在新公式下仍应产生 AC 错误。
- Git HEAD 仍为 `563efd4d`；本轮未 add/commit、未 rebase。PR1/PR2 的更正各自在其工作区，尚未传播到本 checkout，故新规则的全链回归仍为 **NOT VERIFIED**。
- 待批准后按 PR1 → PR2 → PR3 提交和同步依赖，再对受影响层运行定向回归；提交前检查各自 diff/状态/敏感信息。无需修改 main 或连接生产 ERP。

## 2026-10-13 已授权同步与最终回归

- 用户提供原始参考 XLSX，并明确允许分别本地提交、备份旧提交和 PR1 → PR2 → PR3 rebase。原件 SHA-256 与方案相符，34 个表头、2003 行的 26039 个公式逐字比对零差异；原件公式缓存为空，未改写用户原件。核验详情和 Office 环境见 PR1/PR2 handoff。
- 已建立 3 个本地备份分支：`codex/final-restock-formulas-before-xlsx-20261013` → `e9b88b92`，`codex/final-restock-cli-before-xlsx-20261013` → `afc9528f`，`codex/final-restock-skill-before-xlsx-20261013` → `563efd4d`。保留原分支和 Pool，不删除旧提交。
- PR1 的 AA/AC 更正为 `70bc0568`；PR2 表头及测试更正为 `a2139ab0`，加同步验证记录后 HEAD 为 `797436bd`。PR3 的 Skill 说明更正重放为 `cc82b36d`，原入口功能提交 `563efd4d` 重放为 `c43710c0`，`git range-diff` 确认原功能内容不变。
- PR2 / PR3 rebase 均无冲突，祖先检查确认 `main → PR1 → PR2 → PR3`。PR1 已基于当前 main `9f36647a`，无需改变基线。PR3 中上游服务、业务测试和上游 handoff 与 PR2 完全一致，没有把前序更正留在下游兜底。

本 worktree 根目录，使用自身 `.venv`，运行：

```sh
LXE_OFFICE_NODE=/Users/hym/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node \
LXE_OFFICE_CLI=/private/tmp/lxe-final-restock-office-runtime/office/node_modules/@deepseek-ai/libreoffice-kit/lib/cli.js \
UV_CACHE_DIR=/private/tmp/lxe-final-restock-uv-cache \
uv run --frozen --no-sync pytest python/lxeskill_cli/tests/lxeskill python/lxeskill_cli/tests/infra python/lxeskill_cli/tests/mabang/test_final_restock_recommendation.py python/lxeskill_cli/tests/mabang/test_final_restock_workbook.py python/lxeskill_cli/tests/mabang/test_final_restock_workbook_cli.py -q --tb=short -rs
# 639 passed, 4 skipped, 4 warnings

bun test packages/agent/runtime/test/tooling/lxeskill-command.test.ts packages/agent/runtime/test/tooling/skills.test.ts
# 25 pass, 0 fail, 177 assertions

UV_CACHE_DIR=/private/tmp/lxe-final-restock-uv-cache uv run --frozen --no-sync lxeskill doctor
UV_CACHE_DIR=/private/tmp/lxe-final-restock-uv-cache uv run --frozen --no-sync lxeskill replenish final-restock generate --help
# 两条均 ok=true，doctor 数量与初始提交相同，命令归属和五个参数未改变。
```

- Python 测试为允许本地模拟服务器监听而在沙箱外执行，没有访问生产 ERP。4 项 skip 均为 Windows 专属路径/进程测试，4 条 warning 为既有 aiohttp 提示；Office 用例已实际执行，没有跳过。
- 本轮证明小样本文件服务经过真实 Office Kit 重算可生成零公式错误的 34 列 XLSX；清货 AC 留空，有效海运重量仍是数量乘克数。它不证明用户完整业务输入集或模型交付链已验收。
- 已检查各层 diff、`git diff --check`、敏感信息模式和变更归属；main 与其他 Pool 未修改。仅补交本层最终验证记录，最新 HEAD 以本分支 `git log -1` 为准；没有 push、远端 PR 或 merge。后续主仓库 review 仍需按 PR1 → PR2 → PR3 串行，并分别取得对应远端操作授权。
