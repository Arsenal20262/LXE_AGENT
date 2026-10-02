# 越南备货 PR3 交接：内置骨架、五表生成与重算

> 本页记录 PR3 已验证并分步提交的模块。用户已批准本地提交及向个人仓库推送；创建 PR 仍须单独确认。

## 接手位置和依赖

- 当前分支：`codex/vietnam-stock-pr3-workbook`，worktree：`/Users/hym/.codex/worktrees/3062/LXE_AGENT1`，基于 PR2 提交 `405e5586`。未在 `main` 或 PR2 分支追加代码。
- PR3 依赖个人仓库 PR2 的代码；PR2 又依赖 PR1。上次只读核对时，个人 PR1、PR2 尚未合并，PR3 的个人 PR 应以 PR2 分支为 base。推送前需重新核对远端提交和 PR 状态；向组长仓库提交须等待前序模块按序合并并分别获得用户批准。
- 本模块只处理离线生成：传入同一轮 PR2 `VietnamSources`、运营 SKU 映射表和新输出路径。生产雅仓调用、Vietnam Skill、Desktop 上传入口、配置接线和 `send_files` 属于后续 PR。

## 本模块内容与调用链

| 文件 | 作用 |
| --- | --- |
| `scripts/build-vietnam-skeleton.py` | 只读审计本机九表模板，从全新工作簿构造五表无历史数据骨架；用表头和公式指纹限制无意规则变化。 |
| `services/vietnam_replenishment/resources/skeleton.xlsx`、`pyproject.toml` | 随 Python wheel 发布五表骨架；不打包九表原件。 |
| `services/vietnam_replenishment/workbook.py` | 校验本轮每个 SKU 的动销、库存、商品、权威在途和运营显式价格，按表头投影三张来源表，并把本轮行与公式写入骨架。 |
| `services/vietnam_replenishment/recalculation.py` | 调用项目 `shared.office` 的 LibreOffice Kit 重算，读取公式和缓存值校验，通过后才原子发布成品。 |
| `tests/vietnam_replenishment/test_skeleton.py`、`test_workbook.py`、`test_recalculation.py` | 合成数据测试骨架隐私、来源与映射表缺失、公式填充、重算失败诊断和交付边界。 |
| `docs/harness/vietnam-stock-recommendation/design.md`、`asset-contract.md`、`current-sku-map.md`、`pr3-workbook-design.md`、`pr3-workbook-plan.md`、本页 | 更新生产口径、实现计划和交接。 |

入口：`generate_vietnam_workbook(map_path, output_path, *, sources, config=None)` → `load_sku_parameters()` → `write_vietnam_workbook()` → 包内 `resources/skeleton.xlsx` → `shared.office recalculate` → `validate_recalculated_workbook()` → 新输出文件。调用方须把同一轮雅仓数据作为 `sources=` 传入；PR3 不再次导出雅仓，也不读取 `vietnam_replenishment_template` 资产槽或历史模板参数。

本轮 SKU 为 VN8806 库存动销与当前库存列表的并集，但每个 SKU 必须在动销、库存和仓库产品三份数据中均有有效行。总在途只取库存列表 `在途数量`；商品资料 `创建时间` 是业务确认的真实上架时间，写为 `YYYY-MM-DD HH:MM` 文本。运营映射表按精确 SKU 显式提供成本、跨境价、折扣价；热销缺失默认 `2`。旧映射表若有 `上架时间`，仅核对是否与商品时间冲突。无任何模板历史兜底，也不猜成本或价格。

最终文件恰好五张表：`越南备货清单`、`雅仓库存`、`雅仓动销`、`数据更改`、`库存商品信息`。主表 `AN` 是权威在途；`AO:AU` 为空。主表品牌、链接、产品图片、传过的店铺缺少已确认来源，暂为空。四参数默认 `0.8 / 0.8 / 0 / 3900`，可以通过本次 `RecommendationConfig` 显式覆盖；聊天与 Desktop 配置优先级后续接线。

## 环境与验证

