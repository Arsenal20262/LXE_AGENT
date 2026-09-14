---
name: yacang-inventory-sales-export
description: 第一版兼容入口：按明确的任意创建日期范围分别导出四仓雅仓库存动销原始 XLSX。不要用于销量 7/15/30、日度 90 天、月末快照或入库/上架时间。
type: yacang_operations
commands:
  - lxeskill yacang inventory-sales export
---

# 雅仓库存动销导出

这是第一版兼容入口。销量 7/15/30 请求改用 `yacang-sales-monthly-export`，日度 90 天请求改用 `yacang-sales-90d-export`；其他雅仓导出类型先由 `yacang-export-workflow-map` 路由。

## 输入

- 必须取得 `start_date` 和 `end_date`，格式均为 `YYYY-MM-DD`；缺少时先询问用户。
- 雅仓原生表包含 3/7/15/30/60/90 天销量，没有 14 天列；需要“两周”口径时说明并使用 15 天销量。
- 仓库固定为 MY8801、PH8805、TH8802、VN8806，一次成功调用返回四份独立 XLSX。

## 执行

必须通过 exec 调用 frontmatter 声明的固定命令，禁止直接执行 Python 模块、自己拼接雅仓 API、传入账号密码、复用 Token/Cookie 或访问浏览器页面：

```text
lxeskill yacang inventory-sales export --start-date <YYYY-MM-DD> --end-date <YYYY-MM-DD>
```

只启动一次。命令内部会自动登录、串行提交四仓导出、轮询雅仓导出队列、去重缓存、下载并校验 XLSX；运行中不要重复启动。

真实请求默认关闭，仅在 `LXE_YACANG_PROD_ENABLED=true` 且凭据完整时由底层放行。创建导出任务即使使用 GET 也不会自动重试；队列和下载仅对网络级临时错误做一次有退避的重试。429 会进入跨进程持久化的 15 分钟 cooldown。

## 结果

- 只把最后一条 `type="result"` 记录作为 terminal；先检查 `ok`，业务结果在 `data`，附件在 `files`。
- 必须同时检查 `overall_status` 和每个 `exports[].status`。`success` 为 true 可能是完整成功，也可能是已有可交付文件的 `partial_success`；按仓库说明 `success`、`failed`、`submit_unknown`、`skipped`，不要把部分成功说成全部成功。
- `sales_window_days=15` 表示两周需求使用雅仓原生 15 天口径。
- terminal `files` 非空时一次调用 `send_files(paths=<terminal.files>)`，不要逐个或重复发送。
- 对失败仓原样转述已脱敏、截断的实际阶段、错误码和原因；不要猜测原因，也不要自动重试生产导出。已有成功文件仍须交付。
