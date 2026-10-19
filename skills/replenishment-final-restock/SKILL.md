---
name: replenishment-final-restock
description: Amazon 独立最终备货建议入口。Amazon 业务已明确且用户明确要求“最终备货建议”时使用 replenishment-final-restock，不限定店铺或关键词组合；店铺身份由 replenishment-store-resolve 确认。明确其他 ERP 或东南亚请求不使用本 Skill，平台业务不明确先澄清。明确普通备货走原流程，只有备货类型不明确时才选择“普通备货”或“最终备货建议”。确认最终流程后，只需店铺名，自动取得本轮数据、核验并交付单表 34 列 Excel。
type: replenishment
commands:
  - lxeskill replenish final-restock generate
---

# 最终备货建议

## 业务用途

把同一 Amazon 店铺本轮的销量、FBA 库存、本地商品编码和未发出货件整理为可供运营判断空运、海运及备货数量的最终 Excel。结果是单工作表 `mskulist`、A:AH 共 34 列；趋势、日均销量、R“FBA总库存”及建议由现有 13 列公式计算。AG“本地库存”来自 MSKU `uq122`，T“未发出货件总计”来自货件快照，其他源数据按既有映射保留。

这是独立最终表流程，普通备货的参数方案和原有报表仍由 `replenishment-workflow-map` / `replenishment-calculate` 负责。表头、样式和公式由代码生成，运营无需上传模板。

## 入口与范围

- Amazon 业务已明确且用户明确要求“最终备货建议”时使用本 Skill，先解析用户提供的店铺名，身份确认后执行本轮取数；不限定店铺或关键词组合，不要求额外出现中文“亚马逊”，不因其他店铺而重复确认备货类型。明确普通备货走 `replenishment-workflow-map` / `replenishment-calculate`；仅要求发送旧流程的最终文件，不代表切换到本 Skill。
- 明确其他 ERP 或东南亚请求不使用本 Skill，沿用对应业务 Skill 或 `southeast-asia-replenishment-workflow-map`，不因“最终备货建议”字样切到 Amazon。只有平台业务真正不明确时才澄清；能从本轮上下文判断为 Amazon 时不重复询问平台，也不凭国家或简称猜来源。
- 只有备货类型不明确时才选择“普通备货”或“最终备货建议”，如只说“亚马逊备货建议”且上下文未确定类型，或提出相互冲突的流程要求。使用现有 `ask_user_question` 提问“本次使用哪种备货流程？”，单选项为“普通备货”（原有算法和报表）与“最终备货建议”（本轮自动取数，生成独立 34 列 Excel）；没有该工具时用对话列出相同选项并等待。未选择前不执行店铺解析、取数或计算；跳过、取消或未明确选择时停止生成，不默认任一选项。
- 已明确或已选择的备货类型沿用，不重复提问。选择普通流程后读取 `replenishment-workflow-map`；选择最终流程后继续本 Skill，不要求补齐关键词。更换店铺但未更改备货类型时，只核对新店铺，不重新选择流程。
- 仅询问流程、规则或已有结果时解释或读取对应产物，不重新生成。明确的单步取数请求交给对应业务 Skill，不要求选择整套流程。入口确认后，用户只需提供店铺名，默认在本轮自动取数，不向用户索取三个文件路径；也不转入旧备货计算。
- 本 Skill 的对外生成入口只接受店铺名，并在本轮自动取数、核验、计算和交付。用户只提供文件或要求离线文件计算时，说明此入口需要店铺名以启动自动流程；不要求用户补交三份文件，也不把用户文件或历史文件混入本轮输入。
- 不搜索历史目录或自行按修改时间挑选文件，不猜店铺别名、网页 ID、批次或文件路径。店铺名称不明确时交给现有解析能力，解析有歧义时只展示真实候选，不自动选第一个；缺少店铺名且上下文无法确定时只补问店铺名。店铺歧义不改变已明确的备货类型。

| 自然语言请求示例 | 应有入口行为 |
|---|---|
| 请为 Amazon-Yihaiqian-US 生成最终备货建议。 | 进入最终流程，先解析店铺，不再询问备货类型。 |
| 请为 Amazon-Yihaiqian-US 做普通备货。 | 进入普通流程，不询问是否改用最终建议。 |
| 帮 Amazon-Yihaiqian-US 做备货。 | 上下文未确定类型时，先选择普通或最终流程。 |
| （已在 Amazon 备货上下文）请为 Yihaiqian 生成最终备货建议。 | 先解析原始名称；若返回多个候选，只确认店铺，不重复询问备货类型。 |
| 请用雅仓生成越南最终备货建议。 | 读取 vietnam-replenishment，按既有契约处理，不启动 Amazon 流程。 |
| 请导出上马 ERP 的库存和销量，供最终备货建议使用。 | 读取 shangman-products-export，只处理指定导出，不启动 Amazon 流程。 |
| 生成这家店的最终备货建议。 | 上下文无法确定平台时，只澄清平台业务，保留已明确的最终备货意图。 |

