# Managed lxeskill Execution Implementation Plan

> 历史执行计划：其中的旧分支、提交和 PR 状态仅记录重建前的实施过程。Clean Stack 新 PR7 的实际范围与测试以[当前交接](../../harness/managed-lxeskill-execution/handoff.md)为准。

> **For agentic workers:** Execute these tasks inline, one at a time, with a review checkpoint after each tested change. Commit only after the repository-required Git approval; do not push or create a PR without separate approval.

**Goal:** Allow the two registered Vietnam business commands to run from Desktop chat without a per-command Full access request while leaving generic `exec` permissions unchanged.

**Architecture:** A catalog opt-in marks commands eligible for a host-managed tool. The tool accepts a catalog command ID and, for binding, a conversation attachment ID; the host resolves the attachment and constructs fixed CLI argv for the existing `OneShotCliRunner`. The Agent still decides intent and bind-before-generate order. The host validates permission, provenance, terminal shape and final output path.

**Tech Stack:** Bun/TypeScript Agent Runtime, Python `lxeskill` catalog, Electron Desktop, existing `OneShotCliRunner`, Bun and pytest tests.

**Spec:** `docs/superpowers/specs/2026-10-06-managed-lxeskill-execution-design.md`

## Global constraints

- Implement and verify on `codex/trusted-lxeskill-execution`, stacked on the current PR7 head; after scoped local commits, fast-forward only the existing PR7 source branch. Keep its PR6 base and do not alter PR1–PR6 or create a new PR.
- Do not call production Yacang or load real business workbooks in automated tests. Use synthetic attachments and fake runners.
- Keep `exec` Workspace Write, Read Only and Full access semantics intact. Never auto-approve or globally relax the sandbox.
- Use `bun` and `uv --frozen`; run Python tests from the repository root. Catalog changes require Python and Bun contract tests.
- Report actual tests, diff, status and any model/Windows limitations. Separate approval is needed before push, PR creation or merge.

---

### Task 1: Register the managed command contract

**Files:**
- Modify: `python/lxeskill_cli/lxeskill/catalog.json`
- Modify: `python/lxeskill_cli/lxeskill/business.py`
- Modify: `packages/agent/runtime/src/tooling/lxeskill-command.ts`
- Test: `python/lxeskill_cli/tests/lxeskill/test_lxeskill_cli.py`
- Test: `packages/agent/runtime/test/tooling/lxeskill-command.test.ts`

**Interfaces:** `LxeSkillCommandDefinition.managedExecution?: { attachmentArgument?: string }`. The bind entry declares `attachment_argument: "source_path"`; the generate entry declares an empty `managed_execution` object. No other entry opts in. The two loaders reject non-business entries, unsafe command tokens, unknown attachment arguments or malformed opt-ins.

- [x] Add failing tests asserting exactly the two Vietnam entries opt in and malformed declarations fail in both loaders.
- [x] Run `bun test packages/agent/runtime/test/tooling/lxeskill-command.test.ts` and `uv run pytest python/lxeskill_cli/tests/lxeskill/test_lxeskill_cli.py -q`; record the failing assertions.
- [x] Implement the minimal catalog field and symmetric loader validation. Keep existing CLI input and output schema unchanged.
- [x] Re-run those tests, then run `uv run pytest python/lxeskill_cli/tests/lxeskill python/lxeskill_cli/tests/infra -q` and `bun test packages/agent/runtime/test/tooling/lxeskill-command.test.ts` from the root. Check `git diff --check`, staged scope and status before proposing the contract commit.

### Task 2: Resolve the eligible chat attachment

**Files:**
- Create: `packages/agent/runtime/src/tooling/managed-lxeskill-attachment.ts`
- Test: `packages/agent/runtime/test/tooling/managed-lxeskill-attachment.test.ts`

**Interfaces:** `resolveManagedAttachment({ messages, attachment, currentTurnId }): string` returns the host-resolved absolute path or throws `ToolExecutionError`. `messages` are persisted session messages; `attachment` is the stored record for the host-selected or explicitly requested attachment ID. The selector ignores synthetic Skill-instruction messages, considers only the current real user message and its immediately preceding real user message, checks `turn_id` where present, and refuses older or ambiguous sources.

- [x] Add synthetic tests for current unique XLSX; immediately preceding unique XLSX with current confirmation/continuation; older history; current or previous multi-attachment without an unambiguous selection; non-XLSX; mismatched session attachment record; missing or changed local file. Test that no lookup of earlier messages can authorize a file.
- [x] Run `bun test packages/agent/runtime/test/tooling/managed-lxeskill-attachment.test.ts` and observe the failures.
- [x] Implement the resolver using the stored attachment ID and canonical file identity. Require a regular XLSX file and compare its current size with the recorded size. Let the Skill/model handle semantic confirmation, while the host enforces message adjacency and selected ID. If the current message cannot be identified reliably, fail closed.
- [x] Re-run the attachment tests. Check `git diff --check` and scope before proposing a focused commit.

### Task 3: Execute only registered commands through the host

**Files:**
- Create: `packages/agent/runtime/src/tooling/managed-lxeskill-tool.ts`
- Modify: `packages/agent/runtime/src/tooling/coding/exec-tools.ts`
- Modify: `packages/agent/runtime/src/index.ts` or the existing public export barrel
- Modify: `apps/agent-cli/src/runtime-host.ts`
- Test: `packages/agent/runtime/test/tooling/managed-lxeskill-tool.test.ts`
- Test: `apps/agent-cli/test/permissions.test.ts`
- Test: `packages/agent/runtime/test/permissions/approvals.test.ts`

