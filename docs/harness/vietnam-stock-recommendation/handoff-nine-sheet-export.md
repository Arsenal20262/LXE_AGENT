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

## 2026-10-20：P2-2 样式命名空间补修（未提交）

- 分支 / Pool 不变，HEAD 仍为 `3c692642510e7f01c2d6e0d2c05036e08b97d602`。Push 前只读验收发现前次测试遗漏了输出样式子节点的实际命名空间检查；本节记录该缺陷的局部修复，不修改 P2-1、main 合并或统一 CLI 契约。
- 根因：`minidom.importNode()` 保留 DOM 的 `namespaceURI`，但不会复制源文档祖先上的 `xmlns` 声明，`toxml()` 也不会自动补齐。默认命名空间样式导入带前缀的模板后，重新解析会落入空命名空间；计算结果使用不同前缀时还可能产生未绑定前缀。原 `dxfs` 补建路径也需要使用目标文档的有效前缀。
- 最小修复：仅在现有 `_append_styles` 内导入样式时检查目标父节点及祖先的实际命名空间绑定，缺少或被局部覆盖时在导入子树补上所需 `xmlns`；复用原节点 URI / QName，不硬编码前缀。补建 `dxfs` 沿用目标根前缀，保留位置。数字格式 ID、样式索引及引用映射算法不变，没有新增合并器、框架、Service 或依赖。
- 测试：默认命名空间、`ns0` / `sheet` 模板与默认 / `calc` 计算结果，分别覆盖有 / 无 `numFmts`；同时覆盖目标样式分组局部覆盖默认绑定、缺少 `dxfs` 及条件样式。12 组 XML 测试均重新解析并检查完整 QName，检查 numFmt / xf ID、引用边界、节点顺序、原样式及四张业务表 XML。修复前原矩阵 `10 failed, 2 passed`，最终矩阵全部通过。
- 定向回归：从仓库根配置现有 Office Kit，运行 `test_full_workbook.py` 与 `test_pr5_integration.py`，`27 passed`、无跳过，包含 4 个默认 / 前缀样式的真实 Office 打开重算及原 7 个九表集成用例。未重复运行无变更的 Runtime、Desktop、CLI 或模板生命周期套件。
- 原验收复现样例：错误命名空间节点由 203 个降为 0，重新解析后的 ElementTree QName 和 DOM `namespaceURI` 均验证通过。既有 Golden 的全部 18 个 ZIP 部件、九表结构、公式及 250 个非空缓存单元格逐字节一致；另一个带前缀样例修复前后仅 `xl/styles.xml` 有预期差异，其余部件和业务结果保持。
- 实际修改仅 3 个文件：`services/vietnam_replenishment/full_workbook.py`、`tests/vietnam_replenishment/test_full_workbook.py`（均在 `python/lxeskill_cli/` 下）及本 handoff。SKU 参数来源、雅仓读取、公式、Office 调用、聊天临时模板和 current / previous 未修改。
- Git 边界：本轮仅修改与定向验证，未 add、commit、merge、rebase、push 或修改远端 PR。工作区修复验证通过后可以准备独立 fix commit；必须先获提交授权，再分别获 Push / 请求重新 Review 授权。当前已提交 HEAD 尚不包含本次修复。
- 最终检查：`git diff --check` 通过；仅上述 3 个相关文件未暂存，无暂存或未跟踪文件，HEAD 不变。生产模块除 `_append_styles` 及其标准库命名空间常量导入外 AST 不变，敏感信息模式扫描无命中。
- NOT VERIFIED：真实 ERP 生产数据、真实聊天附件 UI 全链路、Windows 实机、原生 Excel / WPS、发布 build、全仓全量回归及掉电恢复；不以 Office Kit 和合成文件结果代替这些验证。

## 2026-10-20：独立反方五项反例整改完成（未提交）

