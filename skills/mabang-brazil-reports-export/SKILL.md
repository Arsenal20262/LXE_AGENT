---
name: mabang-brazil-reports-export
description: 从马帮 ERP 导出巴西海外仓 Shopee 业务的库存动销、三个月内待签收及三个月前已签收调拨原始文件，支持独立导出或数据准备流程调用。明确请求马帮巴西海外仓数据时使用本 Skill；不用于马帮 TMS，也不执行 Amazon 或巴西备货计算。
type: replenishment
commands:
  - lxeskill mabang brazil reports export
---

# 马帮巴西海外仓导出

## 理解范围

- “巴西海外仓”在本功能中指马帮 ERP 的巴西海外仓；复用现有马帮配置，不索取账号、Cookie 或 Token，不套用马帮 TMS 认证。
- 本功能导出数据按业务口径属于 Shopee；数据来源是马帮 ERP，不是 Shopee 官方接口。此归属不表示接口支持按销售平台筛选，也不能仅凭 SKU 推断具体店铺或平台。
- 只说“导出巴西数据”时通过已有问答工具询问库存动销、待签收调拨、已签收调拨或所需组合／全部；取消或跳过时停止。
- “库存”“销量”“库存动销”共用 `inventory-sales`，不重复导出。平台原表提供 7／28／42 天累计销量，以实际表头说明；不承诺 15／30 天或逐日销量。
- “待签收”使用 `pending-transfers-within-3-months`（页面默认三个月内），“已签收”使用 `received-transfers-before-3-months`（页面三个月前）。只说“调拨单据”时选择这两类，并告知两个不同时间范围。时间是平台快捷筛选口径，不擅自解释为签收日期。
- 本 Skill 当前只导出巴西海外仓（仓库 ID `1072376`，名称“巴西海外仓”）。其他仓库、自定义日期、历史库存或其他销量窗口不支持，先说明限制并确认是否接受现有范围，不默默替换；这是本 Skill/CLI 的能力边界，不代表马帮 ERP 的其他接口都不支持。

## 接口与数据字段

- 库存动销通过 `POST /index.php?mod=warehouse.searchwarehousestock` 查询记录、`POST /index.php?mod=warehouse.getSearchWarehouseStockPage` 读取分页总数，再通过 `GET /index.php?mod=warehouse.doexportwarehousestock&flag=1&showRmbColumn=0` 下载当前库存动销原表。
- 调拨报表通过 `POST /index.php?mod=warehouseallocation.searchallocation` 查询单据，再由 `POST /index.php?mod=export.doAllocationWarehouseExportFile` 导出所选单据并下载平台返回的原始文件。接口说明用于理解已有能力；执行必须走本 Skill 的 CLI，不手写 HTTP 请求或绕过认证。
- 库存动销原表的已核实字段包括：`库存SKU编号`（SKU 编码）、`仓库`、`仓位`、`销量(7)`、`销量(28)`、`销量(42)`、`仓位库存`和`可用库存量`。销量按表头对应 7／28／42 天累计口径展示，不是逐日明细；库存字段按原表展示，不推导库存公式。当前合同未保证库存动销表包含商品名称列。
- 调拨原表包含批次编号、库存 SKU、中文名称、起始/目标仓位、起始/目标仓库、调拨数量、待签收数量、总入库数量、签收量，以及发货、预期到货、最近签收和签收日期等原始列；字段含义按原表列名说明，不把页面筛选范围解释为某个日期字段的业务含义。
- 库存接口导出原始 XLSX；调拨导出按查询页生成原始 XLS 批次。接口导出结果经 CLI 下载、校验后才成为 terminal `files`；各文件的保留、部分成功和交付规则见下文。

## 执行与交付

模型解析参数，使用已有 `exec` 执行唯一命令，例如全部三类：

```text
lxeskill mabang brazil reports export --report inventory-sales --report pending-transfers-within-3-months --report received-transfers-before-3-months
```

- 通过可重复的 `--report` 传入用户选择的报表。只接受命令行选项，不使用 JSON 输入。运行中等待同一次执行，不重复启动，不手写 API 或改脚本绕过错误。
- 只以最后一条 `type="result"` 的 `ok / data / error / files` 判断结果。按实际结果分别说明库存记录数、调拨单据数、文件明细行数、批次数及完整性，不互相替代。
- 库存交付平台原始 XLSX；调拨每批交付平台原始 XLS，可能超过两份文件。不合并、不裁列、不转换格式、不按 SKU 去重或相加，不推断首次入库／上架时间。
- 独立导出或数据准备任务，将 terminal `files` 交给 `send_files` 一次，已发送的不重复发送。发送成功才称已发送；发送失败只重试附件发送。
- 零记录明确说明没有数据；不能伪造附件。`ok=false` 的部分成功可交付 `files`，必须说明已完成、失败、未执行及缺失范围，不声称全量完成。
- 缺少或失效认证时报告实际诊断和需要恢复马帮 ERP 登录态；不自动登录、刷新或重复提交。其他失败也不自动重跑，用户明确重试后才启动新任务。
