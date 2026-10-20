# 越南备货九表导出 handoff

- 分支 / Pool：`codex/vietnam-stock-full-workbook`，`.worktrees/pool-17`。基线 `origin/main@9f36647a`；主功能提交 `96943964`，聊天模板生命周期修复提交 `8dbc42e4`。本轮旧 SKU map 退役在同一分支收口，未 push、未创建 PR。
- 当前入口：`lxeskill vietnam replenishment calculate` → 三份雅仓报表快照与九表模板（显式本轮文件或 `vietnam_full_workbook` current）→ `workflow.generate_current_vietnam_recommendation` → 模板主表 B/E/G/AE/AJ 参数解析 → `recalculation.generate_vietnam_workbook` 写入/Office 重算/校验五张计算表 → `full_workbook.combine_full_workbook` 合并九表。没有模板即失败，不读取旧 SKU map，不生成旧五表终稿。
- 保留能力：`SkuParameters`、SKU 精确匹配和数值校验、雅仓三表处理、销量/库存/在途/备货/价格公式、模板 current/previous 版本、四张业务表原始 XML 保留。设置页只上传/导出九表模板并保存全局参数；聊天显式模板仅本轮使用，不修改 current。模板没有的雅仓 SKU 仍导出来源行，依赖模板的列留空，不填零。
- 已退役：旧 Desktop IPC、preload、协议状态、上传/导出与 Python 私有动作；CLI `--sku-map-file` / catalog 参数、显式覆盖、旧 `sku-map.xlsx` current 和运行快照、SKU map Store/解析器/校验报告、无模板五表回退、对应测试与使用说明。五张计算表写入器是九表流程的内部步骤，继续保留。
- 修改文件范围：Desktop IPC/预加载/设置服务与测试、Dashboard 设置行为 fixture、desktop-protocol；Python `settings.py`、`asset_contract.py`、`workflow.py`、`recalculation.py`、`workbook.py`、`validation_diagnostics.py`、CLI adapter/catalog 及定向测试；越南 Skill、Runtime Skill 契约断言和通用附件样例、计算说明和本 handoff。删除 map Store、Desktop map export helper 与其专用测试。历史实施计划保持原样；没有新增 Tool、Store、Workflow、框架或持久化层。
- 历史口径变化：旧的显式 map 覆盖现在被参数校验拒绝，结果只来自模板 B/G/AE/AJ；过去无模板但有旧 map 时可输出五表，现在明确提示上传或指定九表模板。
- 环境：生产仍使用 `LXE_DATA_ROOT`、既有 Office Kit 运行时配置；没有新增环境变量、依赖或密钥。测试使用 `LXE_OFFICE_NODE`、`LXE_OFFICE_CLI` 指向 checkout 内宿主 Office Kit。
- 九表 golden：以两 SKU 合成雅仓三表和完整九表模板，在删除前后各执行一次真实 Office Kit CLI，比较 9 张表的顺序、行列尺寸、212 个非空格的值与公式缓存、最终备货量及价格相关列，以及四张业务表 XML；全部一致。两条路径均生成有效九表。差异仅在已取消的旧 map 覆盖和无模板调用口径。
- 定向验证：越南模块和相关 CLI 测试 `235 passed, 7 skipped`（随后单独配置 Office Kit 的 7 项 `7 passed`）；模板资产、工作流与 CLI 再验 `52 passed`；Bun catalog 契约 `12 passed`、Runtime 执行审批契约 `1 passed`；Desktop 桥接/设置 `9 passed`、输入资产版本 `4 passed`；Dashboard 越南设置页 Chromium 行为测试 `1 passed`；Desktop 与 Dashboard typecheck 通过。本轮收口后 Skill 契约 `13 passed`，Runtime 附件相关目标 `4 passed`。额外扩大运行 CLI/infra 时曾有 `576 passed, 59 failed, 4 skipped`，59 项因沙箱拒绝绑定本机回环端口失败；随后在沙箱外复测相关 5 个文件 `75 passed`，不把早先扩大测试记为全量通过。
- 提交前本地服务 smoke：隔离临时数据目录，通过真实 Desktop 设置服务上传并读取九表 current；使用两条合成 SKU 的雅仓三表执行正式 CLI 和 Office 重算，生成九表，校验 `passed`、SKU 数为 2，主表 B/G/AE/AJ 与模板一致，四张业务表仍在。旧 `--sku-map-file` 被 CLI 拒绝；只有旧 `sku-map.xlsx` 而没有九表模板时返回 `input_required`；旧桌面私有 `upload` 动作被拒绝。未使用真实 ERP 或生产数据，未覆盖真实 Electron UI 交互。
- 用户本地交互检查：设置页上传后 current 可读；随后聊天指令为“查询越南备货信息”，Runtime 成功读取并发送已有结果。该会话没有重新执行九表计算，因此不计为聊天附件到新 Excel 的端到端验证。
- 最终提交前复测：Python CLI/infra 契约 `471 passed, 4 skipped`（在可绑定本机回环端口的环境运行）；越南九表/工作流/设置/集成定向 `29 passed, 7 skipped`；关联 Python catalog/输入资产目标 `181 passed`；Runtime 相关 `147 passed`；Desktop 桥接与设置 `9 passed`；Dashboard Chromium 越南设置页 `1 passed`；Desktop、Dashboard typecheck 通过。受限沙箱内扩展测试曾有 59 项因无法绑定回环端口失败，已在沙箱外复测通过，不计为功能回归。
- 限制：真实雅仓三份生产报表及其业务 SKU 结果 NOT VERIFIED；真实聊天附件发送到最终 Excel 的 UI 端到端 NOT VERIFIED；Windows 与发布 build NOT VERIFIED。合成文件的实际九表生成与 Office 重算已验证。模板公式价依赖 XLSX 保存的计算缓存；四张业务表如带合并器不支持的独立附件关系会报错。
- PR 依赖 / 下一步：本分支基于既有 `origin/main`，无前序 PR 依赖。用户已授权将本轮修改同步到本地分支以准备 PR；push 和创建 PR 尚未授权。合并前按项目规范与最新 main 做兼容检查。

