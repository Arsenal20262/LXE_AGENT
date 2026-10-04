# 越南备货 PR7 交接：在聊天中绑定 SKU 参数表

> 截至 2026-10-04，本页记录当前分支的本地实现与验证。代码和合成回归已分别提交；现行业务文档、实施计划和本页作为最后一步文档提交。分支尚未推送，也尚未创建 PR7。

## 接手位置与依赖

- 分支：`codex/vietnam-chat-sku-binding`；worktree：`/Users/hym/.codex/worktrees/cf36/LXE_AGENT1`。从 PR6 的 `bbd62a66` 开始，依赖 PR6 的稀疏 SKU 映射行为；没有在 `main` 开发。最新 `origin/main` 仍是本分支祖先，本地无同步冲突。
- 已批准的[设计规格](../../superpowers/specs/2026-10-04-vietnam-chat-sku-binding-design.md)在独立提交 `362336fa`；[实施计划](../../superpowers/plans/2026-10-04-vietnam-chat-sku-binding.md)记录步骤和验证门槛。
- 只调整越南备货 SKU 表的业务上传入口与工作台展示。其他五类输入资产、四项长期参数、雅仓导出、五表计算和 Desktop 既有 IPC 未改。历史 PR1–PR6 文档保持当时口径，现行说明已同步更新。

## 行为与文件

业务人员在聊天中附上 `.xlsx` SKU 表并明确要求绑定。`vietnam-stock-recommendation` Skill 选择当前消息的真实 `local_file` 绝对路径；只在紧邻的澄清回复明确指向上一条附件且没有新候选时，才复用上一条附件。仅有附件或多个候选但用途不明时先询问。Skill 调用 `lxeskill vietnam sku bind --source-path <附件路径>`，检查最终结果的 `ok`、`data.success`、`status`、`manifest_revision` 和空 `files`。绑定成功后长期沿用受信 `current`；同一请求还要求生成时，才继续运行一次无参数的 `lxeskill vietnam stock recommend`。只绑定不会调用雅仓或交付文件；绑定失败时停止。

新命令在 `python/lxeskill_cli/services/agent_cli/vietnam_replenishment/bind_sku.py`，catalog 在 `python/lxeskill_cli/lxeskill/catalog.json`。它先读取现有版本 revision，再调用 `services/vietnam_replenishment/sku_map_store.py` 的受信安装逻辑；校验、锁、原子替换、相同内容不升版、当前版/上一版和回滚规则沿用 PR5。错误保留真实诊断并脱敏截断。catalog 只标注 `.xlsx` 的 `x-lxe-file-input`，不把 SKU 表接入通用 `x-lxe-asset-slot` 升版流程。独立 CLI 能检查路径和文件内容，但无法证明路径来自哪轮聊天；来源选择是 Skill 的约束，不能把任意本机路径当作已确认附件。

工作台 `apps/dashboard/src/features/workbench/input-assets-view.tsx` 与 `apps/dashboard/src/main.tsx` 共用可见槽位过滤：不显示历史 `vietnam_replenishment_template` 卡片，也不把它计入就绪数量。SKU 卡继续展示当前版、上一版和回滚，但没有上传按钮；空状态指向聊天绑定。后端模板槽、历史文件和原 Desktop 上传 IPC 保留作兼容，不从底层删除。`apps/dashboard/src/shared/i18n.tsx` 与界面测试同步修改。合成串联测试在 `python/lxeskill_cli/tests/vietnam_replenishment/test_pr5_integration.py`，以新绑定命令替换原稀疏映射测试的内部安装步骤，继续验证 Office Kit 五表结果。

## 验证证据

- 新绑定命令的 7 项合成 Python 测试通过：首次绑定、同内容无变化、替换、坏 ZIP 与坏清单保留旧版、非法参数、revision 冲突不重试、缺附件提示、凭据脱敏、绑定不调用雅仓。修改 `catalog.json` 后按项目规范运行 Python 两组消费者测试，结果 **405 passed, 2 skipped**；本机 HTTP fixture 需在沙箱外监听 `127.0.0.1`，沙箱内的端口权限错误不属于业务失败。
- Bun 的 catalog 和 Skill 契约测试 **24 passed**。工作台定向测试 **3 passed**，Dashboard typecheck 和 build 通过；构建只有既有的大 chunk 提示。
- 使用合成 SKU 表、假雅仓三份来源和现有只读 Office Kit，`test_chat_bind_sparse_map_then_generate_keeps_all_yacang_skus` **1 passed，未跳过**。绑定时雅仓调用次数为零；生成后只得到一个最终 XLSX，三条 SKU 均在五表中，缺映射 SKU 的依赖值为空。没有调用生产雅仓。
- 本机 Electron 开发预览已在 `http://127.0.0.1:5173/` 启动，Gateway 和 Skill catalog 就绪。原生界面目视确认旧模板卡片不显示、SKU 上传按钮不显示、当前版仍显示；工作台就绪数为 `1 / 6`。此状态来自本机已有映射表，只读查看，未用合成表覆盖。回滚在合成界面测试中覆盖；本机当前卡片没有上一版，未在真实界面点回滚。
- PR1–PR6 的六段本地差异均通过 `git diff --check`；PR1–PR5 的远端分支头与本地审查的提交一致，PR6 仍只有本地分支。新增文件审查未发现真实运营 XLSX、凭据、数据库、日志、构建产物或越南范围外功能。唯一新增 XLSX 是 PR3 随包发布的无历史数据五表骨架 `skeleton.xlsx`，已检查结构。敏感字样命中的是合成脱敏测试样例，没有实际密码。

开发命令从仓库根运行；Python 使用本 worktree 的 `.venv` 和 `UV_CACHE_DIR=/private/tmp/lxe-pr7-uv-cache`。Office Kit 使用本机已有构建的 `LXE_OFFICE_NODE`、`LXE_OFFICE_CLI` 只读路径；没有复制 `.venv`。标准 `bun run desktop:dev` 的 ExifTool 准备被当前网络 DNS 阻断，因此本次桌面预览直接运行 `bun run --cwd apps/desktop dev` 并注入已有 Office Kit 路径；这足以检查本次工作台及聊天入口，但不是完整安装包验收。启动维护任务报告马帮账号未配置，与越南工作台展示无关。

## Git 状态、限制与下一步

- 本地提交：`362336fa` 设计规格、`32f9b634` 工作台、`2e78eb6d` 聊天绑定、`edba8838` 串联回归。写本页时，代码与测试均已提交，工作区只余现行业务文档、实施计划和本交接页待最后一个文档提交；接手时先检查 `git status --short --branch`。当前没有 push、PR7 或 merge。
- 真实雅仓 VN8806、Windows 安装包、用户实际聊天模型对附件来源的遵守情况仍需现场验收。独立 CLI 无法从文件路径单独证明聊天轮次；Skill 的来源规则与模型行为必须在真实聊天中核对。本次未触碰本机已有真实 SKU 表。
- 文档提交后复核 PR7 相对 PR6 的差异、`git diff --check`、状态与敏感文件，再汇报给用户。推送、创建 PR7 和合并需要分别取得用户确认。按项目规范，最终同步 `main` 后、合并前只运行一次完整验证；当前定向结果不冒充全量验收。PR6 的推送与 PR 创建状态需先核对，PR7 评审基线应是 PR6。
