# 越南备货 PR5 交接：Desktop 映射表与长期参数

> 本页记录 PR5 已实现、验证和本地提交的范围；PR5 尚未推送、创建 PR 或合并。

## 接手位置与依赖

- 开发分支：`codex/vietnam-stock-pr5-desktop`；Pool worktree：`/Users/hym/PycharmProjects/LXE_AGENT1/.worktrees/pool-2`。从 PR4 分支 `codex/vietnam-stock-pr4-workflow` 的已核对提交 `b2bff2f6a5df434983a2e061161d5c34d7140777` 开始；PR5 应以 PR4 分支为 base，前序仍按 PR1 → PR2 → PR3 → PR4 → PR5 处理。没有在 `main` 开发。
- PR5 只处理 Desktop 管理的 `vietnam_sku_parameter_map`、四个长期计算参数、必要的生成入口接线及验证。聊天本次临时覆盖另开后续 PR；当前 Skill 遇到用户明确指定“本次用某值”会说明暂不支持并停止，不忽略要求继续生成。
- 设计与实施计划分别在 `docs/superpowers/specs/2026-10-03-vietnam-pr5-desktop-design.md`、`docs/superpowers/plans/2026-10-03-vietnam-pr5-desktop.md`。接手前仍应核对这两份文件、仓库现行规范和最新 diff。

## 已实现内容与调用链

**映射表上传：** 工作台“模板与数据源”中的越南 SKU 槽 → Desktop Main 在打开原生 `.xlsx` 文件选择器前读取清单 revision → 内部 `lxeskill assets vietnam sku install` → Python 对普通 `.xlsx`、20 MiB 压缩大小、100 MiB 声明解压量、1000 个 ZIP 条目及完整价格做校验 → 源文件与暂存副本 SHA-256 核对 → 在跨进程锁下写入不可变版本并用同卷 `os.replace` 切换 manifest 指针。取消选择器返回空结果；渲染进程不提供本机源路径。相同内容再次上传保持原 revision，不覆盖 previous；revision 不匹配时拒绝并发覆盖。上传不调用雅仓。

**列表与回滚：** `lxeskill assets list` 通过同一受信清单一次取得 current、previous、revision 及具体完整性错误，Desktop 只对越南 SKU 槽展示上传和可用时的回滚。有效 previous 在 current 损坏时仍可展示并用于回滚；回滚在锁内核验版本并产生新 revision。手工放入旧式 `current/` 的文件没有受信清单时不作为 current，需重新从 Desktop 上传。历史 `vietnam_replenishment_template` 仅兼容展示，不参与生成，也没有上传入口。其他命令管理的资产槽继续沿用原规则。

**长期参数：** 设置 → ERP 账号 → 雅仓 → 越南备货的四项十进制文本 → Desktop IPC 和持久化校验 → `settings.json` schema 12 的独立 `vietnam_recommendation` 对象 → Desktop 进程环境注入完整四项 → Python 生成前再次校验 → PR3 五表工作簿。旧 schema 11 读取时迁移到默认值；schema 12 缺项或非法值报错。独立“保存越南参数”只提交工作区与四项，保留雅仓及其他未保存草稿；统一保存也携带四项，仅雅仓凭据实际变化时才提交 `yacang:save`。保存后的环境变更沿用现有 Gateway 刷新流程，在下一次生成生效。

**生成：** `skills/vietnam-stock-recommendation/SKILL.md` → 无参数 `lxeskill vietnam stock recommend` → 受信 current 的私有快照及完整性预检 → 四项环境配置解析 → 单轮雅仓来源导出 → PR3 生成器与项目 Office Kit 重算、校验 → 只交付最终五表 XLSX。缺映射表、坏映射表、部分或非法环境配置均在雅仓调用前失败；CLI 成功结果报告本轮 `config` 和可观测来源 `config_source`（`environment` 或 `default`），不把任意人工注入环境误称为 Desktop 已保存设置。

| 文件 | 本 PR 作用 |
| --- | --- |
| `python/lxeskill_cli/services/vietnam_replenishment/{numeric_contract,asset_contract,workbook,sku_map_store,workflow}.py` | 完整映射表与 Excel 精度校验、受控版本存储、可信私有快照和运行配置。 |
| `python/lxeskill_cli/shared/input_assets.py`、`python/lxeskill_cli/services/assets/{inspect,vietnam_sku_install,vietnam_sku_rollback}.py`、`python/lxeskill_cli/lxeskill/catalog.json` | 受信资产读取、列表与内部固定槽 CLI；catalog 是 Python/Bun 双端契约。 |
| `python/lxeskill_cli/services/agent_cli/vietnam_replenishment/generate.py`、`skills/vietnam-stock-recommendation/SKILL.md` | 结果值与来源，以及聊天临时覆盖未开放时的真实边界。 |
| `apps/desktop/src/main/config-store/{model,repository,setup,vietnam-recommendation}.ts` | schema 12 迁移、参数验证、保存与完整环境注入。 |
| `apps/desktop/src/main/{input-assets,vietnam-sku-map-actions,ipc,ipc-validation}.ts`、`apps/desktop/src/{main,ipc-channels,preload-bridge}.ts`、`packages/foundation/desktop-protocol/src/index.ts` | 原生选择器、固定槽操作、IPC/桥接及资产和设置类型。 |
| `apps/dashboard/src/desktop/settings-model.ts`、`apps/dashboard/src/desktop/shell.tsx`、`apps/dashboard/src/features/workbench/input-assets-view.tsx`、`apps/dashboard/src/shared/i18n.tsx`、`apps/dashboard/src/styles.css` | 四参数草稿与保存、资产上传/回滚状态、中英文界面与布局。 |
| `python/lxeskill_cli/tests/{vietnam_replenishment,lxeskill,infra}/`、`apps/desktop/test/`、`apps/dashboard/test/` | 合成工作簿、存储、双端契约、Desktop 与 Dashboard 定向回归。实际集成结果见下节。 |

