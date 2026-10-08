---
name: vietnam-replenishment
description: 根据三份已有雅仓报表生成越南备货清单，独立计算并校验五张工作表。用户要求查询本轮备货结果、出越南备货单、做补货建议或计算补货量时使用；缺少来源时复用 yacang-reports-export 获取数据，也可解释输入和查询当前计算参数。
type: replenishment
commands:
  - lxeskill vietnam replenishment calculate
preselect:
  text_phrases:
    - 查询越南备货
    - 查询越南的备货
    - 生成越南备货清单
    - 出越南备货单
    - 越南补货建议
    - 越南补货量
    - 越南这批该补多少
    - 帮我出张越南备货表
---

# 越南备货清单

## 输入与设置

- SKU 映射表包含 `SKU`、`热销标记`、`成本`、`跨境价`、`折扣价`。SKU 用来关联 ERP；热销标记参与确定备货天数；成本和价格用于利润计算。表格须为有效 XLSX，至少有一个 SKU。每个已填写的 SKU 都必须有完整四项参数：热销标记只能填 `1` 或 `2`，成本、跨境价和折扣价必须大于 `0`，不允许空白或零值；业务人员负责提供真实数值，AI 不得猜测、填零或用默认标记补齐。
- 全局参数包括 7、15、30 天销量权重、各周期天数修正及人民币兑越南盾汇率。日均销量 = 周期销量 ÷（天数 + 修正值），再按销量权重合并。汇率表示 1 元人民币对应多少越南盾。
- 全局参数和长期映射表由用户在「工作台 → 越南备货设置」中维护，当前桌面应用的工作目录共用。它们保存在应用数据目录 `$LXE_DATA_ROOT/skill-data/vietnam-stock-recommendation/` 下的 `parameters.json` 和 `sku-map.xlsx`，不保存在技能源码目录。
- 脚本自动读取参数，生成前无需查询或把数值填进命令。只在用户询问当前参数时，通过普通 `exec` 读取 `LXE_DATA_ROOT` 环境变量的路径，再用 `read` 读取对应 `parameters.json`。Unix 可执行 `printenv LXE_DATA_ROOT`；Windows PowerShell 可读取 `$env:LXE_DATA_ROOT`。不要把所有环境变量或包含凭据的设置文件输出给用户，也不要猜应用目录。参数文件使用十进制字符串，`sales_weight_*` 是比例（展示给用户时乘以 100%），`day_adjustment_*` 是天数修正。
- 参数临时覆盖暂不支持；用户要求其他值时提示先在桌面设置保存，不能忽略要求后使用旧值生成，也不要直接编辑参数文件。
- ERP 提供 VN8806 的 SKU、名称、7/15/30 天销量、可用库存、在途数量、上架时间。上架时间取仓库产品的“创建时间”，在途取本轮当前库存列表。五表骨架内置，无需用户提供完整模板。

| 命令参数 | 原始报表 | 主要字段 |
|---|---|---|
| `--sales-file` | VN8806 库存动销（`inventory-sales`） | SKU、7/15/30 天销量 |
| `--inventory-file` | VN8806 当前库存（`inventory`） | SKU、可用库存、在途数量 |
| `--products-file` | 全局仓库产品资料（`products`） | SKU、中文标题、创建时间 |

三份报表均为必填路径。计算只读取本地文件，不登录 ERP、不下载数据，也不会在输入缺失或无效时自动导出。报表在读取前复制为本轮快照，SKU 映射表和全局参数也固定为本轮输入。

## 获取数据（独立步骤）

- 已有用户指定或本轮导出的三份有效报表时直接计算，不重复导出，不按文件名猜报表类型或替用户选择历史数据。
- 需要获取越南备货数据时，读取并复用 `yacang-reports-export`，使用其现有命令：

```sh
lxeskill yacang reports export --report inventory-sales --report inventory --report products --warehouse VN8806
```

- 按导出结果 `data.artifacts` 中的 `report`、`warehouse` 选择三份真实路径。两份库存报表必须来自 VN8806，产品资料为全局；不带 `created_date` 筛选。沿用导出 Skill 的认证、权限、等待与失败处理。
- 文件内容可以校验表头、仓库、SKU 和数值，但仅凭路径无法证明同批次、未筛选或数据新鲜度。已有文件范围不明确时先澄清；不要把本次计算时间或文件修改时间声称为 ERP 数据更新时间。
- 导出和计算可以分别调用。只要求导出就到此交付；完整备货任务中将导出结果作为计算输入，不自动发送中间报表。计算失败保留已导出的文件，修正问题后可以复用这些路径，不重新触发采集。

