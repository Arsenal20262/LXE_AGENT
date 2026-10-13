# 越南备货九表导出 handoff

- 分支 / Pool：`codex/vietnam-stock-full-workbook`，`.worktrees/pool-17`。基线 `origin/main@9f36647a`；主功能提交 `96943964`。尚未 push 或创建 PR。
- 完成内容：使用完整九表模板生成越南备货清单。五张计算与来源表更新为本轮雅仓数据；`改库存`、`改折扣`、`报官方活动`、`竞价报名` 四张业务表的工作表 XML 保持原字节。九表模式默认按 SKU 从模板主表读取热销标记、成本、跨境价和折扣价，无需独立 SKU 映射表。模板缺少的雅仓 SKU 仍导出来源数据，依赖模板的字段留空，不填零。
- 设置页：卡片改为「越南备货模板表」，只显示「导出当前模板表」和「上传/替换模板表」。上传先验证九表结构，成功后保存到 `vietnam_full_workbook` 输入资产槽；后续计算自动复用。聊天显式提供的模板只用于本轮，不替换保存的当前版。天数修正与销量权重、汇率并列常显，不再使用「高级设置」折叠区。
- 旧 SKU Desktop 接口核查：当前 Dashboard 生产页面和 Runtime 未找到调用，仓库内仍有 IPC、preload、协议字段及测试消费；旧版或外部桥接消费者尚未证实不存在。暂保留，待确认打包版本兼容范围和外部消费者后再决定删除；此结论不影响仍受支持的 CLI `--sku-map-file`。
- 主要修改：`services/vietnam_replenishment/{asset_contract,full_workbook,recalculation,settings,workbook,workflow}.py`；CLI 与 `catalog.json`；Desktop IPC/预加载桥接、Dashboard 设置页；相应 Python/Bun 测试和 Skill 文档。入口是 `lxeskill vietnam replenishment calculate` → `workflow.generate_current_vietnam_recommendation` → `recalculation.generate_vietnam_workbook` → `full_workbook.combine_full_workbook`。三份雅仓报表仍由现有导出流程提供。
- 环境：现有 `LXE_DATA_ROOT` 保存设置和模板资产。测试用 `LXE_OFFICE_NODE`、`LXE_OFFICE_CLI` 指向宿主 Office Kit；没有新增生产环境变量、依赖或密钥。
- 此前验证：越南模块 `284 passed`；CLI/infra `471 passed, 4 skipped`；Bun catalog 契约 `12 passed`；Desktop 桥接/设置服务 `11 passed`；Dashboard 越南设置页 Chromium 行为测试通过，宽屏和窄屏截图检查了天数修正常显布局；Dashboard 与 Desktop 类型检查通过；Desktop 构建通过。使用用户提供的真实九表模板在临时应用数据目录上传、导出，SHA-256 一致。此前用该模板与合成雅仓报表生成九表预览，四张业务表 XML 字节一致。
- PR 前收口验证：聊天模板 A/B 生命周期测试先对旧逻辑复现失败，修复后通过；相关 Python CLI/infra、设置与九表测试 `508 passed, 11 skipped`，旧映射表导出测试 `17 passed`，Bun catalog 契约 `12 passed`，Desktop 旧桥接/设置测试 `15 passed`，Dashboard 与 Desktop typecheck 通过。11 项跳过中含未配置宿主 Office Kit 的集成用例；本轮未再做真实聊天附件到 Excel 的端到端测试（NOT VERIFIED）。`git diff --check` 通过；改动只涉及本次契约、CLI、测试和文档，敏感字面量扫描为零。本轮未执行 add、commit、push 或 PR 操作，7 个相关文件仍为未暂存修改。
- 已知限制：没有本轮真实雅仓三份报表，预览只含合成 SKU，不能作为真实备货建议。模板公式价依赖 XLSX 保存的计算缓存；用户模板中 4 个 SKU 的重复行参数不一致，本轮命中时会报行号。其他模板若四张业务表带独立附件关系，合并器会拒绝；用户提供的模板不触发此限制。四张业务表引用新主表的公式在 Excel 打开后由 Excel 重算。
- PR 依赖与下一步：本模块基于当前 `origin/main`，无前序 PR 依赖。待用户另行批准后再 add/commit；push、创建 PR 仍须分别确认。合并前依项目规范与当时最新 `main` 做兼容检查和必要的最终验证。
