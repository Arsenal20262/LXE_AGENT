---
name: replenishment-final-restock
description: 用户明确要求“最终备货建议”或“将原始备货建议量表转换成新表”时使用。基于已核验的本地 MSKU 源表、同源深圳库存报告和同店同日未关联货件快照生成单表 34 列 mskulist。普通备货、补货建议继续使用 replenishment-workflow-map / replenishment-calculate；本入口只处理明确的离线输入，缺输入先澄清。
type: replenishment
commands:
  - lxeskill replenish final-restock generate
---

# 最终备货建议

## 入口与范围

- 明确要求“最终备货建议”或“将原始备货建议量表转换成新表”时进入本 Skill，不先运行旧备货计算。普通“某店铺备货/补货建议”继续使用 `replenishment-workflow-map` / `replenishment-calculate`；仅要求发送旧流程的最终文件，不代表切换到本 Skill。
- 本入口读取已有的离线文件。仅询问流程、规则或已有结果时解释或读取对应产物，不重新生成。
- 用户只给店铺、仅给旧备货结果表或给出部分输入时，先列出缺失项并请求补齐。旧 42 列结果、销量分析报告不能替代原始 MSKU 源表。本入口不自动查询店铺、登录 ERP、采集新数据，也不自动转入旧完整流程。
- 不搜索历史目录或按修改时间挑选文件，不猜店铺别名、网页 ID、批次或文件路径。名称含糊时请求完整店铺名；不调用生产接口来补齐本阶段的离线输入。

## 输入与调用

使用用户明确提供的文件，或本轮已成功取得且用户选择使用的产物路径。四项均需明确：

| 参数 | 来源 |
|---|---|
| `--store-name` | 本次完整店铺名，须与源文件核验记录一致 |
| `--msku-source-xlsx-path` | 已含源数据核验信息的马帮原始全量 MSKU XLSX |
| `--shenzhen-inventory-report-xlsx-path` | 使用该 MSKU 源表导出的深圳库存报告 |
| `--unlinked-shipments-snapshot-path` | 同店、与源数据同日且完整查询成功的未关联货件快照 |

通过 `exec` 执行一次独立命令，不拼接 shell 操作、不直接执行 Python 业务模块：

```text
lxeskill replenish final-restock generate --store-name "<完整店铺名>" --msku-source-xlsx-path "<源文件路径>" --shenzhen-inventory-report-xlsx-path "<深圳报告路径>" --unlinked-shipments-snapshot-path "<货件快照路径>"
```

- 只把最后一条 `type="result"` 当作 terminal：先看 `ok`，业务数据读 `data`，附件读 `files`。运行中/session running 时等待原会话，不重新启动命令。
- CLI 负责源文件、店铺、批次、MSKU 覆盖和数值核验。未知或不匹配的店铺保留实际“源数据核验店铺不一致”诊断和请求/快照名称；这仅证明与输入不匹配，不能宣称该店铺在生产系统不存在。
- 缺文件、缺关键数值、重复 MSKU、批次冲突或无效快照时停止，保留实际错误及定位信息，请求修正对应输入。不能把未知值当作 0，也不能拿旧文件替代失败输入。
- 有效且已确认空集的货件快照可以使用；没有快照不能按零货件继续。

## 结果与交付

- 成功结果为一个可见工作表 `mskulist`、A:AH 共 34 列，保留本次源表全部 MSKU 行；不另跑旧算法，不手工二次扣库存或货件。
- `ok=true` 时调用 `send_files(paths=<terminal.files>)`。发送成功后说明店铺、`source_data_time`、`row_count`；没有附件时不猜路径，发送失败只重试交付，不重跑生成。
- `ok=false` 时保留 `error.message` 及相关 `data`。若包含 `formula_error_count` / `formula_error_examples`，呈现真实单元格坐标和错误值；terminal `files` 可作为**失败诊断文件**发送，明确尚未通过验收，不作为正式可执行备货建议。
- 按已确认的 XLSX 规则，AA 在 V 或 W 为空时留空；AC 在 AB 或 AD 为空时留空，否则相乘。AD 表头为“单件重量”，输入及总重单位仍为克。出现其他真实公式错误仍须报告，不通过 IFERROR、填零、删行或隐藏错误来声称零错误验收通过。
- Office 未配置（如 `LXE_OFFICE_NODE`）、重算失败或结果无法核验时，报告实际诊断并标记 **NOT VERIFIED**；不宣称真实重算、Microsoft Excel 原生验证或完整交付成功，也不自行修改宿主环境或安装依赖。
