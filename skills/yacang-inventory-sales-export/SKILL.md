---
name: yacang-inventory-sales-export
description: 从雅仓自动登录并按创建日期范围分别导出 MY8801、PH8805、TH8802、VN8806 四个仓库的库存动销 XLSX。用户要求雅仓库存动销、销量或四仓 Excel 导出时使用。
type: yacang_operations
commands:
  - lxeskill yacang inventory-sales export
---

# 雅仓库存动销导出

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

## 结果

- 只把最后一条 `type="result"` 记录作为 terminal；先检查 `ok`，业务结果在 `data`，附件在 `files`。
- `success=true`：说明已按四个仓库分别导出，并列出 `exports` 中的仓库、行数和来源；`sales_window_days=15` 表示两周需求使用雅仓原生 15 天口径。
- terminal `files` 非空时一次调用 `send_files(paths=<terminal.files>)`，不要逐个或重复发送。
- `success=false`：原样转述 `exception` 中已经脱敏、截断的实际失败原因；不要猜测原因，也不要自动重试生产导出。
