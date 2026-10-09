---
name: shangman-products-export
description: 以上马 ERP 为数据来源，导出涉及 Shopee（虾皮）和 TikTok Shop（TK/Tik）业务的海外仓商品、库存及 SKU 销量原始 XLSX。明确指定上马 ERP 导出时优先使用本 Skill；不用于雅仓、马帮 ERP 或马帮 TMS。
type: replenishment
commands:
  - lxeskill shangman products export
---

# 上马商品导出

## 接口与业务数据说明

数据来自上马 ERP（`https://erp.shangmanet.com`）。商品原始报表导出接口 `POST /api/blade-goods/goods/merchant/exportNew` 用于生成当前配置账号可见范围内的商品原始报表，不直接从 Shopee 或 TikTok Shop 官方 API 取数。

这些海外仓商品数据涉及 Shopee（虾皮）和 TikTok Shop（TK/Tik）业务。商品、库存和 SKU 销量共用一份原始 XLSX；两个销售平台名称表示业务归属，并非两个独立的上马导出接口。

接口响应的 `data` 返回下载地址，现有 CLI 下载并校验后才得到交付用的 XLSX。接口地址仅作说明，实际执行必须通过 `lxeskill shangman products export`，不能据此自行发送 HTTP 请求。

主要字段及业务含义如下，字段名称以本次原始文件实际表头为准：

| 字段 | 业务含义 |
|---|---|
| SKU（商品编码） | 商品识别编码 |
| 商品名称 | 商品名称信息 |
| 总数量 | 上马 ERP 报表中的总数量字段 |
| 有效库存 | ERP 定义的有效库存数量 |
| 锁定库存 | ERP 定义的锁定库存数量 |
| 在途库存 | ERP 定义的在途库存数量 |
| 预警库存 | 上马 ERP 报表中的预警库存字段 |
| 仓库名称 | 报表记录对应的仓库 |
| 7／15／30 天销量 | 各时间窗口的累计销量，不是日均销量或逐日明细 |

库存字段沿用上马 ERP 口径，不自行推导库存公式或字段间的关系。

## 范围

- 支持独立导出和东南亚数据准备，交付采集结果；不执行备货计算。
- 用户明确要求上马商品、库存或销量导出时，直接执行当前配置账号可见范围的全量原表导出，不再询问是否导出或要求二次确认。
- 用户只提 Shopee 或 TikTok Shop，未指定 ERP 且已有上下文也不能确定取数系统时，先确认数据来源，不能仅凭销售平台名称自动选择本 Skill。
- 当前 Skill 的导出能力不支持按销售平台、店铺、日期或仓库筛选。用户提及这些范围时，说明实际交付仍为账号可见的全量原表，并直接按默认范围导出，不要求再次确认，不宣称已按条件筛选。用户明确只允许限定范围或禁止全量导出时，说明能力限制并停止。
- 不根据 SKU 或商品名称自行判断销售平台，不把账号全量或混合报表描述成某个平台独有的数据。
- 即使请求同时涉及 Shopee 和 TikTok Shop，也只执行一次全量导出，不按平台重复执行或拆分文件、销量。
- 不承诺逐日销量明细、历史库存、独立入库／上架报表或补货建议。

## 执行与登录衔接

通过 `exec` 调用唯一命令，不拼接口、不执行内部 Python 模块、不传账号、Token 或下载地址：

```text
lxeskill shangman products export
```

- 无需先查登录状态或额外预览。脚本读取已保存的登录态；命令仍在运行时等待同一执行，不重复启动。
- 返回 `data.error.code=login_required` 时，读取并使用 `shangman-login` Skill。遵守现有验证码识读、用户纠正和失败重试规则；只有登录成功且已保存，才返回本 Skill 继续原导出任务。
- 同一导出任务最多自动衔接一次登录。恢复后仍需登录时报告真实错误并停止，不形成登录／导出循环。
- 缺少桌面配置时说明实际缺项。权限拒绝、限流、网络错误、导出结果不确定等错误均保留实际诊断，不自动重复提交。

## 校验与交付

- 只认最后一条 `type="result"`，先看顶层 `ok`，再读取 `data` 和 terminal `files`。
- 成功时保留 `data.artifact_path`、`data.sheet_names`、`data.row_count` 及 terminal `files`。独立导出或数据准备任务中，`files` 包含真实文件时一次调用 `send_files(paths=<terminal.files>)`，已发送的不重复发送。只交付这一份平台原始 XLSX，不修改内容、补列或生成新报表。
- 文件名为 `上马-商品-YYYYMMDD-HHMMSS.xlsx`；报告文件名和 `row_count`，零行时明确说明没有商品数据。
- 文件生成与附件交付分开说明，发送成功才称已交付。发送失败只重试文件交付，不重新执行导出。
- 失败转述 `data.error` 与顶层 `error.message` 的实际脱敏诊断，不猜失败原因，不读取或展示本地 Token。
