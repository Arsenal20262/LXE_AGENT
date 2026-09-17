# 智汇 TMS 交付：Desktop 查询确认卡

## 工作区与目标

- Worktree / Pool：`/Users/hym/.codex/worktrees/f797/LXE_AGENT`，沿用当前池，不创建 pool2。
- 分支：`codex/zhihui-tms-client-auth`，未在 `main` 开发。
- 只处理智汇菲律宾商品数据查询；雅仓和其他平台不在本次范围。
- 解决“查询智汇销量”进入模型通用工具循环、只给预览计划却不提供执行入口的问题。
- 组长确认智汇归入备货授权域：Skill `zhihui-tms-product-export` 的 type 为 `amazon_replenish`。

## 已实现行为

Desktop 的普通文字回合匹配智汇商品字段后，直接走固定路径：一次离线 CLI `preview` → 会话中展示计划和确认卡 → 仅选择“确认执行导出”才调用一次 `execute`。取消、跳过、停止回合均不会执行；订单、物流、独立历史报表、其他平台及不匹配文本继续原有模型路径。确认卡显示预览日期和“全量商品导出不是独立历史销量报表”的边界。

执行仍由原 Python CLI 检查生产开关、运行时凭据、账号锁、分页与请求预算、403/429 和风控停止条件。本次没有更改接口参数、频率、登录或 XLSX 格式，也没有自动重试执行。确认路由从当前工作区快照读取已放行的 Skill ID，并在每次 CLI 调用时动态注入 `LXESKILL_SKILL_SCOPE`；scope 不含智汇 owner Skill 时不会启动 CLI。进度仅展示智汇 JSONL 白名单阶段；附件只接收存在且位于配置的 artifact root 内的文件。失败时保留经脱敏的实际错误及已有分页文件，不把部分结果称作成功。

## 入口与修改文件

`apps/agent-cli/src/runtime-host.ts` 注入 CLI runner 和 `UserQuestionService`；`packages/agent/runtime/src/engine/runtime.ts` 在模型回合之前识别并交付会话消息、问题卡、工具进度、附件和用量，同时租用当前 workspace 快照；`packages/agent/runtime/src/operations/zhihui-confirmation.ts` 负责匹配、预览、确认与单次执行。`packages/agent/runtime/src/tooling/{user-questions.ts,one-shot-cli.ts}` 分别复用问题所有权、按调用传入 scope 与增量进度解析，`packages/agent/runtime/src/index.ts` 暴露路由。`skills/zhihui-tms-product-export/SKILL.md` 已同步确认卡语义和 `amazon_replenish` 授权分类。

测试变更：`packages/agent/runtime/test/operations/zhihui-confirmation.test.ts`、`packages/agent/runtime/test/engine/runtime.test.ts`、`packages/agent/runtime/test/tooling/one-shot-cli.test.ts`。设计和实施计划：`docs/superpowers/specs/2026-09-17-zhihui-tms-confirmation-router-design.md`、`docs/superpowers/plans/2026-09-17-zhihui-tms-confirmation-router.md`。

## 环境与验证

- 没有新增凭据字段。沿用 Desktop 安全注入的 `ZHIHUI_TMS_ACCOUNT`、`ZHIHUI_TMS_PASSWORD` 和 `ZHIHUI_TMS_PRODUCTION_ENABLED`；正式执行还受 Python CLI 账号锁与预算约束。不要将凭据写到命令、文档或 Git。
- 本次定向 Bun 测试：103 pass、0 fail，覆盖动态 scope 注入、owner Skill 不在 scope 时不启动 CLI、确认卡与附件交付。Runtime 与 Agent CLI TypeScript 类型检查均通过。
- 未在本次改动后调用真实智汇 preview 或 execute；因此不能宣称真实登录和导出已在本次验证成功。
- 已从当前 worktree 重启 Desktop；Gateway 与 Agent CLI 就绪，Skill Catalog 成功加载 57 个 Skill。启动时独立的马帮认证维护任务因“马帮账号为空”失败，与智汇 scope 和导出路径无关。
- 未用真实账号完成 Desktop 人工点击、生产导出或端到端 XLSX 验收；因此不能宣称真实登录和导出已在本次验证成功。当前运行中的 Desktop 服务是否已重启并加载新代码也未确认。

## Git 与后续

本次未执行 `git add`、`git commit`、`push` 或分支同步。下一窗口先看本交付文档和 `git status`；用户批准精确文件清单与英文提交信息后，才可 add/commit。Push 需要再单独确认。重启 Desktop 后人工验证“查询智汇菲律宾销量”能出现确认卡，且 preview 不再返回 `skill_not_in_scope`；若要点确认进行真实生产导出，须由用户明确决定测试账号与执行时机，并继续低频、风控即停。提交后在当前分支同步最新 `main`，发现冲突先报告。