## 执行

只有用户明确要求本轮备货结果时才生成。只问流程、参数或文件内容时回答问题；裸上传文件但目的不明确时先澄清。只要原始库存报表时使用 `yacang-reports-export`。

通过已有 `exec` 工具执行计算命令，三份路径来自用户提供的文件或导出结果：

```sh
lxeskill vietnam replenishment calculate --sales-file "/实际路径/库存动销.xlsx" --inventory-file "/实际路径/当前库存.xlsx" --products-file "/实际路径/商品资料.xlsx"
```

用户为本轮指定或上传 SKU 映射表时，使用用户提供或附件信息中的真实文件路径：

```sh
lxeskill vietnam replenishment calculate --sales-file "/实际路径/库存动销.xlsx" --inventory-file "/实际路径/当前库存.xlsx" --products-file "/实际路径/商品资料.xlsx" --sku-map-file "/实际路径/映射表.xlsx"
```

- 多个候选文件无法确定时先请用户选择；不要猜路径、搜索会话数据库或把以前生成的备货单当成映射表。显式指定的文件无效时停止，不改用保存的旧表。
- `--sku-map-file` 只影响本轮，不替换桌面保存的文件；不传时读取桌面保存的映射表。用户只想长期保存或替换时，引导到「越南备货设置」上传。
- 命令接受必填 `--sales-file`、`--inventory-file`、`--products-file` 和可选 `--sku-map-file`。不使用 `uv`、`python -m`、shell 拼接或环境变量覆盖包装它。用 `exec.cwd` 设置工作目录，文件路径优先使用绝对路径。
- 遵守现有执行权限模式。若真实错误表明需要访问工作目录之外的输入文件或应用数据（例如参数、锁、日志），通过 `exec` 的 `sandbox_permissions` 与 `justification` 申请本次所需权限。向用户解释实际原因；不自动改整个会话权限。审批拒绝后停止。
- 若 `exec` 返回运行中的任务，使用同一任务的 `wait` 等待完成，不重复启动生成。收到普通业务失败时报告实际脱敏错误，不自动重跑整轮。

## 结果与交付

- 检查终端 JSON 的 `ok`、`data.success`、`data.status`、`data.validation.status`、`data.output_xlsx` 和 `files`。只有成功完成、校验为 `passed`、最终 XLSX 存在且 `files` 恰好包含该文件时，才调用 `send_files` 发送。不要只凭进程启动或退出码宣称成功。
- 参数错误、文件缺失、坏表、ERP 缺必要来源或重算失败时，转述 `data.error.message` 或 `error.message` 的实际脱敏诊断，不发送旧文件、原始报表或中间工作簿。
- 缺少保存的映射表时，提示到设置页上传，或为本轮提供文件路径。映射表可以缺少部分 ERP SKU，整行缺少时相关结果按既有规则留空，不因未覆盖全部 ERP SKU 拒绝交付。已有映射行缺少字段、金额不大于零或热销标记非法时停止，报告实际错误，请用户补齐真实数值；保存的表和本轮指定的表采用相同校验。
- SKU 映射表会汇总整张第一工作表中可判断的错误，按位置列出 SKU、字段和原因。消息过长时只显示预览，并提供完整错误报告的实际路径；用 `read` 读取报告后一起说明问题，不把预览当作全部错误。表头不完整或重复时须先修正表头，坏文件则保留真实读取错误，不猜测剩余行。不要跳过坏行、自动补值或反复运行来逐个发现错误。
- 附件发送成功后再说已交付。结果中的 `data.config`、`data.config_source` 和 `data.sku_map_source` 记录本轮实际输入，必要时用于解释。若发送失败，仅重试发送同一文件，不重新计算。
- `data.source_files` 记录三份报表的类型、原始路径和本轮快照 SHA-256；`data.validation` 记录通过的检查、工作表、SKU 数、缺少映射行的 SKU 数及两表在途差异数。缺映射行按既有规则留空备货量；在途有差异时仍取当前库存的 `在途数量`。这些计数非零时说明其影响，不将它们误报为全量结果齐全。
