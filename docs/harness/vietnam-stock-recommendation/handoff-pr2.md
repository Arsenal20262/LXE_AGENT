# 越南备货 PR2 交接：本轮雅仓数据与运营 SKU 映射表

## 接手位置和依赖

- 开发分支：`codex/vietnam-stock-pr2-yacang`，worktree：`/Users/hym/.codex/worktrees/18f8/LXE_AGENT1`。没有在 `main` 开发。
- PR2 从 PR1 分支 `codex/vietnam-stock-recommendation` 的 `575e73c1` 建立。2026-10-02 只读查询远端：个人 `fork/main` 与组长 `origin/main` 均为 `dbf598fc`，个人 PR1 分支仍为 `575e73c1`。本地普通主工作区 `main` 为旧提交 `805d1ef1`，不是 PR base。
- [个人仓库 PR1](https://github.com/Arsenal20262/LXE_AGENT/pull/1) 尚未进入个人 `main`。个人 PR2 创建时以 PR1 分支为 base，只展示 PR2 差异；PR1 合并后按实际 merge/squash/rebase 方式调整 PR2 基底。组长仓库要按 PR1 → PR2 顺序分别评审，PR1 进入组长最新 `main` 后才准备 PR2；本轮不向 `origin` push、建 PR 或 merge。

## 本模块交付

| 文件 | 作用 |
| --- | --- |
| `services/vietnam_replenishment/yacang_sources.py` | 通过现有雅仓 workflow 一次取得三份报表；校验来源并读取本轮 SKU 并集、过滤全局商品、给出缺失来源、缺总在途和在途差异。 |
| `services/vietnam_replenishment/sku_parameters.py` | 读取同 SKU 的模板历史参数，处理重复行冲突，按运营显式值、无冲突模板值、热销默认值解析字段来源。 |
| `services/vietnam_replenishment/operator_map.py` | 新建运营上传 XLSX；第一张只写当前 SKU 和已有显式值，第二张只做历史与缺失诊断参考；已有目标文件不被覆盖。 |
| `services/vietnam_replenishment/preparation.py` | 薄组合入口，先预检本地资产，再取雅仓数据、解析参数和生成运营表；可注入同一轮已取得的数据以避免重复导出。 |
| `tests/vietnam_replenishment/test_yacang_sources.py`、`test_sku_parameters.py`、`test_operator_map.py`、`test_preparation.py` | 全部使用合成 XLSX/模拟调用，覆盖来源不齐、并集、新 SKU、重复/异常 SKU、公式、历史冲突、显式零、上传表隔离和单轮调用。 |
| `docs/harness/vietnam-stock-recommendation/current-sku-map.md`、`pr2-yacang-merge-plan.md`、`handoff-pr2.md` | 记录稳定数据口径、模块边界、计划和交接。 |

调用链：`prepare_operator_sku_map(template_path, output_path, current_map_path=None)` → `export_vietnam_sources()` → 既有 `services.yacang.workflow.run` → `load_template_sku_parameters()` / PR1 `load_sku_parameters()` → `resolve_sku_parameters()` → `write_operator_sku_map()`。调用方已有同一轮数据时传 `sources=`；结果对象返回输出路径、来源快照、逐 SKU 解析值及来源。

用户已确认总在途使用当前库存列表的 `在途数量`；动销的 `在途` 只对照，不能补空值。当前 SKU 集合采用 VN8806 动销与库存列表并集，全局产品只保留此集合。`创建时间` 不当作 `上架时间`。历史值只在参考表和计算时兜底，不变成运营上传表里的显式输入。

## 验证与限制

- 从此 worktree 根目录运行 `uv run --frozen --no-sync pytest -q python/lxeskill_cli/tests/vietnam_replenishment python/lxeskill_cli/tests/yacang`：**138 passed**。雅仓原有测试要绑定本地 `127.0.0.1` 模拟服务，因此该次测试在允许本地监听的环境运行；纯沙箱运行会报 `PermissionError: [Errno 1] Operation not permitted`，与代码无关。
- `git diff --check` 对已跟踪的导航文档通过；未跟踪的 PR2 新文件已逐个检查行尾空格。新增范围没有 `.xlsx`、`.env`、数据库或常见密钥字面量。最终暂存后还需用 `git diff --cached --check` 检查完整改动。
- 未调用生产雅仓；真实当前库存列表尚无现场样本验收。服务接口尚未注册 Vietnam Skill 或 Desktop 上传入口；五表生成、LibreOffice 重算、备货结果和对用户发文件均属于后续独立 PR。
- 没有新增环境变量；雅仓既有配置 `LXE_YACANG_MOBILE` / `LXE_YACANG_PASSWORD` 仍由现有 workflow 使用，不写入本模块或日志。

## Git 状态和下一步

PR2 采用四个独立提交：`e69ba550`（雅仓来源）、`532d8b21`（SKU 参数）、`b59f0643`（运营上传表），以及包含组合入口与本交接文档的第四个提交。第四个提交后应检查工作区为干净；个人和组长仓库均未推送 PR2。PR1 与 PR2 的改动文件路径没有重叠，当前两条远端 `main` 都是 PR1 的祖先；这只证明当前提交头下按依赖顺序无提交图冲突，不能预判之后 `main` 的变化。

下一步：重新核对两个远端头和 PR1 状态，验证 PR2 相对 PR1 的差异仅含本模块。随后分别取得用户批准再 push 到个人 fork、在个人 fork 创建以 PR1 分支为 base 的独立 PR。PR1 合并方式若改写提交历史，先按其实际结果移植 PR2 独有提交并复验，不把 PR1 文件重复放进 PR2。下一模块在新的聊天和分支继续。
