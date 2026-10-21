# Runtime 执行流程

本文集中说明一条任务从入口到结果交付的流程，以及 turn、step、工具、取消和持久化的关系。执行事实以 [`runtime.ts`](/packages/agent/runtime/src/engine/runtime.ts) 与对应测试为准；Context、工具和存储的细节分别由其专题维护。

## 端到端链路

```text
桌面 preload IPC / FeishuAdapter
  -> SessionRouter：权限、会话绑定、response route
  -> SessionScheduler：排队、RunHandle、取消
  -> agent-cli / AgentRuntimeHost：JSON-RPC 2.0
  -> TypeScriptAgentRuntime.runTurn()
  -> ContextPipeline -> Provider -> ToolRegistry -> 下一 step
  -> TurnOutcome -> GatewayEmitter -> 桌面展示 / 飞书消息与文件
```

Gateway 位于 Electron Main，Runtime 位于独立的 `agent-cli` 子进程。两者使用 JSON-RPC 2.0、stdin/stdout 和 JSONL 分帧；握手、通知和错误规则见 [Agent 协议](../gateway/agent-protocol.md)。Gateway 负责接入、调度和发送位置，Runtime 负责模型与工具执行。

| 边界 | 主要实现 |
| --- | --- |
| 桌面装配与进程管理 | [`desktop-gateway.ts`](/apps/desktop/src/main/desktop-gateway.ts) |
| 飞书消息归一化 | [`feishu/inbound.ts`](/apps/gateway/src/channels/feishu/inbound.ts) |
| 路由与排队 | [`router.ts`](/apps/gateway/src/orchestration/router.ts)、[`scheduler.ts`](/apps/gateway/src/orchestration/scheduler.ts) |
| Agent 宿主装配 | [`runtime-host.ts`](/apps/agent-cli/src/runtime-host.ts) |
| 执行与上下文 | [`runtime.ts`](/packages/agent/runtime/src/engine/runtime.ts)、[`context.ts`](/packages/agent/runtime/src/engine/context.ts) |
| 模型与工具 | [`provider.ts`](/packages/agent/runtime/src/providers/provider.ts)、[`registry.ts`](/packages/agent/runtime/src/tooling/registry.ts) |
| 持久化与结果交付 | [`storage.ts`](/packages/agent/runtime/src/state/storage.ts)、[`emitter.ts`](/apps/gateway/src/channels/emitter.ts) |

## Turn 建立与快照

Router 校验权限、建立 session、保存 response route 后创建 `AgentJob`；Scheduler 创建 `RunHandle`。Runtime 读取自己的 session 和 pending events，校验 WorkspaceContext 并取得 Workspace Lease。本轮固定 provider generation、system prompt、允许的 skill、模型与上下文窗口，以及 session、route、turn 标识。同一 Lease 的 Skill、AGENTS Instructions 和搜索服务贯穿整个 turn。

Dashboard 修改模型、thinking 或技能配置不会改写已开始的快照；provider 切换从下一 turn 生效。turn 内的工具暴露可以影响后续 step，每次工具调用仍按当前会话权限检查。

普通 turn replay 历史，将 pending events 附到本轮用户内容；heartbeat 处理自己的事件输入。pending events 由 Runtime Store 消费，不经过 Router 或 `AgentJob.raw_data`。入口诊断独立放在 `AgentJob.diagnostics`；Runtime 通过 [`withTurnContext()`](/packages/agent/runtime/src/engine/system-events.ts) 把诊断说明合入本轮 user message 后持久化，字段值始终作为数据处理。

用户消息及之后每条有效 steering 都作为独立 user message 追加，保证 replay 与执行时的顺序一致。飞书普通 turn best-effort 设置 typing，按需创建 `FinalAnswerStreamer`，并初始化 turn/tool/skill usage；本轮用量只结算一次。

## Step 固定顺序

Step 是一次模型请求及其工具结果的闭合周期：

1. 检查 abort，消费 steering 并追加用户消息。
2. 捕获本 step 可见的工具 schemas，预算估算与模型请求使用同一份 schemas。
3. `ContextPipeline.prepare()` 归一化内容、修复工具闭合、处理 image 占位，估算 system、messages、tools 和 image 的完整预算，必要时压缩。
4. Provider 请求与重试，流式输出 text、thinking、redacted thinking 计数、tool use 和 usage。
5. 完整 assistant response 先追加到 transcript。
6. 无 tool use 时进入 final；有调用时按顺序执行相邻的并行组或独占调用。
7. 结果按原调用顺序组成 tool message 追加，再进入下一 step。

Context 的软阈值、硬上限和安全压缩规则见 [Context](context/README.md)；prepare 失败不能用本地伪摘要替代实际失败。只有安全压缩成功才追加相应 `context_patch`。

assistant 先落盘，再执行工具；进程在工具执行中退出时，replay 可以识别未闭合调用并补 unavailable 结果。无 tool use 的响应即使正文为空也会结束，不无限请求模型。

## Provider 与流式输出

普通失败按 Runtime 的 attempt 预算重试，step number 不变，仅增加 attempt。timeout、连接故障、429 和可重试的 5xx 可进入重试；认证、权限、非法请求和 abort 不重试。错误分类与预算以 [Runtime](/packages/agent/runtime/src/engine/runtime.ts) 和 [Provider](/packages/agent/runtime/src/providers/provider.ts) 为准。

