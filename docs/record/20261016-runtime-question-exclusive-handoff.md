# Runtime 提问批次独占修复交接

- 日期：2026-10-16
- 分支 / Pool：`codex/runtime-question-exclusive` / `pool-6`
- 基线：`main`，`9f36647a434d5bb5c90e983666662aed9110e18d`
- 范围：仅公共 Runtime 提问批次调度；没有修改马帮 TMS 业务、认证、CLI、分页或 Excel。
- Git：本提交包含下列 4 个文件；提交后工作区应保持干净。未 push、未创建 PR。

## P1 根因与修复

`runTurn()` 原来只让 `ask_user_question` 串行执行，仍继续原响应的其他工具调用。导出排前面会先执行；排后面会在回答或跳过后执行。`UserQuestionService.submit()` 只完成答案 Promise，没有恢复工具队列的逻辑。

现在 Runtime 在工具分派前识别整批响应是否含提问。若包含，其他工具在进入 `executeToolCall()` / `ToolRegistry.execute()` 前就生成 `is_error` 未执行结果，不启动工具、进程或异步任务。提问批次不建立并行组。结果保持原调用 ID 和顺序，沿用既有 result slots、cancel、steering 和模型循环；没有新增队列或全局状态。多个提问调用仍按现有串行机制处理，单次工具本身支持 1–3 个问题。

回答、跳过、取消、参数校验失败和交互异常都不会恢复旧调用。后续模型响应依据提问结果发出的新调用仍可正常执行。无提问的普通批次保持原有相邻并行分组和串行屏障。

## 修改文件与入口

- `packages/agent/runtime/src/engine/runtime.ts`：`runTurn()` 在分派入口增加批次保护。
- `packages/agent/runtime/test/engine/runtime.test.ts`：迁入原两个失败回归（仅离线 fake exec，不执行命令）；新增 18 个顺序 / 结果组合，检查真实工具 handler 轨迹、模型轮次及 result closure。
- `docs/harness/tool/ask-user-question.md`：记录批次独占和旧调用不恢复的合同。
- 本交接文件。

调用链：Provider response → `runTurn()` 批次识别 → 其他调用未执行结果 / 原 `executeToolCall()` → `ToolRegistry.execute()` → `UserQuestionService.ask()` / `submit()` → 原工具结果闭合 → 后续 Provider response。

环境变量、认证、协议版本和工具 schema：无变化。各工作区独立依赖；没有复制 `.venv`。

## 已执行验证

所有命令从 `pool-6` 仓库根执行，捕获真实退出码，未通过管道隐藏失败。

1. 修复前原两用例：`bun test packages/agent/runtime/test/engine/runtime.test.ts --test-name-pattern 'mixed question/exec'` → **0 pass / 2 fail**。提问在前时跳过后 fake exec 执行，exec 在前时回答前执行。
2. 修复前新增矩阵：`--test-name-pattern 'question batch'` → **2 pass / 16 fail**。
3. 修复后上述合并定向：`--test-name-pattern 'mixed question/exec|question batch'` → **20 pass / 0 fail**。
4. `bun test packages/agent/runtime/test/engine packages/agent/runtime/test/tooling/user-questions.test.ts packages/foundation/protocol/test/user-questions.test.ts apps/gateway/test/orchestration/scheduler.test.ts` → **239 pass / 0 fail，13 文件，1517 assertions**。20 个修复回归已包含在 239 内，不重复计数。
5. `bun run --cwd packages/agent/runtime typecheck` → **退出码 0**。
6. `git diff --check` → **退出码 0**；最终范围、敏感信息和 Git 状态检查见会话报告。

矩阵覆盖提问在首 / 中 / 尾，普通工具可并行时的拦截，回答、跳过、取消、提交后立即取消、问题参数失败、交互异常、重复提交、回答后新模型调用、取消后新用户回合，以及原调用结果逐项闭合与排序。既有测试覆盖普通相邻并行组、串行屏障、工具错误、取消、steering、artifact、上下文和 Gateway 调度。

日志保存在系统临时目录：`/private/tmp/lxe-runtime-question-{red,matrix-red,green,regression,typecheck}.log`，不纳入 Git。

## 限制、PR 与下一步

- P0 / P2 / P3：本次范围未发现新增明确缺陷；P1 已离线复现并修复。
- **NOT VERIFIED**：真实 Electron 问题卡片端到端、真实模型行为、生产导出；未访问生产。未运行全项目测试，按规范留到合并前最终基线验证。
- 可作为独立 Runtime 修复 PR，不依赖 TMS 分支或其未提交文件。未创建 PR，等待用户审核与单独 Git 授权。
- `pool-3 / codex/mabang-tms-warehouse-export` 保持原样，尚未包含本 Runtime 修复；其两个失败回归须在获批集成 Runtime 修复后重跑，不能据本工作区结果声称 TMS 分支已经通过。
- 后续 TMS 审查应核对已有真实响应中 `totalPage: 1` 与数千条 `totalNum` 的不一致，确定真实分页合同，避免严格校验误拒正常分页。本分支没有修改相关代码。
- 下一步：等待用户审核本分支 diff；push 和创建 PR 需分别授权。Runtime 修复合入后，再按批准的集成方式验证 TMS，禁止自动改动或同步其他分支。
