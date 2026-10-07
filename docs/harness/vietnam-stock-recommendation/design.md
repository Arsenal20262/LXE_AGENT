# 越南备货：在线与离线生成设计

本文描述当前代码中的两种生成入口及其共同的业务边界。原始雅仓报表导出仍由 `yacang-export` 负责；SKU 参数表绑定仍由越南 Skill 的绑定入口负责。

## 入口与职责

| 用户目标 | 正式入口 | 来源 |
| --- | --- | --- |
| 获取原始雅仓报表 | `yacang-export` | 雅仓导出能力，不计算备货 |
| 直接生成越南备货 | `lxeskill vietnam stock recommend` | 在线采集雅仓 `VN8806` 三类报表 |
| 用已有三份报表生成越南备货 | `lxeskill vietnam stock generate` | 用户提供的三份本地 XLSX |

Agent 根据明确的目标选入口；含糊请求先澄清。生成步骤由确定性 Workflow 执行，Agent 不逐个调用 Source、Workbook、Office 或 Validation，也不能跳过其中一步。

## 在线链路

```text
vietnam stock recommend
→ 读取受信 SKU current 快照
→ yacang_sources.export_vietnam_sources()
→ 既有雅仓 workflow 导出库存动销、当前库存列表、全局仓库产品资料
→ source_parser.load_vietnam_sources() 本地校验与整理
→ SKU current + RecommendationConfig
→ generate_vietnam_workbook()
→ Workbook 写入 → shared.office 重算 → Vietnam 结果校验
→ 发布一个最终 XLSX
```

在线适配器只负责取数与转交来源报表；雅仓认证、请求、导出和下载沿用既有实现。本次不改补货公式、Workbook 算法或雅仓请求实现。

## 离线链路

```text
vietnam stock generate
→ 用户已有三份 XLSX
→ source_parser.classify_vietnam_report_paths() 识别并校验来源
→ source_parser.load_vietnam_sources() 本地解析与业务校验
→ 读取同一受信 SKU current 快照和 RecommendationConfig
→ 同一 generate_vietnam_workbook()
→ 同一 Workbook 写入 → shared.office 重算 → Vietnam 结果校验
→ 发布一个最终 XLSX
```

`source_parser.py` 不导入雅仓在线 workflow，不执行认证或网络请求。它复用雅仓模块中只读 XLSX 的表头与内容校验函数。离线入口不调用 `recommend`，失败也不回退在线或补取雅仓；Workbook、Office、Validation 任一步失败均不发布部分结果。

离线 CLI 业务层独立验证输入恰好三份、文件存在且为可读 XLSX、路径或文件身份不重复、三种来源类型各一份、表头和行结构合法，以及 `VN8806` 相关仓库约束。来源类型按表头识别，不凭文件名猜测。直接调用 Python CLI 不能绕过这些检查。

PR8 提供**通用**固定数量受控多附件能力：catalog 为离线命令声明 `attachment_argument: source_xlsx` 和 `attachment_count: 3`，Runtime 在调用 CLI 前校验整组聊天附件。这里的三报表业务语义属于越南 `source_parser`，不在 PR8 的公共 Runtime 中判断。单份 SKU 参数表绑定仍沿用 PR7 的受控附件及 SKU current/version 机制；三份来源报表不会被当作 SKU 参数表绑定。

## 输出与可证明范围

在线与离线在来源数据、SKU current 和配置相同时进入同一生成链，使用同一五表骨架、公式、Office 重算和结果校验。只有最终文件存在、非空且通过校验，CLI 才返回 `output_xlsx`；聊天层按 terminal 的成功状态与唯一最终文件契约调用一次 `send_files`。

离线结果必须表述为“基于用户提供的已有报表生成”。单靠文件内容无法证明三份报表来自同一导出批次，也不能证明它们代表今日实时数据；空报表仅有表头时也无法证明原始导出的仓库筛选。不能把这些未验证属性写成事实。

SKU 映射缺项、显式零、热销默认值、在途来源及公式结果的具体规则由现有 SKU、Workbook 与 Validation Contract 管理；本次来源拆分不修改它们。长期四参数由既有配置机制管理，聊天临时覆盖不在当前入口开放。