**Interfaces:** The Desktop-only tool takes `{ command_id: string, attachment_id?: string }`; for a sole current or eligible adjacent XLSX it selects the stored ID itself, while an explicit ID is reserved for a confirmed multi-file choice. It looks up a catalog opt-in and maps it to fixed argv. The host injects the current session workspace through a newly constructed `OneShotCliRunner` with the existing data root and approved environment. The tool never accepts model-supplied argv, cwd, environment or source path. Generic `exec` rejects an opted-in command on Desktop with an instruction to use the managed tool before reaching approval logic.

- [x] Add fake-runner tests: allowed bind/get current attachment; generate with no path; Read Only denied before runner; unknown/hidden command denied; shell or extra properties denied; failure/timeout/cancellation preserve real diagnostics and do not retry; bind `files=[]`; generate reports only an existing XLSX under current workspace artifacts; `exec` cannot auto-elevate an opted-in command. Assert no fake runner call on rejected inputs.
- [x] Run the new tests and record failures.
- [x] Implement the tool and host wiring. Keep one CLI call per tool call and keep bind/generate separate. Use the catalog timeout. Do not make `OneShotCliRunner` accept arbitrary model-controlled environment overrides.
- [x] Run the Runtime, Agent CLI and permission tests. Run `bun run --cwd packages/agent/runtime typecheck` and `bun run --cwd apps/agent-cli typecheck`. Check diff and status before proposing the runtime commit.

### Task 4: Route the Skill and document the new boundary

**Files:**
- Modify: `skills/vietnam-stock-recommendation/SKILL.md`
- Modify: `packages/agent/runtime/src/tooling/skills.ts` (shared invocation prompt must name the managed opt-in)
- Modify: `packages/agent/runtime/test/tooling/skills.test.ts`
- Modify: `docs/harness/runtime/permission-policy.md`
- Create: `docs/harness/managed-lxeskill-execution/handoff.md`

**Interfaces:** Skill uses the managed tool for bind and generate. For one eligible attachment, bind passes only the command ID and the host selects the stored attachment; a confirmed multi-file selection may pass its ID. It retains current message first, immediately preceding confirmation/continuation, multi-attachment confirmation, bind-before-generate, no fallback and only-final-XLSX rules. The runtime permission document distinguishes the host-owned business command route from the unchanged generic `exec` route.

- [x] Update Skill contract assertions, run `bun test packages/agent/runtime/test/tooling/skills.test.ts` and observe the expected failure before editing the Skill.
- [x] Update the Skill and docs. Describe exact validation and the one-time permission semantics accurately; do not call synthetic tests a real model or production acceptance.
- [x] Re-run Skill tests, catalog dual tests, affected runtime tests and typechecks. Run `git diff --check`, `git status --short --branch`, a sensitive-data/path scan of the diff and build/typecheck where affected. Record what cannot be tested on macOS, including Windows packaged behavior and real model/Yacang chain.
- [x] Propose a separate Skill/docs commit after reviewing staged scope. Do not push or create a PR until explicitly approved.

## Final acceptance checkpoint

The implementation is ready for user testing only if Task 1–4 contract tests actually pass, generic `exec` still requires its normal approval, no production interface was called, and the current Desktop dev service uses the new branch/runtime. A model-visible prompt may still occur for other commands; do not claim the general permission system is removed. Real model routing, real Yacang and Windows installer behavior remain separately reported until observed.

## 执行记录

- Catalog：Python/Bun 双端校验已通过；本地独立提交 `efe7cd00`。
- 附件来源：合成测试和 Runtime 类型检查已通过；本地独立提交 `54b66dc5`。复查时补充了会话压缩及无法识别的中间用户消息拒绝规则，单独修正提交。
- 受控工具：假 CLI 与桌面宿主合成集成测试、权限回归、Runtime/Agent CLI 类型检查和 Agent CLI 构建已通过；本地独立提交 `2be5c58f`。
- Skill、预选与文档：2026-10-06 定向复跑 Runtime/Skill/受控工具 7 个文件 180 通过、Agent CLI 预选 15 通过、权限回归 19 通过；Python `lxeskill` 与 `infra` 432 通过、2 跳过，资产规则及 SKU store 83 通过；两项类型检查和 Agent CLI 构建通过。产物错误与附件丢失现保留实际脱敏诊断，Bun/Python 受控产物契约已收敛。新增错误处理测试先失败，修复后通过；这些自动测试不证明真实模型完整链路。
- 最初 macOS Desktop 真实聊天曾因雅仓连接超时未生成文件。其后网络恢复，分别观察到已绑定版 `generate → send_files` 和新表 `bind → generate → send_files` 成功；用户确认可点击两选项并收到 XLSX。最近一次重启用户只选择“仅绑定”，日志为 `ask_user_question → bind` 成功，未生成符合该选择。尚无单次连续日志覆盖弹窗后“绑定并查询”到交付；两轮绑定后再查询、同轮明确查询和绑定失败即停也未逐项完成真实聊天验收。Windows 安装版由组长负责。
- 最终代码收口提交为 `4fd8e450`，暂存范围为 29 个 PR7 代码、Skill 与测试文件，`git diff --cached --check` 通过；文档另做独立提交。代码和文档只同步现有个人 fork PR7 源分支，不创建新 PR；组长仓库的 PR 与 merge 由用户操作。远端状态以接手时的 PR 页面和 `git ls-remote` 为准。