- 基线 / 分支 / Pool：`885ac19ec683e05f87cde559ff9f963f9e85751d`，`codex/vietnam-stock-full-workbook`，`.worktrees/pool-17`。`origin/main@88a30338` 的既有合并关系保持；本轮没有同步 main，没有修改 P2-1 的 `input_assets.py`。
- 四项 OOXML 根因归并：SST 和样式跨树导入丢失源祖先 namespace 绑定；旧样式修补只看标准元素而遗漏属性 / MC 语义，并覆盖合法局部绑定；新包节点没有使用目标根的有效 QName；缺少 tableStyles 时 dxfs 被追加在 colors 后。现有 `full_workbook.py` 的内部导入函数同时承接 styles / SST，携带继承绑定并保留子树局部覆盖；继承 `mc:Ignorable` 按声明位置的 URI 解析，遇到局部前缀重新绑定时保留原 URI 语义。包节点使用各自 Content Types / Package Relationships URI；dxfs 查找 tableStyles / colors / extLst 后继。原样式偏移、数字格式映射及公式算法不变。
- 交付门禁：XML 序列化后重新解析并比较元素、属性实际 URI；现有成品检查补充此次涉及的空 namespace、包节点 QName、样式顺序 / 引用检查，并通过 openpyxl 实际遍历最终九表。扩展 payload 不做通用 schema 校验。真实 Office 后注入空 namespace SST / 未绑定前缀，正式 CLI 均退出 4、`ok=false`、`files=[]`，保留真实 XML 错误并删除本轮成品。
- 竞态根因：CLI 先将默认 current 固定为可变路径，workflow 读完三表才复制。原反例再次用真实独立上传进程将 A 换为 B，退出 4 并报旧 current/A.xlsx 的 FileNotFoundError；证据 `/var/folders/4v/hq4g01tn1jd8vtpm9mmx1q0m0000gn/T/pr90-race-red-ctwql0t2/report.json`。
- 已获用户明确批准最小 CLI / settings 联动。CLI 对越南槽只在既有设置锁内检查可用性，默认路径延后交给 workflow；其他槽行为不变。现有 settings 中 `snapshot_template` 在同一锁内选择 current、复制本轮临时快照并记录真实版本信息；函数返回即释放锁。workflow 在读取三表前固定快照，后续只使用它。显式文件仍按原路径使用，缺失时不会回退 current；缺模板仍保留既有 input_required 上传提示。adapter 透传既有 asset_sources，CLI 使用实际快照来源，避免早期检查的旧名称 / 日期覆盖真实来源。
- 并发测试：CLI 检查后换版、报表读取时换版两个窗口均通过；独立上传进程的真实非阻塞 OS 锁探测证实复制期间不能获得设置锁，快照返回后可继续上传。真实 Office CLI 在读取报表时将 current B 换为 C，本轮仍得到 B 的成本 12，下一轮得到 C 的成本 99，来源信息也分别为 B / C。两进程并发上传、重复上传及 8 类故障各连续注入 2 次后恢复上传均通过，current / previous 内容和 hash 保持正确；P2-1 实现未改。
- 独立红 / 绿：XML 新输入由 Workbook / 原始 XML 构造，未使用此前漏检的 skeleton / namespace helper。修改前 11 failed / 3 passed；竞态新增用例修改前 4 failed。最终 full_workbook 38 passed（含 4 项真实 Office），九表 Office 集成 7 passed；CLI / workflow / settings / 资产定向 158 passed，最终 CLI 受影响文件补跑 82 passed，增强 OS 锁探测补跑 1 passed。Bun lxeskill-command 契约 13 passed。以上重复补跑不重复累计；Python 共 203 个不同定向用例通过，没有声称全仓全量回归。
- 独立合法变体：原 SST 最小复现退出 0、openpyxl 可读取；10 组独立模板的 XML / openpyxl / Office 通过，原 source_prefix_rebinding 和 extended_attribute 输入额外核对元素、属性 URI 图并经真实 Office 重算通过。正式 CLI 的前缀 SST、前缀包声明、缺少 tableStyles 三个模板均生成可读九表，B/E/G/AE/AJ 为 2 / 001-A / 12 / 22 / 16。聊天临时模板 B 使用成本 99，长期 current A 不变，下一次默认成本仍为 12；无模板不会读旧 map，旧 --sku-map-file 仍被拒绝。
- Golden：最终合并器与原 before.xlsx 的 18 个 ZIP 部件逐字节一致；九表顺序、100 个公式、250 个非空缓存 / 值单元格、四张业务表 XML 和业务结果无差异。250 包括 246 个非空 v 缓存及 4 个原有 inline 值，并非 250 个公式缓存。B/G/AE/AJ、雅仓三表、SKU 精确匹配、价格 / 备货公式、聊天临时模板语义及 main 合并能力未修改。
- 实际修改 10 文件：生产 full_workbook.py、workflow.py、settings.py、services/agent_cli/vietnam_replenishment/generate.py、lxeskill/cli.py；对应 test_full_workbook.py、test_workflow.py、test_settings.py、test_vietnam_recommendation_cli.py；本 handoff。没有新 Store / Tool / CLI 命令 / 参数 / Workflow / Runtime 路由 / XML 框架 / 依赖 / 长期状态；catalog、Desktop、Runtime 及 ERP 未改。
- 证据：最终 XML `/private/tmp/pr90-final-xml.log`；Office 九表 `/private/tmp/pr90-final-nine-office.log`；CLI / 资产 `/private/tmp/pr90-race-final-targeted.log`、`/private/tmp/pr90-final-cli.log`；Bun `/private/tmp/pr90-final-bun-contract.log`；最终正式 CLI XML `/var/folders/4v/hq4g01tn1jd8vtpm9mmx1q0m0000gn/T/pr90-fix-evidence-zg8idnvh/report.json`；真实并发与临时模板 `/var/folders/4v/hq4g01tn1jd8vtpm9mmx1q0m0000gn/T/pr90-final-e2e-t1g004km/assets/assets-report.json`、`controls/controls-report.json`；Golden `/var/folders/4v/hq4g01tn1jd8vtpm9mmx1q0m0000gn/T/pr90-fix-golden-5ltu144n/report.json`。仍使用 checkout 既有 LXE_OFFICE_NODE / LXE_OFFICE_CLI，无新环境变量。
- Git / 下一步：git diff --check 通过，10 个相关文件未暂存，无暂存或未跟踪文件；敏感信息和无关改动检查无命中。HEAD 和 main 祖先关系不变，未 add / commit / merge / rebase / push 或修改 PR。五项既定缺陷均收口，未发现新的 Blocker / Should fix，可申请独立 fix commit；完成提交后再分别申请普通 Push 和 PR #90 重新 Review。
- NOT VERIFIED：真实 ERP 生产数据、真实聊天附件 UI 全链路、Windows、原生 Excel / WPS、发布 build、全仓全量回归、完整 Open XML schema 校验及掉电 / 进程强杀恢复。真实 Office Kit、Golden 和普通 I/O 恢复不替代这些验证。

