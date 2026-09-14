---
name: yacang-inbound-listing-time-export
description: 导出雅仓产品 → 仓库产品中的在售资料 XLSX，并以原生“创建时间”作为业务所需的入库/上架时间；用户提到仓库产品、入库时间、上架时间或产品资料导出时使用。
type: yacang_operations
commands:
  - lxeskill yacang export inbound-listing-time
---

# 雅仓入库/上架时间导出

## 输入与边界

- 业务方已确认：雅仓原生 `创建时间` 就是本业务所需的入库/上架时间，不改名、不推导其他日期。
- 该导出没有仓库筛选，一次生成包含全部在售仓库产品的一份 XLSX；不得按四仓拆分。
- `as_of_date` 仅用于确认执行日和文件命名；用户未指定时省略，由命令使用当天日期。不得用过去日期冒充历史资料快照。
- 文件保留雅仓原生 11 列，并校验 `创建时间` 为 `YYYY-MM-DD HH:MM` 文本。
- 文件名固定为 `雅仓系统-产品-仓库产品_<日期>.xlsx`。

## 执行

必须通过 `exec` 调用 frontmatter 声明的固定命令，禁止直接执行 Python 模块、自己拼雅仓 API 参数、传入账号密码或复用 Token/Cookie。

```text
lxeskill yacang export inbound-listing-time
lxeskill yacang export inbound-listing-time --as-of-date 2026-09-13
```

只启动一次。命令内部自动登录、提交一次导出、轮询下载队列、下载、去重并校验 XLSX；运行中不要重复启动或自动重试。

真实请求默认关闭，仅在 `LXE_YACANG_PROD_ENABLED=true` 且凭据完整时放行。创建型 GET 禁止自动重试；429 会进入跨进程持久化的 15 分钟 cooldown。

## 结果

- 只把最后一条 `type="result"` 记录作为 terminal；先检查 `ok`，业务结果在 `data`，附件在 `files`。
- 成功时核对 `export_count=1`、`creation_time_field="创建时间"`，并说明文件行数和来源。
- terminal `files` 非空时一次调用 `send_files(paths=<terminal.files>)`，不要重复发送。
- 失败时原样转述 `exception` 中已经脱敏、截断的实际原因；不要猜测原因或自动重试生产导出。
