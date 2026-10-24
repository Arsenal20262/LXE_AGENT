# PR4：Amazon V1/V2统一入口与深圳AG交接

## Git、职责与当前契约

- 分支 `codex/amazon-replenishment-unification`，工作区 `/Users/hym/.codex/worktrees/1672/Amazon`；PR #117。
- 依赖链：PR1 `979c33e8` → PR2 `af0d7b8b` → PR3 `092b24cc` → PR4功能提交 `f973ed71` → main兼容合并 `b892ea8f`（第二父为`abde37dd`）→ 精简提交 `6d0e72ea`。本轮在这些提交后合入main e3274147，不重写历史或修改PR Base。
- b892ea8f时PR117对merge-base abde37dd为72文件、+7301/-399；PR4功能提交对PR3为29文件、+1352/-719。前者含上游累计功能，不能称PR4新增7301行。
- 一个完整主Skill `replenishment-workflow-map`，V1/V2独立计算、检查和交付；独立`replenishment-final-restock` Skill已删除，V2 CLI owner改为主Skill。
- V1保留原销量分析、参数方案、算法、筛选和多Sheet；V2继承PR1的14公式、PR2的35列单表和Office Kit。PR3提供自动取数集成；不计为PR4新建。
- 双版本复用同轮合格MSKU、深圳报告和三类货件；V1另需销量报告，V2不调用该步骤。单方失败不覆盖另一方结果，共享输入失败停止依赖版本。

## 输入、计算与交付

- V1：原`replenish calculate --store-name ... --unlinked-shipments-snapshot ... [--template ...]`；由原CLI查找／核验销量和库存输入。
- V2：`replenish final-restock generate`接受`store_name`及MSKU源表、深圳报告、未关联货件快照三路径，复用原来源指纹、批次、店铺、MSKU身份和覆盖核验。
- AG唯一读取深圳报告“真实库存（深圳仓库）数量”；普通及组合SKU沿用原报告结果，保留正数、真实0、有限负数，不回退uq122，也不要求该列存在或合法。
- **V2临时规则**：库存未知时AG留空、全部行和14公式保留，生成“库存待核对”文件，success=false/ok=false，暂停正式交付；诊断包含代表性MSKU、报告分类和可取得的原因。运营尚未批准未知库存正式交付，不设历史25行门槛，不影响V1。
- 35列、I/J、AH/AD/AI及空海运公式保留；没有新增AG扣减。旺季每轮默认关闭，只在明确要求时传裸`--peak-boost-enabled`；天数按本轮值／保存值／默认30，上限120。
- V2经Office Kit重算、结构／公式／Excel错误检查后才发布正式文件；失败不覆盖已有合格文件。各版本仅发送自身成功terminal.files，诊断附件不作正式成功，发送失败只重试该文件发送。

## 生产源码与V1对照证据

- 旧22路径审计清单中19个逐字节一致，另3项为Skill／doctor测试变化；“源码未变”“指引或测试变化”“业务结果一致”是三个不同结论。原清单：`/private/tmp/pr4-versioned-entry-audit.json`。
- 原V1算法、销量分析、库存算法与PR3相同；历史独立PR3固定样本对照11项通过，涵盖六场景业务结果、多Sheet和公式，不只是文件存在检查。
- V2仍调用PR1公式和现有Office适配，深圳读取器仅映射原报告，不计算第二套组合库存；目录会话作用域、计时和CLI薄适配有真实消费者。
- 本轮核查的生成器、957行工作簿测试、原库存模块及official_api未发现确定的可删生产实现，保持0修改。旧独立Skill和uq122专用生产依赖未恢复。

## 关键历史验证（不同范围有重叠，不累计）

