# 上马印尼启用商品导出交接

- 工作区：`pool-5`；分支：`codex/shangman-enabled-export-filter`。
- 当前评审 PR：`LXE123/LXE_AGENT#94`，目标为该仓库 `main`；源分支位于 `Arsenal20262/LXE_AGENT`。原 fork PR 为 `Arsenal20262/LXE_AGENT#10`，不新建 PR、不执行 merge。
- 已有功能提交：`c96df64f`；dimension 修复及测试：`90168eb0`。本文件与最新版 Skill 说明一同提交。

## 完成范围与入口

保留 `shangman-products-export` → `lxeskill shangman products export` → 原 CLI 适配器 → `GoodsExporter.export()`。下载 `merchant/exportNew` 官方 XLSX，再分页读取 `merchant/list?status=2`（每页 500 条），按商品编码和创建时间原始文本一对一匹配，交付筛选后的工作簿。

列表仅确定启用商品范围，不覆盖官方销量、库存或其他业务字段。重复 SKU 的独立记录保留；身份键冲突、分页不完整或状态异常时失败关闭。`status=2` 不等于正在平台销售、有销量或必须备货。

修复根据保留单元格坐标生成 XLSX dimension，不依赖源表错误范围或固定列数。未改变认证、CLI、Runtime、分页、身份匹配、交付及备货算法，未新增依赖。

认证继续使用桌面既有注入：`LXE_SHANGMAN_TENANT_ID`、`LXE_SHANGMAN_USERNAME`、`LXE_SHANGMAN_PROCESSED_PASSWORD`、可选 `LXE_SHANGMAN_CONFIG_REVISION`，及原有 `LXE_DATA_ROOT` / 工作区机制。没有复制凭据或新增环境变量。

修改文件：Service、`test_goods_export.py`、上马导出 Skill、catalog 产物说明、现行 Skill 目录及本交接文件。

## 验证证据

- P2 修复后：`uv run --frozen pytest -q python/lxeskill_cli/tests/shangman/test_goods_export.py`，65 通过、0 失败、0 跳过。新增 8 个用例覆盖普通/标准只读模式、12/36 列和空结果，输出读取不使用 `reset_dimensions()`；修复前其中 4 个只读用例失败。
- 审核阶段：Python `test_command_contracts.py`、`test_lxeskill_contract.py` 共 104 通过；Bun `lxeskill-command.test.ts`、`skills.test.ts` 共 25 通过。P2 后未修改这些契约，本轮收口不重复运行测试。
- 保存的真实样本离线重放：17,146 行源表保留 13,852 行、排除 3,294 行；36 列值、类型、样式差异为 0 行，7/15/30 天销量和库存保留原值。普通与标准只读模式均可读取；范围为 `A1:AJ13853`，其他 ZIP 成员未变。数字仅对应该样本，不作为实时数量要求。
- 此前一次生产只读验收：自然语言 → 现有 Skill 入口 → 当前 pool-5 `.venv` CLI → `merchant/exportNew`；上马返回 HTTP 504，CLI 返回 `export_http_failed`、退出码 4、`files=[]`。未重试、刷新登录或交付历史文件。该次下载、列表分页至最终文件的生产端到端验收未完成，Excel/WPS GUI 未验证。

## 限制与下一步

无法可靠匹配时停止交付，不放宽编码或时间规则。已有公式、合并单元格及多个商品数据工作表的失败边界保持不变，不承诺任意复杂 XLSX 结构兼容。两接口缺少已证实的同一快照保证；真实订单销量准确性不在本次验收证明范围内。

无其他 PR 依赖。此次 504 没有证据证明是方案 C 缺陷，不据此修改业务代码。文字收口按用户授权推送到 arsenal 同名分支并更新已有 PR #94；最终 Git 状态及提交 SHA 以收口汇报为准，合并由维护者审核决定。

## 2026-10-20 契约文字收口

- 本次文字修订基于审查 HEAD `a450b8ee2be46a5a9082a82bfa08c95db63eb370`；此前 Skill 正文修订 `f75873cc` 已包含在该提交历史中，无需重复提交。
- 仅修正 Skill 的 `description`：将“销量原始 XLSX”改为明确按 ERP `status=2` 筛选的 XLSX，保留官方原始业务字段及数值。名称、命令、Shopee/TikTok 背景、正文结构、身份精确匹配、分页与失败规则保持原样；Catalog 和目录说明已准确，无需改动。Service、认证、CLI、Runtime 和环境变量均未修改。
- 本轮验证：`UV_CACHE_DIR=/private/tmp/lxe-pr94-uv-cache uv run --frozen --no-sync pytest -q python/lxeskill_cli/tests/lxeskill/test_command_contracts.py python/lxeskill_cli/tests/lxeskill/test_lxeskill_contract.py`：104 通过、0 失败、0 跳过；`bun test packages/agent/runtime/test/tooling/lxeskill-command.test.ts packages/agent/runtime/test/tooling/skills.test.ts`：25 通过、0 失败；`git diff --check` 通过。未调用生产 ERP，不将本轮离线验证作为生产验收。
- PR 正文同步内容：`status=2` 仅表示 ERP 商品启用，不代表平台在售、有销量或必须备货；商品编码与创建时间无法唯一匹配或分页不完整时整次失败，不交付部分文件或历史文件。
- 用户已审核并授权提交、推送及更新现有 PR #94。本次提交只包含 Skill description 修订和本交接记录；原有未跟踪的 `docs/templates/` 保留，不纳入提交。上述测试后仅更新交接文字，提交阶段不重复运行测试、不调用生产 ERP。
