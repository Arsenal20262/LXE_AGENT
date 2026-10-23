# Amazon V2 Desktop设置页：PR3遗留收敛（2026-10-24）

## 工作区与归属

- 独立分支：`codex/amazon-v2-settings-cleanup`；项目脚本领取`.worktrees/pool-11`，基线为PR3 `092b24cc891ced31da165ee49836157b2ec93d10`，独立frozen Bun/uv环境。
- 问题源于PR3：`ee593539`增加持久开关，`f01118f9`增加天数，`d3e147c6`改成本轮明确启用后仍留着旧开关。本补丁不归为PR4新增功能。
- 只读核实PR #103仍open、未合并，HEAD仍为`092b24cc`。GitHub同时报告`mergeable=false`；本轮没有检查或处理它相对main的合并问题。
- PR4保持`b892ea8f`且干净；PR3 pool-7已有11项草稿、网络修复pool-10已有14项修改，状态和文件指纹均保持原样。

## 最小改动

1. Amazon设置页移除checkbox、checked/onChange及save(boolean)操作，保留天数读取、0～120整数/空值校验、保存、失败草稿和重载。复用`WorkbenchPageHeader`，沿原路由和Desktop IPC调用。
2. 旧`peak_boost_enabled`仍属于既有两字段读写契约及旧配置兼容；保存天数时透传读取到的历史值。页面不展示或编辑该值，旺季启用仍由本轮命令决定，默认关闭。
3. 两页共用的输入框、保存区和卡片规则放到既有`detail-theme.css`，使用`workbench-settings-*`类名。越南组件只补6处class，字段、处理器和参数不变。越南CSS删除全部Amazon规则；Amazon独有的两行天数布局移到自己的CSS。
4. 清理两种语言中无效开关文案；更新原有6个Amazon页面场景、真实Desktop/Python旧配置测试，未增加Service、表单框架或新的业务入口。

调用链仍为：工作台页面 → 原preload/受信任IPC → `DesktopAmazonFinalRestockSettingsService` → `lxeskill replenish final-restock settings --action read|save` → 原Python存储。Python业务/公式、生成器、CLI/catalog、Skill、Runtime及锁文件均未修改。

修改文件共10个：Amazon页面、现有公共CSS、越南页面class、越南CSS、i18n；新增2行Amazon CSS；原Amazon行为测试、renderer夹具、Desktop设置测试；新增本交接记录。未修改其他工作台页面。

## 实际验证

| 检查 | 结果与边界 |
|---|---|
| 修改前Chromium回归 | 1 fail：页面仍有1个checkbox，预期0；没有伪造绿色基线。 |
| 最终Chromium回归 | 3 pass、22 filtered：Amazon 6、越南8、既有工作台3，共17个内部场景。验证公共页头、无开关、天数读写/错误/空值与0，以及注入越南选择器不影响Amazon、越南7字段和窄屏原场景保留。 |
| Desktop/Bun | 4文件45 pass、0 fail、201 assertions，含Amazon/越南设置、preload及IPC；真实私有Python进程分别读取旧布尔true/false，读取不改写旧文件、仅改天数保持旧位、重启持久化及损坏报错。 |
| Python | 7文件154 pass、137 deselected、0 fail、无skip。覆盖原设置/内部CLI、公开生成命令、14公式契约、本轮启用覆盖历史偏好、默认关闭、V1原计算及CLI。137个Office/LibreOffice求值场景主动排除，本轮未重跑。 |
| TypeScript | `bun run --cwd apps/dashboard typecheck`通过，含生产界面和行为夹具。 |
| Git与兼容 | `git diff --check`通过；9个源码/测试路径补丁对PR3 pool-7和PR4均`git apply --check`通过，只检查、未应用。三处受保护工作区状态/HEAD/指纹不变，暂存为空。 |

测试从pool-11根执行；`UV_CACHE_DIR=/private/tmp/codex-uv-cache`、`PYTHONDONTWRITEBYTECODE=1`、`TMPDIR=/private/tmp`。完整命令及原始结果在`/private/tmp/amazon-v2-settings-cleanup-20261023/`（任务开始日期为10月23日）：`renderer-red.log`、`renderer-green.log`、`renderer-final.log`、`desktop-final.log`、`python-final.log`、`typecheck.log`、`protected-workspaces.json`及`settings-code.patch`。

