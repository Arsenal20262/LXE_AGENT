---
name: yacang-sales-90d-export
description: 将雅仓库存动销原始导出中的 90天销量字段按 MY8801、PH8805、TH8802、VN8806 四仓拆成四份独立 XLSX；用户提到日度90天、90天销量或近90天销量文件时使用。
type: yacang_operations
commands:
  - lxeskill yacang export sales-90d
---

# 雅仓日度 90 天销量导出

## 输入与边界

- `as_of_date` 是文件日期，格式 `YYYY-MM-DD`；用户未指定时省略，由命令使用当天日期。
- 仓库固定为 MY8801、PH8805、TH8802、VN8806。
- 每份文件只保留 `SKU`、`商品名`、`仓库`、`90天销量`，不伪造逐日明细。
- 文件名固定为 `雅仓系统-库存动销-<仓库>_日度90天_<日期>.xlsx`。

## 执行

必须通过 `exec` 调用 frontmatter 声明的固定命令，禁止直接执行 Python 模块、自己拼雅仓 API 参数、传入账号密码或复用 Token/Cookie。

```text
lxeskill yacang export sales-90d
lxeskill yacang export sales-90d --as-of-date 2026-09-13
```

只启动一次。命令内部自动登录一次，四仓串行提交、轮询、下载、去重并校验原始 XLSX，再在本地生成四份业务文件；运行中不要重复启动或自动重试。

真实请求默认关闭，仅在 `LXE_YACANG_PROD_ENABLED=true` 且凭据完整时放行。创建型 GET 禁止自动重试；429 会进入跨进程持久化的 15 分钟 cooldown。

## 结果

- 只把最后一条 `type="result"` 记录作为 terminal；先检查 `ok`，业务结果在 `data`，附件在 `files`。
- 检查 `overall_status` 与每个 `exports[].status`；部分成功时交付已有文件，并明确失败/跳过仓库。完整成功时核对 `export_count=4`、`sales_window_days=90`。
- terminal `files` 非空时一次调用 `send_files(paths=<terminal.files>)`，不要逐个或重复发送。
- 失败时原样转述 `exception` 中已经脱敏、截断的实际原因；不要猜测原因或自动重试生产导出。
