---
name: zhihui-tms-product-export
description: 用户要求智汇 TMS 菲律宾商品全量数据、销量相关字段、库存快照措辞或入库上架时间时使用。当前只提供商品导出接口，不提供独立的历史报表。
type: business
commands:
  - lxeskill tms philippines products-export
---

# 智汇 TMS 菲律宾商品导出

先通过 CLI 预览固定导出计划，再在用户明确要求执行导出时使用 `action=execute`。只调用声明的命令，不自己拼 TMS HTTP 请求、Cookie、Token 或账号密码。

```text
lxeskill tms philippines products-export --action preview --request "菲律宾商品数据"
lxeskill tms philippines products-export --action execute --request "菲律宾商品数据"
```

CLI 不接受凭据参数。执行需要 Desktop 在进程环境中安全注入账号、密码和生产调用开关；缺失时直接返回失败。不要把账号密码写进命令、输入 JSON、聊天或文件。

“销量月度 7/14/30 天”“销量日度 90 天”“库存月末快照”“入库/上架时间”都归一化为同一商品全量导出，不得宣称这是四个独立的历史报表。没有真实历史接口时，只说明导出文件中实际提供的字段。

只读取最后一条 `type="result"` 记录。`ok=true` 且 `action=execute` 时，按 `data.artifacts` 说明分页及合并 XLSX，并交付 `files`。`action=preview` 时只报告计划，不说文件已生成。失败时转述真实的脱敏错误；若 `files` 中已有分页文件，可作为部分结果交付，但不称合并完成。429、403、验证码或账号异常后不要重复运行命令。