| 对应版本／范围 | 实际证据 |
|---|---|
| PR4 f973ed71提交前六文件 | 114 passed、无skip，含跨Sheet重复MSKU拒绝、真实Office、35列／14公式、AG及两版失败隔离；日志`/private/tmp/pr4-final-local-commit-20261023-sakgkvvi/`。 |
| 独立Skill退役阶段CLI/infra | 562 passed、4 Windows skipped、4既有aiohttp warnings；原日志`/private/tmp/pr4-retire-v2-skill-20261023/`。 |
| b892ea8f main兼容 | 八工作区typecheck和TS边界通过；Bun120 pass；Python56 pass含实际Office；Chromium侧栏／Amazon两组通过；doctor49命令／38 Skill。日志`/private/tmp/pr4-main-compat-restart-8xxm9j8r/`。 |
| 当时Desktop重启 | 日志有gateway_ready、lxeskill_probe_ready、38 Skill/0诊断；仅进程／日志证据，不等于真实聊天交付。 |
| 原17场景模型回放（已退役） | 仅编译；启动缺API Key，0场景执行。日志`/private/tmp/pr4-final-review-model-replay.log`，NOT VERIFIED；不是当前验收入口。 |

## 2026-10-24集中收敛与提交收尾（历史6d0e72ea）

- 只调整原回放脚本、Runtime/Python测试和本目录5份handoff；生产Service、公式、CLI/catalog、Skill及锁文件不变。
- Runtime保留真实发现、加载、权限、命令索引及owner测试；移除3个仅匹配Skill文字／表格顺序的测试和重复段落。Python保留CLI实际参数、scope、来源／错误终态及双版本路径交接；3处静态政策检查合为1处稳定术语检查，不重复逐句匹配同一中文。
- handoff压缩已替代方案、逐轮Git操作和重复结果，保留各层职责、决定、带版本的关键证据及未验证范围。旧文档完整原文可用`git show b892ea8f:<原路径>`追溯，不改历史。
- 设置页补丁继续留在PR3基线的`codex/amazon-v2-settings-cleanup`／pool-11。复核已有10文件补丁并重跑测试，没有复制到PR4或改写pool-7草稿。
- 当时将17个模拟场景合并为16个并调整顺序／话术断言；具体场景与判定规则可用`git show 6d0e72ea:scripts/verify-replenishment-skill-behavior.ts`追溯。该独立运行器及全部模拟场景现已退役，不再作为执行入口或验收保障。
- 当时仅完成场景列举、编译和固定trace判定器检查；没有完成真实模型验收，也未验证生产Agent的版本选择、失败停止或最终状态语义。

## 精简阶段的历史验证（非本轮）

| 范围 | 结果与原始日志 |
|---|---|
| 当前PR4工作簿、深圳交付、双版本、A规则、V1计算／CLI及销量／CLI，8文件 | 143 passed、无skip，含真实Office Kit、无uq122源表、全行／公式、未知库存及单方失败；`/private/tmp/amazon-cleanup-business.log`。 |
| 修改后的Python Skill及工作簿CLI，2文件 | 44 passed、无skip；`/private/tmp/amazon-cleanup-cli.log`。 |
| Runtime发现与公开CLI归属，2文件 | 34 pass、0 fail、163 assertions；`/private/tmp/amazon-cleanup-runtime.log`。 |
| pool-11真实Chromium行为夹具 | 3组／17个内部场景通过，22 filtered；Amazon天数6、越南8、工作台3；`/private/tmp/amazon-cleanup-renderer.log`。首次因沙箱禁止Vite缓存写入失败，原命令提权重跑后通过。 |
| pool-11 Desktop设置／preload及IPC | 前3文件31 pass，独立IPC14 pass；真实私有Python验证旧布尔true/false兼容、天数持久化和损坏错误；`/private/tmp/amazon-cleanup-desktop.log`、`amazon-cleanup-ipc.log`。 |
| pool-11 Dashboard类型检查 | tsc生产及行为夹具通过；`/private/tmp/amazon-cleanup-typecheck.log`。 |
| 已退役运行器的历史离线检查 | 当时--list加载16场景、Bun编译及26项固定trace判定器检查通过，`/private/tmp/amazon-cleanup-offline.log`。不是模型回放或生产Agent验证；不再作为当前测试入口。 |

