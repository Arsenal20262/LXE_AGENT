---
name: yacang-export-workflow-map
description: 雅仓数据导出的唯一自然语言入口。确定性解析商品创建日期、仓库与标准数据类型，缺省时使用业务默认值，销售口径不明确时追问；支持最近一个月销量、近三个月日度销量、各仓当前库存和入库/上架时间。
type: yacang_operations
commands:
  - lxeskill yacang export run
---

# 雅仓数据导出路由

本 Skill 是 Agent 可发现的唯一雅仓自然语言导出入口。把用户关于雅仓导出的完整原始话语原样传给唯一命令，由确定性业务层完成 Intent、任务规划与执行；不得由模型自行补日期、仓库、数据类型或底层参数。

## 执行

```text
lxeskill yacang export run --request-text "<用户关于雅仓导出的完整原始话语>"
```

- 只允许传 `request_text`。禁止传 URL、headers、Token、Cookie、`task_type`、`param_where`、OSS 地址等底层参数。
- 用户没提商品创建日期时，命令复用统一默认：开始日和结束日都取执行当天；模型不得计算日期。
- 用户没提仓库时默认四仓 `MY8801`、`PH8805`、`TH8802`、`VN8806`；明确指定一个或多个时只执行指定仓库；没提数据类型时默认四类。
- 返回 `overall_status=needs_clarification` 时，必须把 `questions` 交给用户确认，不得换用具体 Skill 猜测执行。
- 只说“销量/最近销量/销售情况”时必须追问是“最近一个月销量”还是“近三个月每天销量”；不要把内部 7/15/30 字段展示给用户。
- “当前库存/现在库存/现有库存/还剩多少货/月底库存/月末库存/月末快照”以及明确日期的库存查询，都按当前库存快照执行；这是当前提供方唯一可导出的库存语义，不要声称可以恢复历史库存。
- `库存和销量` 仍需澄清销量口径；裸 `库存动销` 不能擅自映射为某一种销量报表。
- 返回生产门禁错误时停止，不得开启门禁或改走兼容命令。

## 路由

| 用户需求 | 标准 data_type |
| --- | --- |
| 最近一个月/一周/两周销量、月度销量 | `sales-monthly` |
| 近三个月每天/每日/逐日销量、近90天日度销量 | `sales-90d` |
| 当前/现在/现有库存、还剩多少货、月底库存或明确日期库存 | `inventory-current-snapshot` |
| 入库/上架时间、仓库产品 | `inbound-listing-time` |
| 两种销量都要、全部销量 | `sales-monthly` + `sales-90d` |
| 全部数据、完整数据、全套 | 全部四类 |

## 自然语言样例

- “最近一个月销量”“最近一周销量”“近期销售表现” → `sales-monthly`。
- “近三个月每天销量”“近90天逐日销量”“销售趋势” → `sales-90d`。
- 只说“最近销量”“近三个月销量”而没有说明统计粒度 → 追问最近一个月汇总，还是近三个月每天销量。
- “当前库存”“现在仓里还有多少货”“月底库存”“8月31日库存” → `inventory-current-snapshot`；当前提供方不区分历史日期库存，不能承诺恢复历史快照。
- “MY8801、TH8802 当前库存” → 只执行这两个仓库；“四仓库存” → 执行四个固定仓库。
- “MY8801 入库时间”仍是全局 `inbound-listing-time`，仓库词只作为提示信息，不进入任务参数。
- “库存和销量”需要补充销量口径；“库存动销”不能直接猜成某一种销量报表。

Agent 只允许调用 frontmatter 声明的统一命令。类型级 CLI 仅用于旧调用兼容，不参与自然语言 Skill discovery；禁止自行尝试相似 endpoint、参数组合或生产探测，也不得改走其他雅仓命令冒充成功。

## 结果

- 只把最后一条 `type="result"` 记录作为 terminal；业务结果在 `data`，附件在 `files`。
- 核对 `overall_status`、`tasks`、`artifacts`、`questions` 与 `diagnostics`。
- `terminal.files` 非空时一次调用 `send_files(paths=<terminal.files>)`；部分成功时保留并交付成功文件，同时报告失败和跳过项。
- `overall_status=failed` 且诊断为 `YACANG_EXECUTOR_NOT_IMPLEMENTED` 表示当前执行器仍处于 fail-closed 阶段，不能冒充导出成功。

真实调用默认关闭。只有运行环境显式设置 `LXE_YACANG_PROD_ENABLED=true` 且凭据完整时，底层命令才允许获取验证码、登录、提交、轮询或下载；Agent 不得根据“检测到凭据”自行开启生产访问。遇到 403、429、认证异常、导出状态未知或提交结果不明确时，遵从命令返回的停止/跳过结果，不得自行重跑。