## 2026-10-20：通用 CLI 职责与 adapter 必填来源字段收敛（未提交）

- 基线 / 工作区：`743b48bcea5e4670b451bfcc6da164c2b9cc0dd3`，`codex/vietnam-stock-full-workbook`，`.worktrees/pool-17`。本轮只读远端查询确认上游 main 为 `88a303386826e560ec6e45c692f93ee0f20311de`，已是 HEAD 的祖先；未重新合并 main。该基线已包含前述五项反例整改；本节取代上一节关于 CLI 越南特判的实现说明，不改写历史记录。
- 根因一：catalog 将业务模板声明为通用自动绑定资产，通用 CLI 为避免提前绑定可变 current 路径，又引入越南槽特判、私有设置锁依赖及来源覆盖。删除模板字段的自动绑定 / 自动提升注解后，参数仍为原可选文件输入；既有 workflow → settings.snapshot_template 负责默认选择、锁内复制和实际来源信息。通用 CLI 不再读取或提升越南模板，也不再直接引用越南模块或槽名。业务 adapter 将真实 template_missing 转换为已有 input_required / recovery；通用 CLI 仅统一转换该通用失败结构为退出码 2，保留实际脱敏错误，不含国家规则。
- 资产职责保持：原槽、command 管理属性和 settings 上传 / 导出入口不变，P2-1 提升实现没有修改。槽活跃性测试改为同时检查 catalog 自动绑定或服务中真实导入并调用 promote_asset 的消费者；保留注册、可选参数、文件输入及禁止 desktop 槽绑定等原检查。实现期间试用既有 desktop 属性后，实际上传测试证实会被提升函数拒绝，已撤销该改动；没有为越南添加共享提升例外。删除失去唯一消费者的 x-lxe-asset-promote-on-success 分支，避免遗留无用开关。
- 根因二：VietnamRecommendationRun 已强制提供 template_asset_source，原 adapter 的 getattr 仅容忍缺字段测试替身。直接读取该必填字段，测试使用完整的真实结果类型；生产 dataclass、字段、来源结构和其他错误处理不变。
- 并发 / 临时模板：原 settings.snapshot_template 在同一锁内选择 current 并复制，返回后释放锁，随后才读雅仓三表和运行 Office，本轮未修改该实现。真实独立设置 CLI 上传进程在读取报表期间将 B 换为 C，本轮仍使用 B（成本 12、来源 B.xlsx），下一轮使用 C（成本 99、来源 C.xlsx）；上传能在报表读取期间完成。显式临时模板成本 77、来源 upload，current C 的 hash 和 previous B 不变；后续默认仍使用 C。缺模板但放置旧 sku-map.xlsx 时退出 2 / input_required / files=[]，旧 --sku-map-file 仍退出 2 / invalid_arguments。
- 最终验证：Python CLI / infra（catalog 改动的仓库规定门禁）`500 passed, 4 skipped`；跳过项均为 Windows 专属路径或进程管理，另有 4 条既有 aiohttp 弃用警告。settings / workflow `42 passed`，含锁边界、故障恢复及上传 / 导出。Bun lxeskill-command 契约 `13 passed`。其中本轮三个 Python 修改测试文件补跑 `100 passed`，已被上述 CLI / infra 门禁覆盖，不重复累计。修复前两项新增回归失败，修复后通过；未宣称全仓全量回归。
- 真实文件与 Office：隔离临时 state / workspace，正式 CLI 完成 5 次九表生成，并对带前缀 SST 成品再次执行真实 Office Kit 重算和 openpyxl 读取；每次核对九表顺序及 B/E/G/AE/AJ。无需真实 ERP。本轮未修改 full_workbook、参数解析、雅仓三表处理、公式或生命周期实现。Golden 重新生成后全部 18 个 ZIP 部件逐字节一致，100 个公式、246 个非空 v 缓存及 4 个 inline 值（合计 250 个缓存 / 值单元格）、四张业务表 XML 和业务结果一致。
- 实际修改 8 文件：`python/lxeskill_cli/lxeskill/{cli.py,catalog.json}`、`python/lxeskill_cli/services/agent_cli/vietnam_replenishment/generate.py`、`python/lxeskill_cli/tests/lxeskill/{test_lxeskill_cli.py,test_vietnam_recommendation_cli.py}`、`python/lxeskill_cli/tests/infra/test_input_assets.py`、`packages/agent/runtime/test/tooling/lxeskill-command.test.ts`、本 handoff。Runtime 生产代码、Desktop、其他 ERP、workflow、settings、共享资产提升、计算和 XML 合并实现均未修改；无新命令、参数、Tool、Store、Workflow、Registry、Manager、框架、依赖或环境变量。
- 证据：`/private/tmp/pr90-boundary-python-final.log`、`/private/tmp/pr90-boundary-template.log`、`/private/tmp/pr90-boundary-bun-final.log`、`/private/tmp/pr90-boundary-core-final.log`；真实 CLI / Office `/var/folders/4v/hq4g01tn1jd8vtpm9mmx1q0m0000gn/T/pr90-boundary-real-ym2f1ghl/report.json`；Golden `/var/folders/4v/hq4g01tn1jd8vtpm9mmx1q0m0000gn/T/pr90-fix-golden-s82td6c0/report.json`。继续使用既有 LXE_OFFICE_NODE / LXE_OFFICE_CLI，没有新增配置。
- Git / 下一步：最终核对仅以上 8 文件未暂存，无暂存 / 未跟踪文件；diff --check 和新增内容敏感信息模式检查通过，HEAD 和 main 祖先关系不变。未发现本轮已知 Blocker / Should fix，可以申请独立 Fix Commit，Push 和远端 PR 操作分别等待批准。本轮未 add、commit、merge、rebase、push 或修改 PR。
- NOT VERIFIED：真实雅仓生产数据、真实聊天附件至 Excel UI 全链路、Windows、原生 Excel / WPS、发布 build、全仓全量回归、完整 Open XML schema 校验、掉电 / 强制终止恢复。未重跑本轮未修改的 Runtime / Desktop / Dashboard 功能套件，不将先前结论扩大为本轮新验证。

