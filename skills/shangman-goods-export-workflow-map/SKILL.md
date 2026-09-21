---
name: shangman-goods-export-workflow-map
description: 用户当前轮明确提到“智慧”或“智慧印尼/Shangman”，并查询销量、库存、入库、上架或最近时间时使用的唯一智慧导出入口；这些语义都交付同一个 XLSX。当前轮平台优先于历史 Context；不用于雅仓、智汇/TMS 或马帮巴西。
type: amazon_replenish
commands:
  - lxeskill shangman export preview
  - lxeskill shangman export run
---

# 智慧商品导出

## 入口和语义

- 这是智慧商品原始导出的唯一公开 Skill。用户只明确说“智慧”时，按当前唯一支持的印尼平台填充 `country: "印尼"`；不要追问用户客户端认证或底层参数。
- 当前轮明确的平台、数据类型和时间高于历史 Context。只有用户说“刚才”“同上”“还是那个”时才继承缺失参数；当前轮明确雅仓、智汇/TMS 或马帮时不使用本 Skill。
- 先由 AI 把用户话语转换成结构化 `params`，再交给 CLI 做 schema 校验；Python 不再通过关键词解析用户话语。
- `params` 必须包含 `platform: "智慧"`、`country: "印尼"`、`operation: "goods_export"` 和非空 `requested_metrics`。可选 `sales_windows_days` 只能使用 7、14、30 或 90。
- 可用的 `requested_metrics` 为 `sales`、`inventory`、`inbound_time`、`listing_time`。月度 7/14/30 天销量、90 天日度销量、库存、月末快照、入库时间和上架时间都归一为同一个 `goods-export` 任务。
- 例如“导出智慧印尼 30 天销量和库存”应先转换为 `{"platform":"智慧","country":"印尼","operation":"goods_export","requested_metrics":["sales","inventory"],"sales_windows_days":[30]}`，再调用命令。
- 源文件只按平台实际导出的字段交付。产品文字不能声称该文件包含 14 天字段、90 天逐日明细或历史月末字段。

## 执行

- 用户已明确要查询或导出，且结构化参数齐全时，直接调用 `run`，不先执行重复校验的 `preview`。
- 只有用户明确要求预览执行计划时，才调用 `lxeskill shangman export preview --params '<JSON>'`。
- 执行时调用 `lxeskill shangman export run --params '<JSON>'`，只把最终 terminal 的 `files` 中的一个原始 XLSX 交付给用户。
- `run` 的业务结果可能等待生产授权、运行环境凭据或人工验证码输入；保留 `data.error.code`、`data.error.message` 和 `data.error.recoverable`，向用户说明需要的下一步，不猜验证码、不绕过权限、不重复启动请求。
- 只有 `ok=true` 且 `files` 有真实路径时才说文件已生成。没有 artifact 时不能猜测文件名或路径。

## 验证码恢复

- 如果 `run` 的最终业务结果是 `data.error.code == "captcha_input_required"`，读取其中不透明的 `data.error.challenge_id`，立即调用原生 `shangman_captcha`，只传 `challenge_id`。
- 不要把验证码图片、验证码文字、`captcha_key` 或任何凭据放进 `ask_user_question`、命令参数、回复文本或日志；不要自行识别、猜测、重试验证码，也不要把 `captcha_code` 加回公开命令输入。
- `shangman_captcha` 返回 accepted 后，使用完全相同的原始请求再次调用上面的唯一 run 命令。`captcha_input_pending`、`captcha_expired` 或 `captcha_channel_unavailable` 按原错误的可恢复性向用户报告；不要循环重试。

## 交付边界

- 文件名由底层客户端统一为 `智慧-商品-YYYYMMDD-HHMMSS.xlsx`。
- 交付的是平台原始 XLSX；不在 Skill 层重写、补列、合并或伪造日度历史数据。
- 生产门禁和 Desktop 凭据设置由 Desktop 管理；验证码图片只在当前会话的临时 Desktop 面板展示，人工输入通过一次性本地通道返回给当前导出，不进入会话 transcript 或浏览器存储。