上轮收尾运行Python44项、Bun34项、当时的16场景列举／编译、26项固定trace及公开doctor/list/V2 describe，均通过；trace临时副本当时从脚本生成并核对run函数，未调用模型。日志`/private/tmp/amazon-final-close-*`；业务143项为该轮复用证据，不是本轮重跑。
公开doctor、list及主Skill scope下V2 describe均ok=true，doctor为49命令／38 Skill；日志`/private/tmp/amazon-cleanup-{doctor,list,describe-v2}.jsonl`。PR3设置9路径补丁对当前PR4的git apply --check通过，仅检查未应用。
测试从各工作区根使用自己的依赖运行，无安装或锁文件变动。PR4Office运行文件来自本工作区build/desktop-runtime；环境仅临时设置TMPDIR、UV_CACHE_DIR、PYTHONDONTWRITEBYTECODE、LXE_OFFICE_NODE/LXE_OFFICE_CLI。

## 历史风险、未验证范围与下一步

- **历史P2，当前PR4未修复**：store_resolver._read_store_html约415行把403/401同归认证失败，fetch_fba_stores约436行刷新后再试。注入403曾观察2次获取／1次刷新；429为1次／0刷新。复现`/private/tmp/pr4-readonly-final-20261023-1ti4de5d/auth-stop-reproduction.json`；原blob为ed3ceb3d，和PR3／main abde37dd一致。
- 403须立即停止，不能作为普通登录过期自动恢复；401正常恢复应保留。另在`codex/amazon-network-recovery`／pool-10处理，草稿未纳入PR4，不声明已发布修复。
- 真实Agent的模型决策／自由文本语义、当前Desktop完整聊天、生产ERP、外部附件发送／恢复、原生Windows及Microsoft Excel均NOT VERIFIED。Chromium夹具、历史固定trace、Office Kit和静态检查不替代这些验收。
- 运营仍待确认未知库存未来能否正式交付；当前核对失败规则继续生效。
- 本轮为CONDITIONAL PASS：离线定向通过，具备人工检查条件；PR3 UI补丁独立归位，Stack Base／main兼容及真实运行验收仍需按实际提审阶段处理。
- 上轮精简已通过6d0e72ea提交并Push：8文件+231/-1367、净减1136行，5份handoff压至253行，测试净减131行。该轮没有合并main；以下记录本轮追加授权的兼容合并。

## 2026-10-24 PR4合入main并解决renderer冲突

