---
name: zhihui-tms-product-export
description: 用户用自然语言要求获取、拉取、查询并导出智汇 TMS 菲律宾站商品数据时使用，例如“导出智汇商品”“下载菲律宾商品资料”“拉取商品清单”“生成商品 Excel/XLSX”，或要求商品的 SKU、销量、库存、入库时间、上架时间等字段并希望整理成文件。口语化表达如“帮我把智汇菲律宾商品数据拉下来”“把商品表导出来”也属于此 Skill。仅限商品全量导出，不处理订单、物流、发货、采购、财务报表或独立历史报表。
type: business
commands:
  - lxeskill tms philippines products-export
---

# 智汇 TMS 菲律宾商品导出

## 自然语言触发边界

以下表达都可归一到本 Skill：

- “导出/下载/拉取/整理智汇菲律宾商品”“把商品清单导成 Excel/XLSX”；
- “查商品 SKU、销量、库存、入库时间、上架时间，并导出文件”；
- “帮我把智汇菲律宾站的商品数据拉下来”“生成商品表”。

如果用户只是在询问订单、物流、发货、采购或财务信息，或要求独立的历史销量/库存报表，不要调用本 Skill；先说明当前接口只提供商品全量导出。

先通过 CLI 预览固定导出计划，再在用户明确要求执行导出时使用 `action=execute`。只调用声明的命令，不自己拼 TMS HTTP 请求、Cookie、Token 或账号密码。

```text
lxeskill tms philippines products-export --action preview --request "菲律宾商品数据"
lxeskill tms philippines products-export --action execute --request "菲律宾商品数据"
```

CLI 不接受凭据参数。执行需要 Desktop 在进程环境中安全注入账号、密码和生产调用开关；缺失时直接返回失败。不要把账号密码写进命令、输入 JSON、聊天或文件。

“销量月度 7/14/30 天”“销量日度 90 天”“库存月末快照”“入库/上架时间”都归一化为同一商品全量导出，不得宣称这是四个独立的历史报表。没有真实历史接口时，只说明导出文件中实际提供的字段。

只读取最后一条 `type="result"` 记录。`ok=true` 且 `action=execute` 时，按 `data.artifacts` 说明分页及合并 XLSX，并交付 `files`。`action=preview` 时只报告计划，不说文件已生成。失败时转述真实的脱敏错误；若 `files` 中已有分页文件，可作为部分结果交付，但不称合并完成。429、403、验证码或账号异常后不要重复运行命令。