## 限制与下一步

- 未部署或重启用户Desktop；生产ERP、真实聊天/模型、Windows及附件发送均NOT VERIFIED。页面回归使用真实Chromium与模拟Desktop边界，不能称为真实完整备货验收。
- PR3基线仍保留自己的旧AG来源和Skill归属；本补丁没有移植或回退PR4的深圳AG修复及统一Skill。PR4当前代码保持原样，算法及Excel规则不属于本补丁改动。
- 建议作为PR3自身的fix补丁归回尚未合并的PR #103，无需为这三处收敛单独新增补丁PR。实际应用时须保留pool-7草稿，后续对PR4按现有Stack规则做受影响回归；干净应用检查不等于完成主线合并验证。
- 所有改动留在独立分支，未暂存、Commit、Push、Merge或创建PR；没有改写提交历史。

## 2026-10-24集中整改复核（补丁继续独立保留）

- 本轮读取并复用已有9个源码／测试路径，不重新实现或复制到PR4；只补充本交接。HEAD仍092b24cc，10个草稿路径均未暂存／提交。
- 真实Chromium3组通过（Amazon6、越南8、工作台3，共17内部场景）；首次Vite缓存写入被沙箱拒绝，原命令提权重跑成功。日志`/private/tmp/amazon-cleanup-renderer.log`。
- Desktop设置／preload3文件31 pass，另IPC验证14 pass；Dashboard生产／行为夹具tsc通过。日志`/private/tmp/amazon-cleanup-desktop.log`、`amazon-cleanup-ipc.log`、`amazon-cleanup-typecheck.log`。
- 同一PR4当前源码的业务143项、Skill/CLI44项及Runtime34项通过，包含真实Office、旺季默认关闭／本轮启用、35列／14公式和深圳AG；这是PR4回归，不将PR3旧AG误写成已修改。
- 现有9路径补丁对当前PR4再次git apply --check通过，仅兼容检查，未应用。补丁应独立归位PR3，pool-7有效草稿保留；没有修改PR Base或Git历史。
- 本轮未安装依赖、调用模型API／ERP或发送附件；真实模型、Desktop完整聊天和Windows继续NOT VERIFIED。所有实际命令从对应工作区根运行，静态／模拟边界不替代生产验收。

## 本轮独立提交与归位PR3（2026-10-24）

- 用户已明确授权检查、Commit、Push，并将该补丁归位PR3。pool-11仍基于092b24cc；PR3远端Head核实亦为092b24cc。10路径补丁与pool-7原11项草稿无路径交集，采用独立fix提交归位，保留草稿字节和PR4的6d0e72ea不动。
- 本轮新执行：Chromium3组／17内部场景通过；Desktop设置、preload、IPC4文件45 pass／201 assertions；Dashboard生产及行为夹具tsc通过。日志`/private/tmp/amazon-publish-settings-{renderer,desktop,typecheck}.log`。
- 本checkout独立Python7文件154 passed、137 deselected，无skip；仅明确排除Office/LibreOffice求值，不把它写成真实Office验收。覆盖天数／旧配置、生成参数、默认关闭／本轮启用、公式契约、V1计算及CLI。日志`/private/tmp/amazon-publish-settings-python.log`。
- 补丁不修改任何Python业务、CLI/catalog、Skill、Runtime生产代码或锁文件。PR3原旧AG及旧Skill状态不在本补丁范围；PR4已有深圳AG及统一入口不回退。
- 提交后通过精确cherry-pick归位PR3、重跑必要回归并正常Push现有PR #103；实际提交SHA、远端状态及原草稿保护检查以最终报告为准。不新建设置页PR，不修改PR Base、不Merge main、不force push。
- 真实模型、用户Desktop全链、生产ERP、外部附件、Windows和Microsoft Excel继续NOT VERIFIED。原历史段的“未授权／未提交”只描述当时阶段，由本轮追加授权替代。