- 用户明确授权合入最新main、保留双方有效测试，验证后Commit／正常Push更新PR #117，不合并GitHub PR。起始HEAD为6d0e72ea，工作区干净；只读fetch固定main为e3274147246d0bd0deb2c01b5c32f34cfd023b38。
- main新增3个提交（自动化、Desktop MCP、导航等），152路径属于主线继承。唯一内容冲突为renderer.test.ts，合并后保留26套件并集：main navigation-rail 8、conversation-window 5、sidebar 10，以及PR4 Amazon设置6；共用runner／夹具的自动合并内容经复核保留。
- Python业务、CLI/catalog、公式与全部Skill对6d0e72ea的diff为零；没有移入PR3的1c43896d设置补丁或独立网络修复e379881e，不改V1/V2算法或AG规则。
- 按main锁文件执行bun install --frozen-lockfile，同步4个包；锁文件与main逐字节一致，没有自行升级依赖。
- 当时实际通过：八工作区typecheck、TS生产边界、14文件Bun142 pass／883 assertions；Python四文件53 pass无skip，含真实Office Kit、无uq122、未知库存待核对及双版本失败隔离。当时的16场景列举及编译通过，不执行真实模型；不是本轮重跑。日志`/private/tmp/pr4-renderer-main-{typecheck,boundary,bun,python}.log`及`pr4-renderer-main-scenarios.json`。
- Chromium整份renderer的26套件全部通过、104 assertions，覆盖导航8项、对话窗口5项、侧栏10项和Amazon6项等双方有效断言；日志`/private/tmp/pr4-renderer-main-chromium.log`。
- 默认cached diff检查对main继承的Windows source-hashes.json报告9行CRLF；原文件与main逐字节一致，保持原件。仅临时使用core.whitespace=blank-at-eol,blank-at-eof,space-before-tab,cr-at-eol识别Windows行尾后检查通过，不修改仓库配置或放过实际尾部空格。
- 其他工作区HEAD、暂存／未暂存diff和草稿指纹保存于`/private/tmp/pr4-renderer-main-merge-current-path`指向目录，提交前后复核；PR1～PR3及其他草稿保持，不改PR Base、不force push、不合并GitHub PR。
- 最终合并提交为3babfbf3，已正常Push。真实Agent模型行为／自由文本、生产ERP、用户Desktop完整链路、外部附件、原生Windows和Microsoft Excel继续NOT VERIFIED；历史403修复仅存在独立PR #122，不宣称本分支已包含。

## 独立AI回放运行器退役（准备阶段，起始HEAD 3babfbf3）

- 用户批准REMOVE；删除独立运行器及其16个模拟场景，不替换为新框架。仅同步Python测试注释、历史验收文档及本目录交接说明；生产Runtime、Provider、工具、messages/replay.ts、全部业务代码、Skill、catalog和原有测试断言不变，无新增环境变量或依赖。
- 保留CLI参数、来源／失败终态、Runtime工具与权限、V1多Sheet、V2的35列／14公式／深圳AG及Office测试。删除后不再提供旁路真实模型行为探测；普通测试不证明自然语言版本选择、失败后的行动或交付状态语义正确，须通过正式agentcli/Desktop验收。
- PR #117远端Head仍为3babfbf3，PR #120为cb8eadae，两者均open、Base为main e3274147；本轮不修改PR #120，不暂存／Commit／Push／Merge。
- 本地候选与PR #120均删除同一路径，历史全量MSKU验收文档采用PR #120的相同文本。后续提交推送此清理后，两PR按当前内容任一顺序合并均应保持脚本缺失、文档一致；提交前仍须核对双方Head。现有远端PR #117尚含旧脚本修改，不能把本地清理说成远端已更新；不得在同步main时恢复已退役文件。
- 本轮实际通过：Python四文件53 passed、无skip（Skill／工作簿CLI、真实Office Kit深圳库存交付、双版本）；Bun五文件57 pass／294 assertions（Skill发现、CLI归属、Provider及请求生命周期）；Runtime定向4 pass／29 assertions、123 filtered（工具闭合、交付错误、显式Skill加载及加载失败停止）；八工作区typecheck、TS生产边界通过。日志`/private/tmp/pr117-replay-retirement-{python,bun-recheck,runtime,typecheck,boundary}.log`。没有重跑完整Bun／Python或Chromium，也未运行任何真实模型／ERP／附件发送。
- 首轮Bun为56 pass／1 fail，失败在本地HTTP fixture的Bun.serve(port:0)监听阶段，错误EADDRINUSE；不改源码或断言、同组测试在沙箱外重跑57项全部通过。首轮失败日志`/private/tmp/pr117-replay-retirement-bun.log`保留，不将其计作通过。
- 扫描1640个存续UTF-8文件（另80个二进制跳过）：有效运行器引用为0，仅本文件保留1处git show历史追溯；Python测试AST与当时HEAD一致，所有原断言保留。当时PR #120仅改2路径，共用文档blob与本地同为1c7f42fc0bd1a9de6a4b5147a9dfd848c71f7358；基于main e3274147的内存逐路径三方对照，两种顺序均无内容冲突且结果一致、脚本缺失。未执行真实Git merge，也未创建提交或修改索引。
- 准备阶段diff检查通过，修改范围仅1个脚本删除、1个Python测试注释和3份文档；现有业务与真实Agent验收边界不变。随后用户授权以下四行断言清理及Commit／Push收尾。

