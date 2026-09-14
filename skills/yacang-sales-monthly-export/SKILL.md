---
name: yacang-sales-monthly-export
description: 从雅仓库存动销原始导出中提取 7天销量、15天销量、30天销量，按 MY8801、PH8805、TH8802、VN8806 四仓生成四份 XLSX；用户提到 7/15/30 销量或库存动销业务表时使用。
type: yacang_operations
commands:
  - lxeskill yacang export sales-monthly
---

# 雅仓库存动销 7/15/30 导出

## 输入与边界

- `as_of_date` 是文件日期，格式 `YYYY-MM-DD`；用户未指定时省略，由命令使用当天日期。
- 仓库固定为 MY8801、PH8805、TH8802、VN8806。
- 每份文件保留 `SKU`、`商品名`、`仓库`、`7天销量`、`15天销量`、`30天销量`。
- 雅仓没有 14 天销量字段；不得把原生 `15天销量` 改名或解释成 14 天。
- 文件名固定为 `雅仓系统-库存动销_<仓库>_<日期>.xlsx`。

## 执行

必须通过 `exec` 调用 frontmatter 声明的固定命令，禁止直接执行 Python 模块、自己拼雅仓 API 参数、传入账号密码或复用 Token/Cookie。

```text
lxeskill yacang export sales-monthly
lxeskill yacang export sales-monthly --as-of-date 2026-09-13
```

只启动一次。命令内部自动登录一次，四仓串行提交、轮询、下载、去重并校验原始 XLSX，再在本地生成四份业务文件；运行中不要重复启动或自动重试。

真实请求默认关闭，仅在 `LXE_YACANG_PROD_ENABLED=true` 且凭据完整时放行。创建型 GET 禁止自动重试；429 会进入跨进程持久化的 15 分钟 cooldown。

## 结果

- 只把最后一条 `type="result"` 记录作为 terminal；先检查 `ok`，业务结果在 `data`，附件在 `files`。
- 检查 `overall_status` 与每个 `exports[].status`；部分成功时交付已有文件，并明确失败/跳过仓库。完整成功时核对 `export_count=4`、`sales_window_days=[7,15,30]`。
- terminal `files` 非空时一次调用 `send_files(paths=<terminal.files>)`，不要逐个或重复发送。
- 失败时原样转述 `exception` 中已经脱敏、截断的实际原因；不要猜测原因或自动重试生产导出。