## 2026-10-20：PR 新增代码冗余审查与最小清理（未提交）

- 基线：原分支 / pool-17 / HEAD `743b48bcea5e` 不变；只读 ls-remote 再次确认上游 main 为 `88a303386826e560ec6e45c692f93ee0f20311de`，与本地 origin/main 相同且已是 HEAD 祖先。先保存原有 8 个未提交文件内容至 `/private/tmp/pr90-redundancy-before-qhumqc43`，保留全部原改动；未同步 main 或修改其他工作区。
- 审查范围：相对该 main 的 CLI / catalog、Vietnam adapter、模板生命周期、OOXML 合并、计算 / 校验、Desktop / Dashboard / protocol、定向测试和活动 Skill / 文档。对 22 个修改或新增 Python 文件核查导入与 helper 消费者，再沿真实调用点确认。没有发现可安全整块删除的生产 helper、状态或兼容层；不因单调用方、代码长度或仅测试直接调用就认定无用。
- 三项收敛：通用 CLI 的自动提升开关已在上一轮删除，本轮去掉其遗留的单次 property_schema 中间变量，恢复 main 原表达式；旧 map 夹具删除后 test_recalculation.py 已无 Workbook 消费者，移除该闲置导入；修正活动 Skill 中“首次计算上传、后续省略模板”的歧义，明确只有设置页保存的 current 可供默认复用，聊天模板不会保存。未改历史计划或历史 handoff。
- 保留依据：snapshot_template 的锁内选择 / 复制防换版竞态；资产暂存、hash 校验与恢复保护 current / previous；XML 导入保留源 namespace / MC 语义，序列化检查捕获 QName 改变，成品检查覆盖包结构和真实读取，职责不同；生成前参数校验阻止坏输入进入 writer / Office，重算后校验检查 Office 输出；allow_empty_map 仍承接模板没有任何匹配 SKU 的合法业务情形，不是旧 map 文件回退；低层生成器自己的模板副本和既有公开 writer / validator 默认契约未擅改。独立 XML 反例测试继续保留，未合并为同源测试辅助函数。
- 本轮实际改动仅 cli.py、test_recalculation.py、skills/vietnam-replenishment/SKILL.md 和本 handoff；前两文件分别为单次变量内联、删除未使用导入，业务行为不变。与上轮未提交改动合计现有 10 个文件；无新文件、命令、框架、状态或依赖。
- 定向验证：Python test_lxeskill_cli.py / test_vietnam_recommendation_cli.py / test_recalculation.py 共 `146 passed`；Bun skills.test.ts / lxeskill-command.test.ts 共 `26 passed`。没有重复运行代码及基线未变的全仓或 CLI / infra 门禁。正式 CLI + 真实 Office Kit 的 5 次九表生成及前缀 SST 成品重算 / openpyxl 读取通过，真实独立进程 B→C 换版、本轮固定 B / 下轮 C、聊天临时模板不改 current / previous、缺模板 input_required 和旧参数拒绝均通过。Golden 重生成的全部 18 个 ZIP 部件一致，100 个公式、246 个非空 v 缓存及 4 个 inline 值、四张业务表 XML 无差异；不以此代替完整 OOXML schema 验证。
- 证据：`/private/tmp/pr90-redundancy-python.log`、`/private/tmp/pr90-redundancy-bun.log`、`/private/tmp/pr90-redundancy-real.log`；真实文件 `/var/folders/4v/hq4g01tn1jd8vtpm9mmx1q0m0000gn/T/pr90-boundary-real-1_89q7iq/report.json`；Golden `/var/folders/4v/hq4g01tn1jd8vtpm9mmx1q0m0000gn/T/pr90-fix-golden-3vl283yy/report.json`。LXE_OFFICE_NODE / LXE_OFFICE_CLI 沿用原 checkout 配置。
- Git / 边界：本轮没有 add、commit、merge、rebase、push 或远端 PR 操作；最终检查限上述 10 个文件未暂存、无暂存 / 未跟踪文件，diff --check 和新增内容敏感信息模式检查通过。未发现本轮 Blocker / Should fix；可申请独立 Fix Commit，提交后再分别申请 Push / PR 操作。P2-1、XML、锁内快照、SKU 来源、雅仓三表、公式与 main 有效契约实现均未改。真实生产数据、聊天附件 UI 全链路、Windows、原生 Excel / WPS、发布 build、全仓全量、完整 schema 和掉电恢复仍为 NOT VERIFIED。
