---
name: replenishment-final-restock
description: 用户明确要求“最终备货建议”或“将原始备货建议量表转换成新表”时使用。只给店铺名也应自动调用现有马帮取数 Skill，取得本轮 MSKU 源表、同源深圳库存报告和同店同日未关联货件快照，再生成单表 34 列 mskulist 并交付。普通备货、补货建议继续使用 replenishment-workflow-map / replenishment-calculate。
type: replenishment
commands:
  - lxeskill replenish final-restock generate
---

# 最终备货建议

## 入口与范围

- 明确要求“最终备货建议”或“将原始备货建议量表转换成新表”时进入本 Skill，不先运行旧备货计算。普通“某店铺备货/补货建议”继续使用 `replenishment-workflow-map` / `replenishment-calculate`；仅要求发送旧流程的最终文件，不代表切换到本 Skill。
- 仅询问流程、规则或已有结果时解释或读取对应产物，不重新生成。用户要求生成且只给店铺名时，默认在本轮自动取数，不向用户索取三个文件路径；也不转入旧备货计算。
- 用户明确指定一整套离线输入时，仍可直接使用下方四项输入调用底层计算。旧 42 列结果、销量分析报告不能替代原始 MSKU 源表；若要求使用部分指定文件，不与本轮采集文件混用，先确认是重新采集整套还是补齐同源输入。
- 不搜索历史目录或自行按修改时间挑选文件，不猜店铺别名、网页 ID、批次或文件路径。名称含糊时通过现有店铺解析 Skill 获取真实候选；只有歧义、必要授权缺失或取数失败等实际阻塞才向用户询问。

## 仅给店铺名时的本轮取数

按顺序读取对应业务 Skill，并通过 `exec` 调用其已声明的 CLI；每一步只使用最后一条 `type="result"` 的 `data`，`ok=false` 或必需字段缺失即停止并保留真实诊断。运行中等待原会话，不重复启动取数。中间文件不发送，最后只交付计算结果。

| 顺序 | 现有 Skill 与命令 | 本轮必须保留的字段 |
|---|---|---|
| 1 | `replenishment-store-resolve`：`lxeskill replenish store resolve --store-name "<用户店铺名>"` | `data.store_name`、`store_id`、`id_type`；有歧义时请用户选择真实候选 |
| 2 | `mabang-store-msku-export`：`lxeskill mabang store msku export --store-id "<store_id>" --id-type "<id_type>" --store-name "<规范店铺名>" --include-local-inventory` | `data.xlsx_path`（含马帮 Amazon MSKU 列表“本地库存”的本轮源表）、`store_name` |
| 3 | `mabang-store-shenzhen-inventory-export`：`lxeskill mabang store shenzhen-inventory export --store-name "<规范店铺名>"` | `data.shenzhen_warehouse_inventory_report_xlsx_path`、`source_msku_xlsx_path`、`source_msku_data_time` |
| 4 | `mabang-store-unlinked-shipments-export`：`lxeskill mabang store unlinked-shipments export --store-name "<规范店铺名>"` | `data.snapshot.snapshot_xlsx_path`、布尔值 `confirmed_empty`、三个完整状态结果 |

- 步骤 2 返回的店铺名须与规范店铺名一致。**在调用步骤 4 之前**核对：步骤 3 的 `source_msku_xlsx_path` 必须指向步骤 2 本轮返回的 `xlsx_path`；不一致就结束本轮，不得继续取货件或调用最终计算。库存导出自身会查找该店铺本地最新源表；即使时间相近也不能拿旧文件继续计算或手改路径。底层计算仍会核验文件指纹、店铺、批次、快照及 MSKU 覆盖。
- 最终表 AG“本地库存”读取步骤 2 源表中每个 MSKU 自身的“本地库存”，包括组合 MSKU；步骤 3 报告继续用于同源、覆盖和子 SKU 核验，不以其库存数量代替 AG。源表缺少该列时停止，不回退到深圳库存“可用库存量”或历史文件。
- 步骤 4 只有三个状态完整成功且快照存在才可继续；`confirmed_empty=true` 是有效空快照，查询失败或缺快照不能当作零货件。不要再运行旧销量分析或 `replenish calculate`。
- 认证恢复仅按所读取业务 Skill 的真实 `data.auth_refresh_required=true` 规则执行；没有授权、接口失败、同源不一致或跨日不兼容时停止，说明已完成步骤和实际错误，不回退历史文件或伪造数据。
- 深圳库存返回 `ok=false` 且 `data.auth_refresh_required=false` 或缺失时，本轮立即结束；包括“查询条件已被新的搜索覆盖”或返回 HTML 错误页。不得等待后重复导出、改写命令重试或刷新认证，也不得继续货件查询和最终计算。说明阻塞并保留本轮已取得源表，不要求用户自行准备三个文件；只有用户明确要求恢复且失败条件已解决时才重新执行。