全仓搜索结果：生产链中旧 map 参数、Store、桥接和五表回退无消费者；退役说明、负向测试及未改的历史实施计划仍可出现旧名称，Runtime 通用附件样例已改为九表模板。设置页 CSS 与行为选择器也已统一为 template。本轮修改范围为 41 个相关文件，无新增文件、无敏感信息或无关修改；提交前 `git diff --check` 通过。

实际修改文件：

```text
apps/dashboard/src/features/workbench/vietnam-settings-view.tsx
apps/dashboard/src/features/workbench/vietnam-settings.css
apps/dashboard/test/behavior/README.md
apps/dashboard/test/behavior/renderer.tsx
apps/dashboard/test/behavior/runner.cjs
apps/desktop/src/ipc-channels.ts
apps/desktop/src/main.ts
apps/desktop/src/main/ipc.ts
apps/desktop/src/main/vietnam-map-export.ts
apps/desktop/src/main/vietnam-settings.ts
apps/desktop/src/preload-bridge.ts
apps/desktop/test/preload-bridge.test.ts
apps/desktop/test/vietnam-map-export.test.ts
apps/desktop/test/vietnam-settings.test.ts
docs/harness/vietnam-stock-recommendation/calculation.md
docs/harness/vietnam-stock-recommendation/handoff-nine-sheet-export.md
packages/agent/runtime/test/engine/runtime.test.ts
packages/agent/runtime/test/permissions/approvals.test.ts
packages/agent/runtime/test/tooling/lxeskill-command.test.ts
packages/agent/runtime/test/tooling/skills.test.ts
packages/foundation/desktop-protocol/src/index.ts
python/lxeskill_cli/lxeskill/catalog.json
python/lxeskill_cli/services/agent_cli/vietnam_replenishment/generate.py
python/lxeskill_cli/services/vietnam_replenishment/asset_contract.py
python/lxeskill_cli/services/vietnam_replenishment/recalculation.py
python/lxeskill_cli/services/vietnam_replenishment/settings.py
python/lxeskill_cli/services/vietnam_replenishment/sku_map_store.py
python/lxeskill_cli/services/vietnam_replenishment/validation_diagnostics.py
python/lxeskill_cli/services/vietnam_replenishment/workbook.py
python/lxeskill_cli/services/vietnam_replenishment/workflow.py
python/lxeskill_cli/tests/lxeskill/test_export_command_names.py
python/lxeskill_cli/tests/lxeskill/test_vietnam_recommendation_cli.py
python/lxeskill_cli/tests/vietnam_replenishment/test_asset_contract.py
python/lxeskill_cli/tests/vietnam_replenishment/test_map_export.py
python/lxeskill_cli/tests/vietnam_replenishment/test_pr5_integration.py
python/lxeskill_cli/tests/vietnam_replenishment/test_recalculation.py
python/lxeskill_cli/tests/vietnam_replenishment/test_settings.py
python/lxeskill_cli/tests/vietnam_replenishment/test_validation_diagnostics.py
python/lxeskill_cli/tests/vietnam_replenishment/test_workbook.py
python/lxeskill_cli/tests/vietnam_replenishment/test_workflow.py
skills/vietnam-replenishment/SKILL.md
```

