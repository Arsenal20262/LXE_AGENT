---
name: shangman-goods-export-workflow-map
description: 用户当前轮明确提到“智慧”“智慧印尼”或“Shangman”，并查询商品、销量、库存、入库时间、上架时间、月末库存、月末快照、7/14/30/90 天销量、90 天日度销量或最近一个月销量时使用的唯一智慧商品原始导出入口；所有表达都只执行一次 goods_export 并交付一个原始 XLSX。当前轮平台优先于历史 Context；不用于雅仓、智汇/TMS 或马帮。
type: amazon_replenish
commands:
  - lxeskill shangman export preview
  - lxeskill shangman export run
---

# 智慧商品导出

## 入口和语义

- 这是智慧商品原始导出的唯一公开 Skill。用户只明确说“智慧”时，按当前唯一支持的印尼平台填充 `country: "印尼"`；不要追问用户客户端认证或底层参数。
- 当前轮明确的平台、数据类型和时间高于历史 Context。只有用户说“刚才”“同上”“还是那个”时才继承缺失参数；当前轮明确雅仓、智汇/TMS 或马帮时不使用本 Skill。
- 智慧商品、销量、库存、库存加销量、入库时间、上架时间、月末库存、月末快照、7/14/30/90 天销量、90 天日度销量和最近一个月销量都只表示同一个 canonical intent：`goods_export`。
- 上述表达无论出现一个还是多个，参数都固定为 `{"platform":"智慧","country":"印尼","operation":"goods_export"}`；不把指标、周期、日期或快照类型传入执行层。

固定参数逐项如下，除此之外不传其他业务参数：

```yaml
platform: "智慧"
country: "印尼"
operation: "goods_export"
```

- “智慧月末库存”“智慧月末快照”“智慧8月底库存”仍执行当前商品原始导出，不追问日期、不新增历史快照任务，也不宣称文件重建了历史月末状态。
- “智慧库存和销量”“智慧销量、库存和上架时间”“智慧90天日度销量”都只执行一次 `goods_export`，只返回一个原始 XLSX。
- 源文件只按平台实际导出的字段交付。产品文字不能声称该文件包含 14 天字段、90 天逐日明细或历史月末字段。

## 执行

- 用户已明确要查询或导出，且结构化参数齐全时，直接调用 `run`，不先执行重复校验的 `preview`。
- 只有用户明确要求预览执行计划时，才调用 `lxeskill shangman export preview --params '<JSON>'`。
- 正常执行唯一调用为 `lxeskill shangman export run --params '{"platform":"智慧","country":"印尼","operation":"goods_export"}'`；不得按指标或周期拆成多次调用。
- 最后一条 terminal 满足 `ok=true` 且 `files` 恰好包含一个真实 XLSX 时，立即交付并结束；不再查 fixture、parser、transcript 或其他 Skill，不再次调用 `run`。
- 成功只说明“已完成智慧商品原始报表导出”，不得把用户原话中的周期、日度或月末表述包装成文件实际不存在的字段。
- 失败必须保留 terminal 的真实脱敏 `error.code`、`error.message` 和 `data.recoverable`，且 `files=[]`；没有 artifact 时不能猜测文件名或路径。

## 验证码与认证

- `run` 先复用执行层可用的认证状态；平台真实要求验证码时，同一次 `run` 通过现有 Desktop 临时面板和本地安全 Broker 等待人工输入，然后继续登录和导出。
- 验证码等待上限固定为 240 秒并响应任务取消。超时、取消、challenge 过期或通道不可用时，本次 `run` 失败并结束；不让模型调用验证码专用 Tool，也不让模型再次调用 `run`。
- 不把验证码图片、验证码文字、`captcha_key`、`captcha_code` 或凭据放进命令、普通对话、transcript 或日志；不 OCR、不猜测、不暴力尝试、不绕过平台验证。

## 交付边界

- 文件名由底层客户端统一为 `智慧-商品-YYYYMMDD-HHMMSS.xlsx`。
- 交付的是平台原始 XLSX；不在 Skill 层重写、补列、合并或伪造日度历史数据。
- 生产门禁和 Desktop 凭据设置由 Desktop 管理；验证码图片只在当前会话的临时 Desktop 面板展示，人工输入通过一次性本地通道返回给当前这次 `run`，不进入会话 transcript 或浏览器存储。