## 仅给店铺名时的本轮取数

按下表顺序读取对应业务 Skill，通过 `exec` 调用其已声明的 CLI；完整参数以各 Skill 和 `python/lxeskill_cli/lxeskill/catalog.json` 为准。这里只说明本流程需要的输入及交接字段，不额外维护可选参数。

| 顺序与能力 | 业务用途、何时调用及输入 | 返回结果与下一步 |
|---|---|---|
| 1 店铺解析：`replenishment-store-resolve` / `lxeskill replenish store resolve --store-name "<用户店铺名>"` | 入口确认后，把运营名称解析成马帮下载入口的真实店铺和查询标识；不是紫鸟店铺 ID。 | `data.store_name`、`store_id`、`id_type` 传给步骤 2。歧义时展示真实候选；整组须选择单站点，不猜 ID 或自动拆任务。 |
| 2 MSKU 源表：`mabang-store-msku-export` / `lxeskill mabang store msku export --store-id "<store_id>" --id-type "<id_type>" --store-name "<规范店铺名>" --include-local-inventory` | 按步骤 1 的标识下载本轮商品行、销量、FBA 库存和重量，启用本地库存列；导出同时保存既有本地 SKU 商品类型核验结果。 | `data.xlsx_path`、`store_name` 及原始/核验通过/未通过行数。源表供步骤 3 查深圳库存，供步骤 5 取基础数据和 AG；缺本地库存列或接口失败停止，不用深圳数量替代。 |
| 3 深圳库存报告：`mabang-store-shenzhen-inventory-export` / `lxeskill mabang store shenzhen-inventory export --store-name "<规范店铺名>"` | 源表成功后，复用其本地 SKU 类型及组合组件查询深圳仓库可用库存，生成覆盖源表的报告；本流程用它核对来源和商品编码。 | `data.shenzhen_warehouse_inventory_report_xlsx_path`、`source_msku_xlsx_path`、`source_msku_data_time`。先核对同源，再进入步骤 4；报告供步骤 5 校验及填 AH，不作为 AG 来源。 |
| 4 货件快照：`mabang-store-unlinked-shipments-export` / `lxeskill mabang store unlinked-shipments export --store-name "<规范店铺名>"` | 同源检查通过后，查询 WMS待配货、WMS待装箱、待关联货件三个状态，自动下载原生文件并按 MSKU 汇总商品件数，作为 T 的现有统计输入。 | `data.status_results` 及 `data.snapshot.snapshot_xlsx_path`、布尔值 `confirmed_empty`。快照供步骤 5 填 T；发货单张数不等于商品件数。状态缺失或快照失败停止。 |
| 5 最终计算：本 Skill / `lxeskill replenish final-restock generate` | 三份本轮产物齐全后，传规范店铺名和它们的路径；校验店铺、来源批次、覆盖及数值，生成 Excel，经 Office Kit 重算并检查。 | `data.output_xlsx_path`、`source_data_time`、`row_count`、`formula_error_count` / `formula_error_examples`；仅合法成功结果交给步骤 6，错误结果按诊断处理。 |
| 6 文件交付：`send_files` | 计算检查通过后，使用最终 terminal 的 `files`，不发中间报表，不自行猜路径。 | 发送工具确认成功才算交付；失败只重试交付，不重新取数或生成。 |

- 步骤 2 返回的店铺名须与规范店铺名一致。**在调用步骤 4 之前**核对：步骤 3 的 `source_msku_xlsx_path` 必须指向步骤 2 本轮返回的 `xlsx_path`；不一致就结束本轮，不得继续取货件或调用最终计算。库存导出自身会查找该店铺本地最新源表；即使时间相近也不能拿旧文件继续计算或手改路径。底层计算仍会核验文件指纹、店铺、批次、快照及 MSKU 覆盖。
- 步骤 4 只有三个状态完整成功且快照存在才可继续；`confirmed_empty=true` 是有效空快照，查询失败或缺快照不能当作零货件。不要再运行旧销量分析或 `replenish calculate`。

## 输入与调用

步骤 5 的四项参数依次来自步骤 1 的规范店铺、步骤 2/3/4 的产物路径。只使用本轮成功返回的路径，属于 Agent 内部计算接口，不构成运营上传三文件的入口。通过 `exec` 执行一次独立命令，不拼接 shell 操作、不直接执行 Python 业务模块：

```text
lxeskill replenish final-restock generate --store-name "<完整店铺名>" --msku-source-xlsx-path "<源文件路径>" --shenzhen-inventory-report-xlsx-path "<深圳报告路径>" --unlinked-shipments-snapshot-path "<货件快照路径>"
```

## 三份数据的职责