## 2026-10-20：PR #90 两个 P2 修复（未提交）

- 分支 / Pool：`codex/vietnam-stock-full-workbook` / `.worktrees/pool-17`，本轮基于 `ce68b598`；PR 为 `LXE123/LXE_AGENT#90`。复用原工作区，无新分支或 Worktree。本轮没有 add、commit、push、merge、rebase 或修改远端 PR。
- 复现：设置页 `upload_template` 校验临时快照后调用共享 `promote_asset`。原 helper 先清空 previous、移走 current，再直接复制新文件；注入复制错误会使 current 缺失，半写错误会留下截断的 current，previous 也已推进。合法的仅内置数字格式九表模板可通过 `validate_full_template`，但缺少可选 `numFmts` 时原合并器报错。新增定向回归在修复前得到预期的 `9 failed, 1 passed`。
- 上传修复：仅调整原 `shared/input_assets.py` 提升职责。同一资产槽内暂存完整版本，复制后 fsync 并核对 SHA-256；再通过目录 rename/replace 切换版本，切换失败恢复原 current / previous。保留原文件名、两代目录布局和相同内容不推进 previous 的语义；设置页原锁、校验入口及聊天临时模板路径不变。复制、半写、短写、同步或版本切换故障后，两代文件名与 hash 保持一致，临时目录清理，读取和导出旧 current 正常，连续失败后可恢复上传。
- 额外故障保护：若发布失败后，文件系统再次拒绝回滚，保留良好版本副本并在原始异常上注明恢复目录，不删除唯一可恢复副本；若清理临时目录本身失败，则记录真实错误，不能覆盖原始上传错误或把已发布成功的上传报告为失败。这两种复合故障有独立测试；不承诺掉电或强制终止下的跨两代事务原子性。
- 样式修复：仅在缺少 `numFmts` 且计算表提供该节点时补建空节点，放在样式表首部并沿用原命名空间前缀；随后复用已有数字格式 ID 分配与样式追加逻辑。有 `numFmts` 的路径不变。回归检查 ID 唯一、cellXfs / cellStyleXfs 及字体、填充、边框引用合法，原样式索引与四张业务表 XML 保持。
- 实际修改共 6 个文件：`shared/input_assets.py`、`services/vietnam_replenishment/full_workbook.py`、`tests/infra/test_input_assets.py`、`tests/vietnam_replenishment/test_settings.py`、`tests/vietnam_replenishment/test_full_workbook.py`（以上均在 `python/lxeskill_cli/` 下），以及本 handoff。没有新增 Store、Tool、Service、Workflow、CLI 命令、Runtime 路由或依赖。
- 定向验证：配置本 Worktree 内现有 `LXE_OFFICE_NODE` / `LXE_OFFICE_CLI`，从仓库根执行 `uv run --frozen pytest`，覆盖资产版本、上传故障、样式合并、九表集成、重算、工作流与相关 CLI：`162 passed`，无跳过。包含原 7 个真实 Office Kit 集成用例及新增的无 `numFmts` 成品 Office 打开重算用例。默认 uv 缓存受沙箱限制，改用临时 `UV_CACHE_DIR` 后运行；无依赖或 lockfile 变化。
- 修复前后 golden：从 Git HEAD 加载原合并器及资产 helper，与工作区实现对照；使用 3 个合成雅仓 SKU（模板提供其中 2 个）和同一份真实 Office Kit 重算五表结果。两份最终九表的全部 18 个 ZIP 部件内容一致；9 张表顺序、尺寸、全部公式与缓存、250 个非空缓存单元格、四张业务表 XML、备货与价格列一致。正常上传、换版、同内容重试、再次换版的 4 步 current / previous 序列一致。结果目录：系统临时目录 `vietnam-p2-golden-bkkzrn9e`。
- 业务边界：SKU 参数 B/G/AE/AJ 解析、雅仓三表来源、备货与价格公式、五张计算表结构及九表顺序均未修改。真实雅仓生产数据、聊天附件到 Excel UI 全链路、Windows 实机、发布 build 及掉电 / 进程强制终止恢复：NOT VERIFIED。本轮只跑上述定向测试，未宣称全量回归通过。
- Git 收口：预期仅上述 6 个文件未暂存；提交前仍需用户批准。push 与远端 PR 更新需另获明确授权。没有本轮已知的未修复 P2；合并前仍按项目规范检查最新 main 兼容性和最终验证。

## 2026-10-20：PR #90 本地冲突收敛

本节记录最新状态；前述未提交、未创建 PR 等描述为各历史阶段的记录。