## 输入与调用

使用上一步本轮成功返回的产物路径，或用户明确提供的一整套合格离线文件。底层命令仍需四项参数；这些路径由 Agent 传递，正常流程不要求用户填写：

| 参数 | 来源 |
|---|---|
| `--store-name` | 本次完整店铺名，须与源文件核验记录一致 |
| `--msku-source-xlsx-path` | 步骤 2 的 `data.xlsx_path`，已含源数据核验信息的马帮原始全量 MSKU XLSX，必须包含 Amazon MSKU 列表导出字段 `uq122` 对应的“本地库存”列 |
| `--shenzhen-inventory-report-xlsx-path` | 步骤 3 的 `data.shenzhen_warehouse_inventory_report_xlsx_path` |
| `--unlinked-shipments-snapshot-path` | 步骤 4 的 `data.snapshot.snapshot_xlsx_path` |

通过 `exec` 执行一次独立命令，不拼接 shell 操作、不直接执行 Python 业务模块：

```text
lxeskill replenish final-restock generate --store-name "<完整店铺名>" --msku-source-xlsx-path "<源文件路径>" --shenzhen-inventory-report-xlsx-path "<深圳报告路径>" --unlinked-shipments-snapshot-path "<货件快照路径>"
```

- 只把最后一条 `type="result"` 当作 terminal：先看 `ok`，业务数据读 `data`，附件读 `files`。运行中/session running 时等待原会话，不重新启动命令。
- CLI 负责源文件、店铺、批次、MSKU 覆盖和数值核验。未知或不匹配的店铺保留实际“源数据核验店铺不一致”诊断和请求/快照名称；这仅证明与输入不匹配，不能宣称该店铺在生产系统不存在。
- 自动取数或计算出现缺文件、缺关键数值、重复 MSKU、批次冲突或无效快照时停止，保留实际错误及定位信息；说明失败步骤和需要恢复的条件，不要求用户自行查找三个路径。不能把未知值当作 0，也不能拿旧文件替代失败输入。
- 有效且已确认空集的货件快照可以使用；没有快照不能按零货件继续。

## 结果与交付

- 成功结果为一个可见工作表 `mskulist`、A:AH 共 34 列，保留本次源表全部 MSKU 行；不另跑旧算法，不手工二次扣库存或货件。
- AG“本地库存”取源表中该 MSKU 的“本地库存”，允许有限负数，区分真实 0 和空白；AH“本地SKU”优先取同源深圳库存报告的组合编码，缺失时回退源表“本地SKU”。深圳报告的可用库存不代替 AG。
- 来源绑定核验未通过的商品（本地 SKU 为空或未能匹配库存/组合目录）仍保留原始行和销量，I/J/R/S 保留分析公式，U–AC 不生成运输或补货建议；核验通过的商品仍使用原有 13 列公式。不得删掉未绑定行或把其空白建议填成 0。
- `ok=true` 时调用 `send_files(paths=<terminal.files>)`。发送成功后说明店铺、`source_data_time`、`row_count`；没有附件时不猜路径，发送失败只重试交付，不重跑生成。
- `ok=false` 时保留 `error.message` 及相关 `data`。若包含 `formula_error_count` / `formula_error_examples`，呈现真实单元格坐标和错误值；terminal `files` 可作为**失败诊断文件**发送，明确尚未通过验收，不作为正式可执行备货建议。
- 按已确认的 XLSX 规则，AA 在 V 或 W 为空时留空；AC 在 AB 或 AD 为空时留空，否则相乘。AD 表头为“单件重量”，输入及总重单位仍为克。出现其他真实公式错误仍须报告，不通过 IFERROR、填零、删行或隐藏错误来声称零错误验收通过。
- Office 未配置（如 `LXE_OFFICE_NODE`）、重算失败或结果无法核验时，报告实际诊断并标记 **NOT VERIFIED**；不宣称真实重算、Microsoft Excel 原生验证或完整交付成功，也不自行修改宿主环境或安装依赖。