## 退役补丁与四行重复断言提交收尾

- 起始HEAD仍为3babfbf3，当前分支为codex/amazon-replenishment-unification。用户授权本轮精确暂存、Commit及正常Push到PR #117，不修改PR #120、不混入PR3设置页补丁、不合并PR。
- 工作簿测试仅删除原302／303／533／534行四条重复断言，28个测试函数与参数化定义保留；删除这四个AST节点后与原文件完全一致。其他测试仅包含准备阶段的一处注释更新，不新增／删除用例，不改变生产代码或公式。
- 本轮实际通过：Python五文件99 passed、无skip，包含完整工作簿回归、CLI、真实Office Kit深圳交付及双版本；Bun五文件57 pass／294 assertions；Runtime定向4 pass／29 assertions、123 filtered；八工作区typecheck与TS生产边界通过。日志`/private/tmp/pr117-retire-close-{python,bun,runtime,typecheck,boundary}.log`。未运行真实模型／ERP／外部附件或完整原生Desktop／Windows／Microsoft Excel验收，不把历史验证算本轮重跑。
- PR #117远端起始Head为3babfbf3；PR #120已独立前进至70a372dd，增加三个Runtime测试文件的清理，本轮不取入这些改动。共享历史文档仍逐字节相同、脚本均删除；共同修改的skills.test.ts使用原base与双方内容做git merge-file -p双向对照，退出码均0、结果相同，保留Amazon断言及PR #120删除。其余两份Runtime测试在本分支相对base未改，按当前快照不产生内容冲突；未实际执行merge。
- 本轮提交只含退役准备的五路径及工作簿测试，共六路径；暂存前后检查diff、敏感信息、残留入口和Git状态，提交／Push结果以追加提交及PR Head复核为准。PR1～PR3、PR Base及其他工作区保持，不force push。

## 2026-10-24 PR4设置页最小适配（第一阶段）

- 用户授权在PR4直接复用已有设置页补丁，起始HEAD为57d4c7c4；本轮不处理PR3冲突、不修改其他工作区，不暂存／Commit／Push／Merge。
- 从已归位PR3的1c43896d逐路径复用9项源码／测试补丁，先通过应用检查再适配；没有合并PR3分支，也没有带入pool-11后续4cf6796e的命名、路由或IPC改名。
- Amazon页面移除旺季checkbox及启用操作，只编辑天数，保留空值／0及0～120整数校验、保存、重载和实际失败信息。沿用原设置契约，保存天数时保留读取到的旧peak_boost_enabled；历史true／false仍可读取。本轮明确启用才加成，生成器默认关闭规则不变。
- 复用WorkbenchPageHeader；共享输入框、卡片及保存区样式放入既有detail-theme.css的workbench-settings-*类。Amazon独有布局保留在新增两行CSS中；越南页面只补公共class并迁移相应样式，业务字段、事件与参数不变，Amazon不再引用越南CSS或类名。
- 修改9项：Amazon页面及独有CSS、detail-theme.css、越南页面及CSS、i18n、Amazon行为测试、renderer夹具、Desktop设置测试；另更新本handoff。保留原无弹窗断言，未新增框架、Service或依赖；Python业务／公式、CLI/catalog、Skill、Runtime、Desktop IPC和锁文件均未改。
- 先红：首轮被本机监听限制阻断；相同命令允许监听后，真实Chromium在“checkbox数量1而非0”处失败，确实命中原问题。修复后3组通过、23 filtered，覆盖Amazon6、越南8、工作台3，共17个内部场景；包括天数持久化／错误／空值与0、公共页头及越南选择器隔离。日志/private/tmp/pr117-settings-minimal/renderer-{red,red-local,green}.log。
- 本轮Desktop四文件45 pass／201 assertions，包含真实私有Python读写旧true／false、重启持久化、损坏设置及IPC／preload边界；Python85 passed、无skip，覆盖设置、生成CLI、请求开关优先级／默认关闭、生成时参数快照、V1计算CLI及统一Skill契约。日志同目录desktop.log和python.log；各组独立计数，不与历史重叠组累计。
- Dashboard生产及行为夹具typecheck、Desktop typecheck通过，日志同目录types-{dashboard,desktop}.log。其他12个worktree的HEAD、状态和暂存／未暂存diff指纹与本轮保护快照一致，包含PR3原11项草稿；快照为同目录protected-worktrees.json。
- 本轮没有重新执行Office重算或全量业务测试，没有重启／部署用户Desktop、访问生产ERP、调用真实模型或发送附件；原生Windows／Microsoft Excel与完整桌面聊天仍NOT VERIFIED。已有业务回归证据见上方，不作为本轮重跑；后续提交需另获授权。