| 输入 | 在最终表中的职责 | 不能混用的口径 |
|---|---|---|
| MSKU 源表 | 商品行、销量、FBA 库存、重量等基础数据；AG“本地库存”读取步骤 2 源表中每个 MSKU 自身的“本地库存”，对应导出字段 `uq122`，包括组合 MSKU。 | AG 允许有限负数，区分真实 0 和空白；不改用深圳可用库存。源表缺列即停止。 |
| 深圳库存报告 | 同源批次、全量 MSKU 覆盖及商品编码核对；AH“本地SKU”优先取报告的本地SKU列（普通商品或组合商品编码），为空时回退源表本地SKU。 | 非空编码与源表不一致即失败；不填子SKU拆分文本。组合组件由既有核验/库存导出处理，最终计算不新增第二套绑定规则；深圳数量不参与本表 13 列公式，也不替代 AG。 |
| 未关联货件快照 | T“未发出货件总计”按店铺和 MSKU 读取快照商品数量，参与现有建议计算；须与源表同店、同日。 | 使用快照件数而非发货单张数；不由 Agent 再扣一次。完整有效快照中没有该 MSKU 时为 0，查询失败不能当 0。 |

T 的状态覆盖及与 FBA 在途是否重叠尚待业务验收，不能据此宣称已消除重复扣减或重复备货；沿用现有统计与公式，不由 Agent 调整数量或补做去重。

- “绑定核验”沿用既有返回字段，实际表示源表本地 SKU 的商品类型已确认，不证明实时 Listing 绑定一致；不额外查询 Listing。来源绑定核验未通过的商品（本地 SKU 为空或未能匹配库存/组合目录）仍保留原始行和销量，I/J/R/S 保留分析公式，U–AC 不生成运输或补货建议；核验通过的商品仍使用原有 13 列公式。不得删掉未绑定行或把其空白建议填成 0。
- 旺季加成默认开启；用户可在桌面工作台的“亚马逊最终备货设置”持久开关中关闭或重新开启，保存后用于下一次最终备货表生成。关闭时只取消 V/W 的旺季额外天数，不改变基准公式、关键词分类、120 天上限或其他建议规则。

## 失败与恢复

- 每一步只把最后一条 `type="result"` 当作 terminal：先看 `ok`，业务数据读 `data`，附件读 `files`。运行中/session running 时等待原会话，不重复启动；`ok=false` 或必需字段缺失不继续后续步骤。
- 文件级核验失败与商品级排除不同：来源信息损坏、缺文件、缺关键数值、重复 MSKU、覆盖不一致、批次冲突或无效快照时停止整轮，保留实际错误及定位信息；绑定核验未通过的合法商品行按上节保留，不重新验证或修改绑定。说明失败步骤和恢复条件，不要求用户自行查找三个路径，不用旧文件或未知值填零替代失败输入。
- 店铺不匹配时保留实际“源数据核验店铺不一致”诊断及请求/快照名称；这只证明与输入不匹配，不能宣称店铺在生产系统不存在。
- 认证恢复仅按所读取业务 Skill 的真实 `data.auth_refresh_required=true` 规则执行；相关服务内部已有恢复，不叠加刷新或凭错误文本猜认证。官方数据服务权限错误不刷新马帮 Cookie；缺授权、非认证接口失败、来源不一致或跨日不兼容时停止。
- 深圳库存返回 `ok=false` 且 `data.auth_refresh_required=false` 或缺失时，本轮立即结束；包括“查询条件已被新的搜索覆盖”或返回 HTML 错误页。不得等待后重复导出、改写命令重试或刷新认证，也不得继续货件查询和最终计算。说明阻塞并保留本轮已取得源表，不要求用户自行准备三个文件；只有用户明确要求恢复且失败条件已解决时才重新执行。

## 结果与交付

- 最终计算服务负责 Office Kit 重算及工作表、行列、公式存在性、未核验行建议留空和错误单元格检查。仅当最终 terminal `ok=true`、`data.formula_error_count=0` 且 `files` 有文件时，调用 `send_files(paths=<terminal.files>)`；该工具检查文件存在可读并发送，不负责 Excel 业务校验。发送成功后说明店铺、`source_data_time`、`row_count`；没有附件时不猜路径，发送失败只重试交付，不重跑生成。
- `ok=false` 时保留 `error.message` 及相关 `data`。若包含 `formula_error_count` / `formula_error_examples`，呈现真实单元格坐标和错误值；terminal `files` 可作为**失败诊断文件**发送，明确尚未通过验收，不作为正式可执行备货建议。
- 按已确认的 XLSX 规则，AA 在 V 或 W 为空时留空；AC 在 AB 或 AD 为空时留空，否则相乘。AD 表头为“单件重量(g)”，输入及总重单位为克。出现其他真实公式错误仍须报告，不通过 IFERROR、填零、删行或隐藏错误来声称零错误验收通过。
- Office 未配置（如 `LXE_OFFICE_NODE`）、重算失败或结果无法核验时，报告实际诊断并标记 **NOT VERIFIED**；不宣称真实重算、Microsoft Excel 原生验证或完整交付成功，也不自行修改宿主环境或安装依赖。
