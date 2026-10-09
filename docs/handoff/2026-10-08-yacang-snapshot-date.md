# 雅仓库存动销日期列交付交接

## 分支、完成范围与入口

- 当前最终累计层：`codex/pr4-yacang-no-pr1`，pool-25，直接父层为 `codex/pr3-shangman-no-pr1` / `303cbc85`。main 基线 5f785341；只依赖 PR2/PR3，不包含 PR1。
- 原 `codex/yacang-snapshot-date` / pool-14 / `06301fff` 保持 clean。
- 库存动销交付副本去掉末列“创建日期”，原始 XLSX 留在同次运行 original/；当前库存与仓库产品逐字节原样交付，产品真实创建时间保留。
- 入口：yacang-export → lxeskill yacang export run → 既有 workflow 下载/校验 → delivery.publish_inventory_sales_without_snapshot_date → terminal.files → send_files。
- 只调整交付副本；created_date 筛选、仓库/报表选择、四仓多报表、九文件、部分成功、认证与 CLI schema 不变。
- 沿用 LXE_YACANG_MOBILE / LXE_YACANG_PASSWORD、LXE_DATA_ROOT、LXE_SQLITE_DB_PATH，无新增变量。

## 本层文件

- python/lxeskill_cli/services/yacang/{delivery,workflow}.py
- python/lxeskill_cli/tests/yacang/test_export.py：保留 main 原有 Python DB 路径测试，不移植 PR1 的路径/迁移修改。
- python/lxeskill_cli/lxeskill/catalog.json：仅 dataset 描述，command/schema 不变。
- skills/yacang-export/SKILL.md、skills/southeast-asia-replenishment-workflow-map/SKILL.md
- docs/harness/skill/{current_skill_catalog,yacang-export-validation}.md
- 本交接；原独立 PR4 acceptance 报告已合并。

共享 map/catalog 文档保留前两层国家边界。本层仅移植旧 PR4 的九文件增量；旧四层分支与提交保留为备份，PR1 的权限边界和 SQLite 迁移代码不进入本链。

## 实现与验证

- 修改 worksheet P 列及 dimension/row spans，不重建整本文件；DOM 保留命名空间，其他 ZIP 部件保持原字节，文件句柄关闭后原子发布，沿用长路径适配。
- 原新测试先失败后通过；覆盖四仓三类九文件、原件、共享字符串/命名空间、空表、部分成功 CLI files、中文长路径与异常不发布。
- 2026-10-09 pool-25 组合 Python：574 passed、2 skipped、4 既有 aiohttp warnings；覆盖 yacang、infra、lxeskill、mabang_tms、mabang Brazil export、shangman。使用本 worktree 自有 uv 环境及 fixture，无 PR1 的迁移测试。
- 组合 Bun：33 passed、0 failed、158 assertions、3 个实际测试文件（Skill discovery、CLI command、Desktop artifact opening）。不存在的 Gateway session-files 路径不计入执行证据。
- 补充真实 Runtime emitter 定向回归：4 passed、0 failed、10 assertions，覆盖流式回合、文件记录、交付失败与部分成功文件记录；只使用 mock provider/tool。
- pool-25 typecheck：8 工作区通过。启动时再运行正式 desktop:preview 构建，启动证据记录在仓库外交付资料。
- 先前临时原件验证：1108 数据行、15 列，其他单元格与 ZIP 部件不变、ZIP/openpyxl 通过。macOS Numbers 曾实际打开合成回归文件；真实业务数据未加入 Git。
- 上述 fixture/sandbox 未调用生产导出/login API，不使用真实凭据。

## 服务、实测与边界

- 本次测试服务准备从 pool-25 正式 desktop:preview 启动，包含 PR2/PR3/PR4。旧 pool-22 服务已不在运行，不以旧服务充当当前验收。
- 仅复用忽略目录内已有本机配置与上马持久认证；不复制旧 Bun DB、会话、任务、transcript、产物或 venv，不提交凭据。具体启动结果另记仓库外资料。
- 用户此前已确认旧组合服务测试通过，该结果不是新 no-PR1 链的实测证据。新链自然语言/真实平台交付待用户测试；请在新会话选择 Full access。本链不承诺 workspace-write 下获得 PR1 的托管状态写入适配。
- Runtime Step Loop、Cloud 权限、Gateway 调度、Shangman Credentials/AuthStore/GoodsExporter/生产门禁、TMS/巴西业务及 send_files 均未改。
- Windows-native ACL、Excel/WPS、安装包：NOT VERIFIED。真实 Git 父链/merge-tree：受控提交后验证，结果记录在仓库外交付资料。
- 日期字段不推断为商品上架时间；隐藏库存动销字段不改变真实筛选。

## Git 与下一步

2026-10-09 用户授权重建不依赖 PR1 的本地三层分支并启动组合测试服务。受控提交后检查 parent、增量范围、main ancestry、PR1 非祖先及 merge-tree。原分支/提交/远端记录不覆盖；本阶段不 push、不创建/修改/关闭线上 PR。

PR2 → PR3 → PR4 串行评审：TMS 与上马共同修改三个 Skill/测试文件，不能宣称是可任意顺序合并的独立 main 分支。各层在其声明父层上完整通过回归；前层合入后按当时 main 复核下一层，尤其注意 squash/rebase 合并导致的父链变化。最终 hash、范围、服务和未验证项记录在仓库外 no-PR1 交付资料。