## 2026-10-24 PR4设置页命名与本地提交收口

- 起始HEAD为57d4c7c4，分支codex/amazon-replenishment-unification。用户已授权将第一阶段10文件有效修改及本次命名收敛一并本地Commit；不Push、Merge、Rebase或修改PR Base，实际提交SHA以Git记录和收口报告为准。
- 只读参考pool-11的4cf6796e，在PR4当前文件逐项修改名称，不复制旧文件或cherry-pick旧分支。页面／CSS／行为测试及Desktop Service／测试改名为amazon-v2-settings；组件、配置类型、preload方法及IPC对应统一为AmazonV2Settings，导航与中英文标题同步。旧页面路径通过现有规则回到工作台索引，无兼容包装。
- 前次天数读取／校验／保存／重载、旧布尔兼容、无checkbox、公共页头及CSS隔离完整保留；main的automations导航、navigation-rail场景和sidebar:10断言保持。改名后仍调用replenish final-restock settings，参数继续存放在amazon-final-restock目录；generate命令、Python模块、CLI/catalog、主Skill、V1/V2算法、深圳AG及Office能力未改。
- 本轮新执行：导航回归先红3 pass／1 fail（新路径原先回退index）；改名后Desktop设置／preload／IPC及导航五文件49 pass／224 assertions。包含真实私有Python对旧true／false配置读取、仅改天数、重启持久化及损坏错误；preload验证新IPC通道和原参数交接。
- 真实Chromium四组4 pass／22 filtered：Amazon6、越南8、工作台3、navigation-rail8，共25个内部场景。八工作区typecheck通过；Dashboard构建通过（存在大于500kB的chunk提示，本轮未扩展拆包），Desktop通过既有buildDesktop入口构建到临时目录，未重启用户服务。
- 本轮新执行两条CLI describe查询，generate仍为business且owner为replenishment-workflow-map，settings仍为internal。Python85项及上方真实Office／双版本回归为未变业务源码的复用证据，本轮未重复执行，不当作真实模型或生产Agent验收。
- 本轮日志在/private/tmp/pr117-settings-final/：renderer.log、desktop-navigation.log、typecheck.log、dashboard-build.log、desktop-build.log、describe-{settings,generate}.json；原10文件补丁备份在initial.patch／initial-files/。其他12个worktree按protected-worktrees.json核对HEAD、状态及暂存／未暂存指纹，PR3和pool-11保持原样。
- 收口检查仅暂存本任务设置页、命名、关联测试及本handoff；排除构建产物、临时日志、私密信息和其他草稿。真实模型、完整原生Desktop聊天、生产ERP、外部附件、Windows及Microsoft Excel仍NOT VERIFIED；本地提交后仍需人工审核及另行Push授权。