## 环境与已验证结果

Desktop 每次向子进程同时注入下表四项；Python 只有四项**全部缺席**时使用系统默认值。部分缺失、空串、非有限值、负权重、非正汇率或不能精确写入 Excel 的值直接失败，不逐项回退。

| 环境变量 | 默认十进制值 | 含义 |
| --- | ---: | --- |
| `LXE_VIETNAM_WEIGHT_30D` | `0.8` | 30 天销量权重 |
| `LXE_VIETNAM_WEIGHT_15D` | `0.8` | 15 天销量权重 |
| `LXE_VIETNAM_WEIGHT_7D` | `0` | 7 天销量权重 |
| `LXE_VIETNAM_EXCHANGE_RATE` | `3900` | 工作簿汇率 |

雅仓登录仍由既有 `LXE_YACANG_MOBILE`、`LXE_YACANG_PASSWORD` 注入，数据根目录仍由 `LXE_DATA_ROOT` 决定；不在文档、日志或 Git 中记录这些值、凭据或业务价格表。Python 使用本 Pool 独立依赖环境，JS 使用 Bun；没有为 PR5 修改锁文件。已取得的定向结果如下，均使用合成数据或隔离数据根，未访问生产雅仓：

| 验证 | 实际结果 |
| --- | --- |
| Desktop 定向测试 | **114 passed** |
| Dashboard 定向测试 | **17 passed** |
| Desktop、Dashboard 与 Desktop 协议包 typecheck | **均通过** |
| Desktop 协议包测试 | **36 passed** |
| Python 越南备货与业务 CLI（含 Task 9 集成） | **185 passed, 0 skipped**；其中越南备货套件 177 项，使用项目 Office Kit 对非默认参数的最终五表实际重算 |
| Python catalog/CLI 与 infra 双端契约相关测试 | **396 passed, 2 skipped** |
| Bun catalog 契约测试 | **10 passed** |
| 内部 CLI 与 Desktop 资产服务实际调用 smoke | **上传、相同内容幂等、列表、回滚均跑通**；Desktop 服务还通过真实 Python CLI 完成幂等上传、回滚并读到切换后的 current 和 previous |
| 四参数与 Office Kit 聚焦测试（已包含在 177 项中） | **59 passed, 0 skipped** |

Task 9 的合成集成已实际跑通：内部适配器安装 A、替换 B、回滚到 A 后，假雅仓单轮来源经项目 Office Kit 生成并校验五表；主表仍使用 A 的成本与价格，`数据更改` 和主表引用列均为非默认四值 `0.7 / 0.6 / 0.1 / 4000`，CLI `files` 仅列最终 XLSX。`uv build --wheel --offline` 成功，wheel 已核对包含新增命令、版本存储、catalog 与五表骨架。`git diff --check` 已通过；变更及未跟踪文件的凭据样式字面量、未跟踪尾空白扫描未发现异常。仓库全量测试按规范留待最终 rebase/合并前运行一次。

## 已知边界、Git 状态与下一步

- Windows 是正式分发目标，但 Windows 文件占用、断电恢复、`os.replace` 行为和安装包内 Python 命令路由尚未现场验收。真实雅仓当前库存导出及最终五表与生产数据联调仍待现场完成；不能用本机合成测试声称完成这些验收。
- 当前代码的候选文件校验、清单与摘要用于应用正常入口的可靠性和意外改动检测；同一系统用户若直接改写清单及版本文件，不属于本 PR 能用文件权限隔离的对抗边界。历史旧目录没有自动导入路径。
- 本地提交从设计 `5bd72408` 起，依次为 Python 映射表存储 `46215b82`、Desktop 资产管理 `4e541114`、长期参数与工作流 `841e6375`；本页、设计补记和实施计划由第四笔文档提交收口。本次没有修改锁文件或无关模块，也没有 push、创建 PR 或 merge。以实际 `git status` 与 `git log` 确认最终本地状态。
- 下一步需按仓库批准门槛在当前分支同步最新 `main` 检查冲突，再分别申请 push、以 PR4 分支为 base 创建 PR、merge 的确认。PR5 收口后用本页在新任务接手聊天临时覆盖等后续模块。
