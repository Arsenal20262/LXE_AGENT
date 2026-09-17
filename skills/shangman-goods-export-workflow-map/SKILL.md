---
name: shangman-goods-export-workflow-map
description: 智慧印尼商品原始导出唯一入口。用户询问销量、库存、月末快照、入库时间或上架时间时使用；这些问法统一得到同一个智慧印尼商品 XLSX，不把源文件没有的逐日或历史字段包装出来。
type: amazon_replenish
commands:
  - lxeskill shangman export preview
  - lxeskill shangman export run
---

# 智慧印尼商品导出

## 入口和语义

- 这是智慧印尼商品原始导出的唯一公开 Skill。月度 7/14/30 天销量、90 天日度销量、库存、月末快照、入库时间和上架时间都归一为同一个 `goods-export` 任务。
- Skill 接收完整的原始 `request_text`，保留原文并交给 CLI 做确定性 Intent/Planner 归一化；不要在 Skill 中重写日期、仓库或报表字段。
- 源文件只按平台实际导出的字段交付。产品文字不能声称该文件包含 14 天字段、90 天逐日明细或历史月末字段。

## 执行

- 先通过 `exec` 调用 `lxeskill shangman export preview --request-text "<完整原始请求>"`，读取最终 `type="result"` 的 `data.intent` 和 `data.plan`。
- 需要执行时调用 `lxeskill shangman export run --request-text "<完整原始请求>"`，只把最终 terminal 的 `files` 中的一个原始 XLSX 交付给用户。
- `run` 的业务结果可能等待生产授权、运行环境凭据或人工验证码输入；保留 `data.error.code`、`data.error.message` 和 `data.error.recoverable`，向用户说明需要的下一步，不猜验证码、不绕过权限、不重复启动请求。
- 只有 `ok=true` 且 `files` 有真实路径时才说文件已生成。没有 artifact 时不能猜测文件名或路径。

## 交付边界

- 文件名由底层客户端统一为 `智慧印尼-商品-YYYYMMDD-HHMMSS.xlsx`。
- 交付的是平台原始 XLSX；不在 Skill 层重写、补列、合并或伪造日度历史数据。
- 生产门禁、Desktop 凭据设置、Cloud enrollment、验证码图片展示与人工输入由后续阶段接入；本 Skill 只保留可恢复等待状态。
