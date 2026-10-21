---
name: mabang-delivery-packing-list-export
description: 下载马帮 WMS 托运单装箱数据 Excel。用户明确要求装箱数据、托运单 Excel、WMS 下载、原始装箱数据、不要拆分装箱数据，或为 Amazon FBA 创建货件准备装箱 Excel 时使用；不要用于 FBA 发货单、发货单 SKU 数据、发货单表格下载。
type: amazon_fba
commands:
  - lxeskill mabang delivery packing-list export
---

需要查询 lxeskill 产物目录时，运行 `lxeskill datasets list`；返回的 `dir` 相对于当前环境的 `artifact_root`。

# WMS Box Download

## Hard Rules

- 必须通过 exec 调用 frontmatter commands 中声明的 lxeskill 命令；禁止直接执行对应 Python 业务模块。
- 使用命令行选项传参，不接受 --input-json、--stdin-json 或旧命令别名。
- 只在用户明确提到 WMS、装箱数据、托运单 Excel 或创建货件前置装箱文件时使用。
- 下载前必须明确 `split-mode`：`auto` 或 `original`。用户没说明就先追问。

## 认证与失败诊断

本命令下载马帮 WMS 装箱数据，认证由马帮 CLI 管理。紫鸟在本项目中只用于登录和操作电商平台的卖家店铺后台，如 Amazon Seller Central。马帮需要刷新认证时，桌面使用 Electron 认证窗口，独立 CLI 使用已绑定的 Chrome/Edge；认证在独立临时会话中完成，因此在紫鸟里登录或打开页面不会补充马帮命令所需的认证状态。

认证刷新先读取 FBA `freeToken`，再进入 WMS，因此装箱下载也可能在 `stage=fba_delivery` 失败。认证诊断附在 `error.message` 中，包括 `auth_environment`、阶段和实际异常；等待 token 失败时还有 `details`，可结合 frame、读取次数及 `last_read_error` 判断观察结果，不能凭 token 缺失断定马帮改版或需要人工点击。

认证获取或恢复失败后，未经用户授权再次尝试，不追加刷新或重跑下载。

## Required Input

- `delivery_no`：必须是 `SP` 开头的发货单号。
- `split-mode`：
  - `auto`: 用户说“自动拆分”“按系统默认”“超过 5 箱拆分”。
  - `original`: 用户说“使用原始装箱数据”“原始文件”“不要拆分”“不拆”。

## Command

```text
lxeskill mabang delivery packing-list export --delivery-no <SP单号> --split-mode auto
```

```text
lxeskill mabang delivery packing-list export --delivery-no <SP单号> --split-mode original
```

## Result Handling

只把最后一条 `type="result"` 记录作为 terminal，先看 `ok`；下表业务字段均位于 `data`，附件位于 `files`。

| Result | Meaning | 后续创建货件 `consignment_no` |
|---|---|---|
| `split_mode=original` | 按用户要求保留原始装箱数据；即使超过 5 箱也不拆分 | 原始 `ship_no` |
| `split_mode=auto` 且 `split_required=true` | 超过 5 箱，已按每 5 箱生成拆分文件 | 拆分文件名对应编号，如 `SP2000202021-1` |
| `split_mode=auto` 且 `split_required=false` | 未超过拆分阈值 | 原始 `ship_no` |

- `ok=true`：告诉用户托运单 Excel 已准备好，业务文件路径见 `data.excel_path`。
- terminal `files` 已按拆分结果选择正式交付文件，非空时一次调用 `send_files(paths=<terminal.files>)`；不要额外发送诊断用原始文件。
- 如有 `data.split_excel_paths`，列出这些拆分文件供后续创建货件使用。
- 如有 `data.split_skipped_reason`，简要转述。
- `ok=false`：保留 `error.message` 中的实际诊断，说明已确认的失败阶段。仅当实际 WMS 下载返回空内容或空文件（包括非 Excel 报错中响应头和正文均为空）时，询问用户：“<SP 单号> 的 WMS 装箱数据是否已从 ERP 中删除？”不要仅凭空响应断定数据已删除或接口故障。
- 用户继续创建 Amazon FBA 货件时，切到 `fba-shipment-create`。