- 分支 / Pool 不变。两个 P2 的 6 文件独立提交为 `2ec00f5a57a70ffcdba36cb0ca685a796e2654b9`（`fix: protect Vietnam template uploads and optional number formats`），原有 5 个功能提交保留。按用户批准执行 `git merge --no-ff --no-commit origin/main`，合入基线为 `88a303386826e560ec6e45c692f93ee0f20311de`；本轮只完成本地修复与合并，不 push、不修改原 PR #90。
- 七处冲突：Dashboard 设置页保留 main 的主题、统一页头与无障碍结构，保留九表模板按钮和直接显示的天数修正；Desktop 服务保留 main 的统一 `lxeskill` 调用、UTF-8/环境注入和结果解析，上传/导出改接模板；Desktop 测试保留 main 的协议断言，并验证真实模板上传、导出及无效替换保护；计算说明保留统一内部 CLI 与九表口径；Python 设置层保留模板生命周期与参数能力，移除直接模块 CLI；旧 `test_map_export.py` 继续删除，其 UTF-8 契约迁入统一 CLI 测试；设置测试保留故障注入、配置持久化和损坏模板真实错误，子进程改用统一 CLI。
- 自动合并之外的 CLI 契约联动：复用 main 已有的 `services/agent_cli/vietnam_replenishment/settings.py`，将 `upload_map/export_map` 改接 `upload_template/export_template`；保留内部命令 `read/save/upload/export`，删除 catalog 的旧 `kind` 参数并测试其被拒绝。没有新增 CLI 命令、工具或框架。main 新增的 `workbench-details.cjs` 起初仍引用旧 map 按钮及折叠区，定向测试失败；仅同步这些选择器和直接显示字段的断言后通过，没有修改 Runtime 或业务计算。
- 合并定向验证：Python CLI/infra/越南模块 `677 passed, 4 skipped`（沙箱外允许本机回环端口，包含真实 Office Kit 九表集成及无 `numFmts` 重算）；Runtime engine/审批/CLI/Skill 契约 `149 passed`；Desktop 设置/预加载桥接 `11 passed`；Dashboard Chromium `workbench-details`、`vietnam-settings` 两项通过，覆盖 11 个场景；Desktop 和 Dashboard typecheck 通过。Python 设置/资产/统一 CLI 的先行验证 `66 passed` 与 677 项存在覆盖重叠，不累计为额外用例。
- 合并后 golden：复用上述三 SKU 合成模板及 Office 重算结果，重新生成九表，与 P2 修复前样例全部 18 个 ZIP 部件内容一致；9 张表的顺序、尺寸、公式、250 个非空缓存单元格及四张业务表 XML 一致。`input_assets.py`、`full_workbook.py`、模板参数解析、workflow、recalculation、workbook、雅仓来源处理和通用 CLI 共 8 个生产文件与 P2 fix 提交逐字节一致。B/G/AE/AJ 来源、SKU 精确匹配、公式及备货量未因合并变化。
- PR 范围：相对最新 `origin/main` 为 53 个相关文件，原 PR 的 48 个文件保留；增加 P2 的共享资产 helper/测试、main 的设置 CLI adapter/测试，以及 main 的工作台页面行为测试共 5 个必要联动文件。main 自身新增的主题、Runtime、其他业务及历史文档变更来自合并父提交，不计入 PR 新增范围。历史实施计划未改写；没有新依赖、lockfile 或环境变量。
- 最终门禁：提交前检查无旧 SKU map 生产消费者、无冲突标记及无无关工作区文件，执行 `git diff --check` 与暂存差异检查；验证通过后按本轮授权完成 merge commit。push 和远端重新 Review 仍需分别获得用户确认。
- 检查结果：扫描 617 个生产源码/契约文件，旧 map 入口消费者为 0；53 文件范围与原 PR 加上述 5 个联动文件精确一致，敏感信息模式扫描无命中，历史计划未改写。`git diff --check`、`git diff --cached --check origin/main` 通过；针对 merge 第一父提交的暂存检查仅提示 main 已有的 `apps/dashboard/src/shared/cds-theme.css` 和 `docs/design/cds/tokens/lxe-theme.snapshot.css` 末尾空行，两文件与 main 逐字节一致，不在本 PR diff 内，未扩大范围修改。暂存后无未解决冲突、未暂存或未跟踪文件。
- NOT VERIFIED：真实雅仓生产数据、真实聊天附件到 Excel UI 全链路、Windows 实机、发布 build、全仓全部测试及掉电/进程强制终止恢复。上述合成九表、Office、Desktop 和 Dashboard 定向结果不扩大为这些验证。
