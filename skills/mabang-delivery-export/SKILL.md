---
name: mabang-delivery-export
description: 下载马帮 FBA 发货单 SKU 数据 CSV。用户要求获取、导出、下载 FBA 发货单、发货单 SKU 数据、发货单表格、SP 发货单 CSV 时使用；不要用于 WMS 装箱数据或托运单 Excel。
type: amazon_fba
commands:
  - lxeskill mabang delivery export
---

需要查询 lxeskill 产物目录时，运行 `lxeskill datasets list`；返回的 `dir` 相对于当前环境的 `artifact_root`。

# FBA Delivery CSV Download

## Hard Rules

- 必须通过 exec 调用 frontmatter commands 中声明的 lxeskill 命令；禁止直接执行对应 Python 业务模块。
- 使用命令行选项传参，不接受 --input-json、--stdin-json 或旧命令别名。
- 不要直接拼马帮 API 请求，不要手写、复用或展示 bearer/freeToken。
- 当前 v1 交付马帮导出的 CSV，不要转换成 xlsx。
- CLI 可能运行几十秒；命令仍在运行时不要频繁轮询或重复启动。

## 认证与失败诊断

CLI 使用当前配置的马帮账号，按需在独立临时会话中恢复认证：桌面使用 Electron 认证窗口，独立 CLI 使用已绑定的 Chrome/Edge。

认证失败时，`error.message` 包含 `stage`、实际 URL、异常和 `auth_environment`；等待 FBA token 失败还包含 `details`。`target_frame_missing` 表示等待期间没有匹配的页面 frame；`storage_read_failed` 表示读取均失败；`storage_value_empty` 表示有读取完成但未得到 token，仍需结合 `read_error_count` 和 `last_read_error` 看实际异常。以上都不能单独证明马帮改版或需要人工点击。

认证获取或恢复失败后，未经用户授权再次尝试，不追加刷新或重跑导出。

## Required Input

- `delivery_no`: `SP` 开头的发货单号。
- 缺少明确 `SP...` 发货单号时先追问，不要启动 CLI。

## Command

```text
lxeskill mabang delivery export --delivery-no <delivery_no>
```

## Result Handling

只把最后一条 `type="result"` 记录作为 terminal，先看 `ok`；业务字段位于 `data`，附件位于 `files`。

- `ok=true`：告诉用户 FBA 发货单 CSV 已下载完成，业务文件路径见 `data.csv_path`。
- terminal `files` 非空时一次调用 `send_files(paths=<terminal.files>)`；不要直接发送未经校验的 `data.csv_path`。
- `ok=false`：保留 `error.message` 中的实际诊断，说明已确认的失败阶段，不另行猜测原因。