context overflow 独立走一次强制 compaction；压缩成功且预算回到硬上限内，才允许再次请求。重复 overflow 或压缩失败终止 turn，不继续消耗普通重试预算。

`FinalAnswerStreamer` 节流展示更新，维护同一 emit id 和单调 sequence；只有完整 provider response 成为 assistant message。thinking signature 和加密块可保留在模型历史，平台展示和日志只接收各自允许的内容。

## 工具执行与暴露

`ToolExposureState` 在 turn 内持续存在：direct 工具按来源和权限过滤；deferred 工具通过 `tool_search` 暴露；读取当前允许的 `SKILL.md` 激活 owner tools。新增暴露从下一 step 的 schema capture 生效，不能让模型在同一 response 中调用此前未提供的工具。

每个调用都检查 steering/cancel、exposure 与 input 边界，记录开始状态，再执行 handler。工具 context 携带 handle、session、route、turn 和 exposure。返回的 state patch 先应用、artifact 先发送，再将 model-visible result 加入本批结果，记录耗时、usage 和展示终态。

工具异常形成 `is_error` 结果，不跳过闭合；后续调用继续按当前策略执行，除非 steering 或 cancel 中断计划。相邻且支持并行的调用成组执行，其余独占，结果始终按原调用顺序持久化。

业务命令通过 native `exec` 启动独立的 `lxeskill ...`，命令契约在 `python/lxeskill_cli/lxeskill/catalog.json`。宿主依据设备权限构造技能范围，exec adapter 注入 `LXESKILL_SKILL_SCOPE`；CLI 负责最终授权、参数校验、dispatch 和 JSONL 输出，Runtime 负责进程观察、输出预算和生命周期。常驻 Bun 进程不加载 Python 业务模块。详见 [工具执行](tools/README.md) 与 [Skill 手册](../skill/README.md)。

## Steering 与取消

工具 dispatch 前发现 steering 时，当前及剩余未执行调用写 skipped/error 结果。Runtime 先闭合这批工具，再追加 steering，开始下一 step；已完成工具不重跑，已发送 artifact 不撤回。

`RunHandle` 的 signal 中断 provider、summary、MCP、问题等待和当前 exec/wait 观察。未执行调用写 cancelled 结果，取消后的 step 不再调用 provider。已创建的 exec 属于 Session，只有显式 terminate、Session 删除或 Runtime 关闭才终止进程树；剩余 steering 由 Scheduler 按 run 状态处理。

`ask_user_question` 只对本轮来自桌面的任务开放，独占等待专用答案，不额外请求模型；普通 steering 不能解除问题等待。

## Cancel 与失败

桌面停止按钮、提问卡片 × 和渠道 `/stop` 使用 `cancel_turn.reason: "user_stop"` 标记主动停止。Runtime 确认 cancelled 后，在完成通知之前追加一次独立 user 消息，绑定原 turn，transcript 的 `reason` 为 `turn_aborted`：

```text
<turn_aborted>
用户主动中断了上一回合。被中断的工具或命令可能已部分执行；后续继续时请先核实实际状态。
</turn_aborted>
```

说明保留在模型历史和原始 transcript 中，桌面依据可信的 `source_reason` 隐藏，只显示“已停止”；不按用户文字过滤，也不拼到下一条用户消息。旧历史不改写。重复停止、旧回合请求、已完成回合、仅清空队列，以及重启、关闭和凭据更新等技术取消均不新增说明。写入失败保留实际错误，取消仍然有效。Gateway 清理队列并暂停自动继续，不再追加停止说明 pending event。

实际诊断与解释必须分开。只有 `cause_known=true`、`verified_reason` 和经过测试的 `mapping_id` 同时存在时，固定文本才可代替原错误；其余保留必要脱敏和显式截断后的实际异常。

Runtime 以 `completed`、`cancelled` 或 `error` 结束，Scheduler 释放 active slot。provider/context/Runtime 的终止性错误关闭本轮；单个工具或 delivery 失败不得使 Bun 进程退出，错误处理也不能拖垮 Gateway。

## Final 与步骤上限

默认不限 step 数，直到自然结束、取消或终止性错误。只有显式设置有限的 `maxSteps` 时，最后一步禁用工具并收尾；若模型仍返回工具调用，不执行，优先使用响应正文，无正文时提示发送下一条消息继续，transcript 仍保持闭合。

正常 final 完成同一条流式回复；只有此前未成功发送 stream frame 时才尝试普通 final emit。随后执行 post-turn context maintenance；它可追加 compaction `context_patch`，失败只记录 warning，不撤销已交付结果。异常或取消也必须关闭 streamer、typing 和 usage。

平台 delivery 是独立边界，发送失败不回滚已持久化 outcome，也不重放工具。

## 持久化与排障

- Gateway 保存 response route 与平台绑定；Runtime 保存 Agent session、pending events、usage 和 transcript 索引；Python 只写自身业务状态。文件布局见 [本地状态与数据库](../../database/local_agent.md)。
- Transcript v2 追加 message、turn metadata 和最小 `context_patch`，不回写旧行。模型 replay 与完整审计展示共享来源，规则见 [Context Persistence](context/context_persistence.md)。
- replay cache 用文件 size/mtime 签名，并在进程内追加时更新；已处理的 base64 image 在持久化边界替换为占位，避免长期保留二进制正文。
- turn、provider attempt、tool、context、usage 和 delivery 的关联字段、事件与脱敏统一见 [日志与诊断](../logger.md)。