- Python 使用本 worktree 的 `.venv` 与 `uv --frozen`；Office 使用宿主提供的绝对路径 `LXE_OFFICE_NODE`、`LXE_OFFICE_CLI`。PR3 没有新增凭据或其他环境变量。雅仓既有账号配置不在本模块读取或记录。
- 从仓库根执行 `UV_CACHE_DIR=/private/tmp/uv-cache-pr3 uv run --frozen --no-sync pytest -q python/lxeskill_cli/tests/vietnam_replenishment python/lxeskill_cli/tests/yacang`，结果 **179 passed**。这批测试使用合成文件和本机雅仓模拟服务；首次沙箱内运行因禁止绑定 `127.0.0.1` 失败，在允许本地端口的环境重跑后全绿。最后仅调整校验器在打开文件失败时关闭句柄，随后重跑 `test_recalculation.py`，结果 **15 passed**。
- 项目自带 Office Kit 真实重算通过三条合成 SKU：新品 `VN-NEW-3` 的 30/15/7 天销量均为 `1`，用公式权重与 `0.8/0.8/0` 参数独立算得日均约 `0.107948380733191`，与 `S` 一致；`R=1.2` 时 `T=ROUNDUP(S×R,2)=0.13`。其 `AC=40`、可用库存 `5`、在途 `2`，按模板 `ROUNDUP(0.13×40−5−2, -1)` 得 `H=-10`。旧品 `VN-OLD-3` 的 `3.89×70−10−3=259.3`，得 `H=260`；零动销零库存 `VN-ZERO-3` 得 `H=0`。三者的 `AA` 都等于商品表创建时间；零动销的 `AB=#DIV/0!` 仅在已审计的 `S=0` 条件下放行。主表及其余四表均已渲染并目视检查。
- 使用本机缓存中的固定 Hatchling `1.31.0` 执行 `uv build --wheel --offline --out-dir /private/tmp/pr3-wheel` 成功。wheel 恰好包含一个 `services/vietnam_replenishment/resources/skeleton.xlsx`；骨架 10,533 字节、五表，主表仅保留表头/公式，ZIP 不含图片、绘图、批注、外链、共享字符串或历史 SKU/价格行。构建后还需在最终 Windows 安装包验收资源读取。
- 额外用真实 Office Kit 验证：映射表跨境价为显式 `0` 时，利润率 `AH` 无法计算，生成接口明确报 SKU、字段及单元格且不留下最终文件。缺必需来源或映射字段、公式被篡改、缓存和来源不一致也均在定向用例中失败。

## 已知边界与下一步

- PR3 是离线 Python 生成入口，尚未把生产雅仓、聊天 Skill、Desktop 映射表上传及配置、`send_files` 串成用户流程；PR4/PR5 分别负责接线。真实雅仓当前库存导出仍需后续现场联调。开发期间未调用生产雅仓。
- 零跨境价或折扣价虽作为显式输入保留，但原模板利润率公式会除以该价格；为保证完整表可计算，最终生成明确失败并要求运营给出可计算价格，未自行更改业务公式。主表品牌、链接、内嵌产品图片和传过的店铺按用户批准留空，商品信息表保留来源图片链接。
- 真实九表模板只在本机作只读公式与样式参考，不能进入 Git 或安装包；Windows 安装包本身尚未在本机验证。四项参数的聊天、设置优先级由后续接线实现。
- 旧 `prepare_operator_sku_map(template_path, ...)` 和 `resolve_sku_parameters()` 仍保留 PR2 的历史模板辅助能力；PR3 完整五表生成绕开这些入口。清理旧模板槽与辅助接口须先证明没有调用方，单独评审。

Git 状态：本模块共改动 14 个路径，代码已按三项独立功能提交：`8f03fcd0`（骨架）、`0da72799`（本轮数据写入）、`d01976b7`（Office 重算与校验）；设计与本交接页形成第四项文档提交。`git diff --check` 通过，13 个文本文件逐行空白符检查无问题，改动中的账号/密码/令牌关键词检查仅命中读取既有环境变量、合成脱敏测试和文档说明，未发现硬编码真实凭据或业务价格。分支已推送到个人仓库的 `codex/vietnam-stock-pr3-workbook`；远端 PR2 仍为本分支所依赖的 `405e5586`。尚未创建 PR；创建 PR 与 merge 仍须分别批准。PR3 收口后在新任务窗口继续 PR4。
