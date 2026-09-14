---
name: yacang-inventory-month-end-export
description: 导出雅仓 MY8801、PH8805、TH8802、VN8806 四个仓库的当前库存列表，每仓生成一份 XLSX；用户提到库存列表、库存快照或月末库存时使用。
type: yacang_operations
commands:
  - lxeskill yacang export inventory-month-end
---

# 雅仓库存列表导出

## 输入与边界

- 雅仓库存列表接口没有历史日期参数，只能导出执行时的当前库存。
- `as_of_date` 仅用于确认执行日和文件命名；用户未指定时省略，由命令使用当天日期。不支持历史快照补导，不得用过去日期冒充历史月末快照。
- 仓库固定为 MY8801、PH8805、TH8802、VN8806；用户未指定时导出全部四仓，也可通过 `warehouse` 指定其中一个仓库。不得传任意仓库 ID。
- 文件保留雅仓原生 18 列，不自行增删或改名。
- 文件名固定为 `雅仓系统-库存列表_<仓库>_<日期>.xlsx`。

## 执行

必须通过 `exec` 调用 frontmatter 声明的固定命令，禁止直接执行 Python 模块、自己拼雅仓 API 参数、传入账号密码或复用 Token/Cookie。

```text
lxeskill yacang export inventory-month-end
lxeskill yacang export inventory-month-end --as-of-date 2026-09-13
lxeskill yacang export inventory-month-end --warehouse MY8801
```

只启动一次。命令内部自动登录一次，四仓串行提交、轮询、下载、去重并校验 XLSX；运行中不要重复启动或自动重试。

真实请求默认关闭，仅在 `LXE_YACANG_PROD_ENABLED=true` 且凭据完整时放行。创建型 GET 禁止自动重试；429 会进入跨进程持久化的 15 分钟 cooldown。

## 结果

- 只把最后一条 `type="result"` 记录作为 terminal；先检查 `ok`，业务结果在 `data`，附件在 `files`。
- 检查 `overall_status` 与每个 `exports[].status`；部分成功时交付已有文件，并明确失败/跳过仓库。完整成功时核对 `snapshot_semantics="current-at-execution"`；未指定仓库时应有四个成功项，指定单仓时应有一个。
- terminal `files` 非空时一次调用 `send_files(paths=<terminal.files>)`，不要逐个或重复发送。
- 失败时原样转述 `exception` 中已经脱敏、截断的实际原因；不要猜测原因或自动重试生产导出。
