# 越南备货 PR7 交接：在聊天中绑定 SKU 参数表

> 截至 2026-10-05，本页记录 PR7 当前分支的实现与验证边界。设计、代码、合成回归、业务文档、附件选择和附表查询/生成先绑定规则均已提交并推送到个人 fork 的 [PR7](https://github.com/Arsenal20262/LXE_AGENT/pull/7)。本页一并记录业务提示词覆盖的扩充；接手时核对实时远端状态。

## 接手位置与依赖

- 分支：`codex/vietnam-chat-sku-binding`，在该分支所属 worktree 操作。当前基线为 PR6 的 `cc77bf20`，依赖 PR6 的稀疏 SKU 映射行为；没有在 `main` 开发。接手时核对实时远端和工作区状态，本文不把本地缓存的远端引用当作最新状态。
- 已批准的[设计规格](../../superpowers/specs/2026-10-04-vietnam-chat-sku-binding-design.md)在独立提交 `820fb17f`；[实施记录](../../superpowers/plans/2026-10-04-vietnam-chat-sku-binding.md)区分已实现步骤与尚未验证的门槛。
- 只调整越南备货 SKU 表的业务上传入口与工作台展示。其他五类输入资产、四项长期参数、雅仓导出、五表计算和 Desktop 既有 IPC 未改。历史 PR1–PR6 文档保持当时口径，现行说明已同步更新。

## 行为与文件

业务人员在聊天中附上 `.xlsx` SKU 表。`vietnam-stock-recommendation` Skill 收到附表查询或生成越南备货请求时，即使没有“绑定”二字，也先绑定当前消息恰好只有一个附件且它是 `.xlsx` `local_file` 的文件，成功后才生成。多附件必须先确认，即使其中只有一份 `.xlsx` 也不自行选择。当前消息无附件时，仅在紧邻上一条用户消息上传的 `.xlsx` 可唯一确定，且本条明确确认、澄清或继续处理该附件（包括“查询越南备货”）、期间没有新候选且该附件尚未绑定成功时，才复用它；若上一条有多个附件，本条须明确选定具体文件。不跨多轮搜索或猜测旧附件；只有附件而无法确定越南备货用途时先询问，非 `.xlsx` 拒绝绑定且不改用旧版生成。Skill 调用 `lxeskill vietnam sku bind --source-path <附件路径>`，检查最终结果的 `ok`、`data.success`、`status`、`manifest_revision` 和空 `files`。绑定成功后长期沿用受信 `current`；没有待处理新附件，或紧邻附件已成功绑定时才直接沿用 `current` 生成。只绑定不会调用雅仓或交付文件；绑定失败时停止，不沿用旧版生成。

本轮结果请求还包括“出越南备货单”“做越南补货建议/备货计划”“按越南库存和销量算要补多少”“重新生成越南备货清单”。只问功能、流程、所需资料或历史文件不启动生成；只问已绑定 SKU 表的状态或版本，指向工作台 SKU 卡，不用生成命令探测。“看看越南库存”含义不清时先澄清；明确要雅仓原始报表时仍转 `yacang-export`。

新命令在 `python/lxeskill_cli/services/agent_cli/vietnam_replenishment/bind_sku.py`，catalog 在 `python/lxeskill_cli/lxeskill/catalog.json`。它先读取现有版本 revision，再调用 `services/vietnam_replenishment/sku_map_store.py` 的受信安装逻辑；校验、锁、原子替换、相同内容不升版、当前版/上一版和回滚规则沿用 PR5。错误保留真实诊断并脱敏截断。catalog 只标注 `.xlsx` 的 `x-lxe-file-input`，不把 SKU 表接入通用 `x-lxe-asset-slot` 升版流程。独立 CLI 能检查路径和文件内容，但无法证明路径来自哪轮聊天；来源选择是 Skill 的约束，不能把任意本机路径当作已确认附件。

工作台 `apps/dashboard/src/features/workbench/input-assets-view.tsx` 与 `apps/dashboard/src/main.tsx` 共用可见槽位过滤：不显示历史 `vietnam_replenishment_template` 卡片，也不把它计入就绪数量。SKU 卡继续展示当前版、上一版和回滚，但没有上传按钮；空状态指向聊天绑定。后端模板槽、历史文件和原 Desktop 上传 IPC 保留作兼容，不从底层删除。`apps/dashboard/src/shared/i18n.tsx` 与界面测试同步修改。合成串联测试在 `python/lxeskill_cli/tests/vietnam_replenishment/test_pr5_integration.py`，以新绑定命令替换原稀疏映射测试的内部安装步骤，继续验证 Office Kit 五表结果。

## 验证证据

- **此前开发回合真实运行，本轮文档修订未复跑：**新绑定命令的 7 项合成 Python 测试通过，覆盖首次、重复、替换、非法文件或参数、并发 revision 冲突及绑定不调用雅仓；Python 两组 catalog 消费者测试 **405 passed, 2 skipped**。跳过的两项 HTTP fixture 受沙箱本地端口权限限制，不能算通过。
- **此前开发回合真实运行，本轮未复跑：**Bun catalog 与 Skill 契约测试 **24 passed**；工作台静态渲染定向测试 **3 passed**；Dashboard typecheck 和 build 通过。静态渲染仅检查卡片、文案和回滚按钮存在，没有点击回滚或验证 IPC 调用。
- **此次 PR7 规则收口真实运行：**在现有越南 Skill 发现测试中增加“当前消息恰好一个附件且为 XLSX”、紧邻上一条用户消息的明确确认/澄清/继续、禁止更早历史、以及多附件即使只有一份 XLSX 也先确认的文本契约断言。修改 Skill 前该测试文件 `12 passed, 1 failed`，修改后 `13 passed, 0 failed`。这些断言只验证 Skill 文本声明与加载，**不证明真实模型遵守规则**。
- **本次自动绑定修订真实运行：**越南 Skill 与东南亚流程入口补充“附表查询/生成先绑定、绑定成功后生成，失败时不得沿用旧 `current`；没有待处理新附件或紧邻附件已成功绑定时才沿用 `current`”。修改后从仓库根运行 `bun test packages/agent/runtime/test/tooling/skills.test.ts`，结果 **13 passed, 0 failed**。新增断言只检查这两个 Skill 的文本契约，**不证明真实模型会这样决策**。
- **本次业务提示词扩展真实运行：**同一测试文件先因缺少补货建议、补货量等路由词得到 `12 passed, 1 failed`；补充两份 Skill 与文本断言后为 **13 passed, 0 failed**。只证明 Skill 加载和文案契约，业务人员各种说法的实际模型选路仍未验证。
- **此前开发回合真实运行，本轮未复跑：**使用合成 SKU 表、假雅仓三份来源和本机已有 Office Kit，`test_chat_bind_sparse_map_then_generate_keeps_all_yacang_skus` **1 passed，未跳过**。绑定时雅仓调用次数为零；生成后只得到一个最终 XLSX，三条 SKU 均在五表中，缺映射 SKU 的依赖值为空。没有调用生产雅仓。
- **此前收口回合真实运行，此次未复跑：**Desktop 附件与 Gateway 本地对话的定向测试 `26 passed, 0 failed`；Provider 将 `local_file` 的原样路径交给模型的定向测试 `1 passed, 0 failed`。这些用例证明路径经过 Desktop、Gateway、Provider 的传递，不证明模型选择本轮附件或按顺序调用命令。最初尝试运行整个 Provider 测试文件时结果为 `51 passed, 1 failed`，失败项在沙箱中启动 `Bun.serve` 遇到 `EADDRINUSE`；之后只重跑了相关定向用例，不能把 Provider 整文件写成通过。
- **此前本地运行，但模型决策由固定脚本代替：**通过 `TypeScriptAgentRuntime.runTurn` 回放六种合成场景，逐项检查到 `6/6` 符合固定脚本预期。成功路径依次读取当时的 Skill、绑定、生成、发送最终文件；缺少可选附件、双附件、CSV 在读取 Skill 后停止；绑定失败或内容错误的 XLSX 在绑定后停止，均未继续生成或发送文件。缺少可选附件的场景没有明确确认紧邻唯一附件，不能作为该例外的验收。这证明 Runtime 工具分发与终态控制能按固定决策执行，**不证明真实模型会做出这些决策**。
- **此次完全脱敏的本地预演：**临时脚本与结果仅在系统临时目录，没有新增仓库文件。脚本在本机加载 Runtime 模块，用内存会话、恰好七条合成行为规则、合成附件与假 `bind_sku` / `generate` / `send_files` 工具；未读取真实 Skill、真实 system prompt、真实附件或业务文件，也没有调用雅仓。六个场景均按固定假模型预设完成：单个本轮 XLSX 成功为 `bind_sku → generate → send_files`，没有可选附件（也未明确指向紧邻唯一附件）、多附件、非 XLSX 均不调用工具，bind 失败及内容错误 XLSX 均只调用 `bind_sku`。每次进入假 Provider 前共执行 11 次白名单校验，并把 Runtime 环境消息替换为合成内容；没有错误路由、同批依赖调用或无关 Skill 调用。**外部模型调用为 0，白名单只证明本地预检，不是已通过的外发检查；紧邻确认例外及六个真实模型决策均未验证。**这项预演也不等同于生产 Skill、CLI 或雅仓真实链路验收。
- **真实模型验收仍被阻断：**此前普通沙箱内最小连接返回 `Connection error`；经自动审批的沙箱外、仅含合成 `ping` 的最小调用收到 `PONG`，只证明连接可用。此前完整 Runtime 回放拟发送非公开仓库 Skill/system prompt，自动审批两次拒绝，未运行六个场景。用户现已明确禁止外发这些真实内容，并批准仅用完全脱敏材料回放；此次自动审批又拒绝了给临时脚本添加 DeepSeek 网络调用和环境 API key 读取能力，认定超出其允许的本地回放范围，要求不得绕过。被拒补丁未应用，外部调用未发生；保留**真实模型决策未验证**的发布限制。
- **此前人工目视检查，本轮未重看：**本机 Electron 开发预览显示旧模板卡片隐藏、SKU 上传按钮移除、当前版仍显示；卡片当前没有上一版，未在真实界面点回滚。这项检查不能证明真实模型会选择本轮附件或正确执行命令顺序。
- 此前审查 PR1–PR6 的六段本地差异时均通过 `git diff --check`；该历史快照不代表当前远端状态。此前新增文件审查未发现真实运营 XLSX、凭据、数据库、日志或构建产物。唯一新增 XLSX 是 PR3 随包发布的无历史数据五表骨架 `skeleton.xlsx`，已检查结构。敏感字样命中的是合成脱敏测试样例，没有实际密码。本次 PR7 修订的文件范围与敏感内容应以提交前的当前 diff 再次核对。

此前开发命令从仓库根运行；Python 使用该 worktree 自己的 `.venv`，Office Kit 由当时可用的本机运行时路径注入，没有复制其他 worktree 的 `.venv`。标准 `bun run desktop:dev` 的 ExifTool 准备受当时网络 DNS 限制，曾用 Desktop 开发预览检查工作台；这不是完整安装包验收。

## Git 状态、限制与下一步

- 已推送的历史提交包括 `820fb17f` 设计规格、`c2212f42` 工作台、`684b4652` 聊天绑定、`63efca9a` 串联回归、`c5afe1c3` 首轮业务文档、`5a2fb049` 附件规则文本契约、`74ab272d` 交接状态修正，以及 `f505512d` 附表查询自动绑定。业务提示词扩展也留在同一分支；接手时检查 `git log -1`、`git status --short --branch` 与个人 fork PR7 的实时状态。未合并到上游仓库。
- **尚未验证：**真实雅仓 VN8806、Windows 安装包，以及实际聊天模型是否识别“上传后查询越南备货”和扩展后的业务说法、优先绑定本轮唯一附件、正确处理紧邻确认例外、拒绝更早历史和多附件猜测、按顺序绑定与生成、失败立即停止、只交付最终 XLSX 并停止无关 Skill。独立 CLI 无法从文件路径单独证明聊天轮次；直接 CLI、固定假模型或此次完全脱敏的本地预演不能代替真实模型回放。本次未触碰本机已有真实 SKU 表。
- 真实模型验收只有在完全不外发非公开仓库内容且通过正常自动审批的条件下才能重试；当前拒绝不得绕过。复核 PR7 相对 PR6 的差异、`git diff --check`、状态与敏感文件后，后续提交只更新现有 PR7，不创建新 PR。最终同步 `main` 后、合并前只运行一次完整验证；当前定向结果不冒充全量验收。PR7 评审基线仍应是 PR6。
