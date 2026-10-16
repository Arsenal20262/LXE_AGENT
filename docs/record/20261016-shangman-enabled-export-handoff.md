# 上马印尼启用商品导出交接

- 工作区：`pool-5`；分支：`codex/shangman-enabled-export-filter`。
- PR：`Arsenal20262/LXE_AGENT#10`，目标为该仓库 `main`。上游 LXE123 的 PR 由用户手动处理，不执行 merge。
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
- 最后一次生产只读验收：自然语言 → 现有 Skill 入口 → 当前 pool-5 `.venv` CLI → `merchant/exportNew`；上马返回 HTTP 504，CLI 返回 `export_http_failed`、退出码 4、`files=[]`。未重试、刷新登录或交付历史文件。下载、列表分页至最终文件的最新生产端到端验收未完成，Excel/WPS GUI 未验证。

## 限制与下一步

无法可靠匹配时停止交付，不放宽编码或时间规则。已有公式、合并单元格及多个商品数据工作表的失败边界保持不变，不承诺任意复杂 XLSX 结构兼容。两接口缺少已证实的同一快照保证；真实订单销量准确性不在本次验收证明范围内。

无其他 PR 依赖。此次 504 没有证据证明是方案 C 缺陷，不据此修改业务代码。收口将必要修改推送到 arsenal 同名分支并更新已有 PR #10；剩余生产验收待用户决定后续安排。最终 Git 状态及提交 SHA 以收口汇报为准。
