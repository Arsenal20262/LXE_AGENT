# PR8 交接：固定数量受控多附件

## 分支与依赖

- 分支/Pool：`codex/vietnam-clean-pr8-multi-attachment`，`pool-14`。
- 基线：新 PR7 HEAD `443da07f33063cfd144055c05fcbed7287fb9c03`。
- 本地功能提交：`18fa8707` 和 `594b5f1d`，分别对应固定数量受控附件及数字语义修复。
- 依赖顺序：新 PR7 → 本 PR8 → 新 PR9。新 PR9 应以本层最终 docs 提交为基线。
- 本交接文档独立提交；本分支未 push、未创建 PR。

## 功能与调用边界

Catalog 可声明 `attachment_count: N`（2～8）及对应 `attachment_argument`。Runtime 在调用 CLI 前选择和校验一整组 XLSX：优先使用当前上传轮次；当前轮数量错误时不得从历史消息补齐；只允许符合既有紧邻上一轮规则的完整集合。混合轮次、重复 ID 或路径、非法附件记录、非 XLSX，以及记录、来源、路径或文件大小不一致时拒绝，不调用 CLI。

未声明 `attachment_count` 的无附件和单附件命令沿用原行为。Python 通用 CLI 负责解析数组，具体业务数量和报表语义仍由业务层再次校验。本 PR 的公共代码不含 Vietnam 或 Yacang 判断；不修改 Runtime 大架构，也不增加环境变量。

## 功能提交范围

9 个代码与测试文件：

- `packages/agent/runtime/src/tooling/coding/public-types.ts`
- `packages/agent/runtime/src/tooling/lxeskill-command.ts`
- `packages/agent/runtime/src/tooling/managed-lxeskill-attachment.ts`
- `packages/agent/runtime/src/tooling/managed-lxeskill-tool.ts`
- `packages/agent/runtime/test/tooling/lxeskill-command.test.ts`
- `packages/agent/runtime/test/tooling/managed-lxeskill-attachment.test.ts`
- `packages/agent/runtime/test/tooling/managed-lxeskill-tool.test.ts`
- `python/lxeskill_cli/lxeskill/business.py`
- `python/lxeskill_cli/tests/lxeskill/test_lxeskill_cli.py`

## 本地验收与限制

在新分支运行三个相关 Bun 测试文件 **50 passed**、Python catalog/CLI **81 passed**；Runtime typecheck 和相对新 PR7 的 `git diff --check` 通过。测试使用合成附件与假命令，未调用生产接口。

当前受控附件校验保证数量、轮次、ID、路径、记录、来源和文件大小一致性，但**不保证**发现上传后原文件的等长内容改写，也没有发送时的不可变字节快照。若未来要求字节级完整性，应另行统一处理单附件与多附件，不属于本 PR。

## 下一步

本交接文档作为独立 docs 提交收口；提交后检查工作区与最终 diff。新 PR9 使用本能力接收三份报表，并在 Vietnam 业务层再次校验数量和来源。push、创建 PR 与合并需分别获得批准。
