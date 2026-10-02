# 越南备货 PR1 交接：输入资产契约

## 接手位置

- 分支：`codex/vietnam-stock-recommendation`。
- Worktree：`/Users/hym/PycharmProjects/LXE_AGENT1/.worktrees/pool-1`；主工作区仍在 `main`。
- `origin` 是老大的 `LXE123/LXE_AGENT`，本轮不得向它 push、建 PR 或 merge。个人仓库是其 fork：`Arsenal20262/LXE_AGENT`，尚未配置为本地 remote。当前按“先在个人仓库提 PR，之后由用户处理老大仓库的 PR”路线准备；push 和创建 PR 仍须分别获批。
- 本地 `main` 是 `805d1ef1`，已 fetch 的 `origin/main` 是 `dbf598fc`，个人 fork 的 `main` 是 `efd39316`，比老大 `main` 落后 164 个提交。当前功能与交接截至 `9d6fcbb3` 共六个提交，仍以旧基线为祖先；rebase 尚未执行，须另获批准后检查冲突。
- 目标：只完成完整模板与 SKU 参数表的资产身份、只读校验和读取。下一模块不得继续堆在本分支；PR1 收口后应在新聊天窗口领取新分支。

## 已完成的契约

| 入口 | 当前行为 |
| --- | --- |
| `services.vietnam_replenishment.asset_contract.validate_template(path)` | 只读验证五张必需表、关键表头、四参数公式引用；允许输入模板的其他辅助表及重复历史 SKU，返回非空历史 SKU 行数。 |
| `services.vietnam_replenishment.asset_contract.load_sku_parameters(path)` | 从首表按表头读取 SKU 级业务参数。文本 SKU 精确匹配；空白保留缺失，显式零保留；拒绝重复 SKU、公式输入、无效数值或日期。 |
| `shared.input_assets.load_input_assets()` | 注册 `vietnam_replenishment_template`、`vietnam_sku_parameter_map` 两个 `desktop` 管理槽；既有槽默认 `command`。 |
| `shared.input_assets.current_asset(slot_id)` | 继续提供本地资产当前版的只读入口。 |
| `shared.input_assets.promote_asset(slot_id, source)` | 在读取候选文件前拒绝向两个 Desktop 槽做通用命令提升。 |
| `services.assets.inspect.run()` | 只读列表新增 `management` 字段。 |

源设计在 [design.md](design.md)，面向开发者的稳定边界在 [asset-contract.md](asset-contract.md)，实施步骤在 [asset-contract-plan.md](asset-contract-plan.md)。涉及文件：上述三份文档、`docs/README.md`、`python/lxeskill_cli/lxeskill/catalog.json`、`python/lxeskill_cli/shared/input_assets.py`、`python/lxeskill_cli/services/assets/inspect.py`、`python/lxeskill_cli/services/vietnam_replenishment/` 及对应 `tests/infra/test_input_assets.py`、`tests/vietnam_replenishment/test_asset_contract.py`。

## 数据边界

- 最终业务工作簿只能有 `越南备货清单`、`雅仓库存`、`雅仓动销`、`数据更改`、`库存商品信息` 五表，行集合仅来自本轮 `VN8806` 雅仓 SKU。真实九表模板中的 8,300 行是历史参考，不能直接复制成最终行集合。
- 参数优先级：运营映射表显式值 → 同 SKU 模板历史无冲突值 → 已确认业务默认值（热销为 `2`）→ 缺失。模板重复 SKU 的字段若冲突，不取第一行。
- 运营映射表从本轮越南 SKU 和雅仓三类数据无法提供的 SKU 级字段提取。模板历史值可作为核对信息；不能悄悄变成更高优先级的运营显式值。实际表需等本轮三类雅仓导出取得后生成。
- 没有真实模板、运营映射表、成本/价格或账号凭据进入 Git 或安装包。本模块不调用生产雅仓。

## 验证记录

- 模板与映射表定向合成测试：`55 passed`。
- 资产槽与模板/映射表组合定向测试：`68 passed`。
- 修改共享 `catalog.json` 后，Python 的 `tests/lxeskill` 与 `tests/infra`：`374 passed, 2 skipped`；本地测试服务器需允许监听 `127.0.0.1`。
- Bun 的 `packages/agent/runtime/test/tooling/lxeskill-command.test.ts`：`9 passed`。
- 提供的真实模板只读探测：九张表、主表 8,300 个非空 SKU 行，结构校验成功；文件本身未更改。
- `git diff --check` 通过。前五个提交完成后工作区曾检查为干净；本交接文件尚待独立提交。全量测试按项目规则留到合并 `main` 前、最终 rebase 后只执行一次。

## 已知边界与下一步

1. **PR1 收口**：先把个人 `main` 快进同步到老大最新 `main`，避免把 164 个上游提交带入个人 PR diff。获批后将当前功能分支同步到同一基线、检查冲突和 PR diff；如 rebase 实际引入基线变化，按项目规则重跑受影响测试。更新本交接的 Git 状态后，分别取得向个人仓库 push 和创建 PR 的明确批准。本轮不向老大仓库 `origin` push 或建 PR；合并另需单独批准。
2. **PR2，在新窗口/新分支**：复用现有雅仓导出取得 `VN8806` 的库存动销、库存列表，以及全局仓库产品资料；第三份只能按当前越南 SKU 过滤。逐 SKU 合并参数并生成运营核对/回填表。不能根据款号、名称或 SKU 后缀猜成本和价格；缺失实时库存或销量需单独诊断，不能让运营映射表伪造。
3. **待业务口径确认**：本轮 SKU 集合取库存列表、库存动销的并集还是其他规则；两份雅仓报表中哪一列是权威总在途；`上架时间` 是否由运营显式提供（雅仓 `创建时间` 不能默认等同）；缺成本/价格时完整运营表如何标缺失；运营回填是全量映射表还是带版本校验的补丁合并。
4. **后续模块**：五表生成与 LibreOffice 重算、Workflow/Skill、Desktop 绑定与四参数、端到端回归分别评审。LibreOffice 对原模板中的 WPS 单元格图片需另做目标客户端验证，不能仅凭计算成功判定成品无损。

当前没有新增环境变量。开发使用 worktree 自己的 `.venv`，Python 用 `uv`、JavaScript 用 `bun`；测试从仓库根运行。
