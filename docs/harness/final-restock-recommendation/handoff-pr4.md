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
| 原17场景模型回放 | 仅编译；启动缺API Key，0场景执行。日志`/private/tmp/pr4-final-review-model-replay.log`，NOT VERIFIED。 |

## 2026-10-24集中收敛与提交收尾

- 只调整原回放脚本、Runtime/Python测试和本目录5份handoff；生产Service、公式、CLI/catalog、Skill及锁文件不变。
- Runtime保留真实发现、加载、权限、命令索引及owner测试；移除3个仅匹配Skill文字／表格顺序的测试和重复段落。Python保留CLI实际参数、scope、来源／错误终态及双版本路径交接；3处静态政策检查合为1处稳定术语检查，不重复逐句匹配同一中文。
- handoff压缩已替代方案、逐轮Git操作和重复结果，保留各层职责、决定、带版本的关键证据及未验证范围。旧文档完整原文可用`git show b892ea8f:<原路径>`追溯，不改历史。
- 设置页补丁继续留在PR3基线的`codex/amazon-v2-settings-cleanup`／pool-11。复核已有10文件补丁并重跑测试，没有复制到PR4或改写pool-7草稿。
- 本轮合并full_both成功路径到clarify_once；明确双版本请求仍由reuse_both及两类单方失败覆盖。17个场景保留16，合并1，独立删除0；9类场景修正非必要顺序／话术断言，其余7类目标保留。

| 原场景 | 分类 | 保留／调整原因 |
|---|---|---|
| full_v1 | D保留修正 | V1选路；不强制销量与库存的非必要相对顺序。 |
| full_v2 | D保留修正 | V2独立选路，不获取V1销量报告。 |
| full_both | B合并 | 完整双版本成功计算／发送已由clarify_once覆盖；明确双版本还由reuse_both覆盖。 |
| reuse_both | A保留 | 已有合格输入时只补销量，不重取共享数据。 |
| clarify_once | D保留修正 | 一次澄清后完整双版本；不要求问题固定措辞或一定列第三个选项。 |
| context_v2 | D保留修正 | 根据上下文沿用版本，与明确V2输入不同。 |
| v1_sales_failed_v2_continues | D保留修正 | V1失败后V2继续；不按固定中文判最终状态。 |
| v2_unknown_v1_succeeds | D保留修正 | V2待核对不正式发送，V1仍成功。 |
| shared_source_failed | D保留修正 | 共享失败两版停止，禁止后续业务执行。 |
| shared_inventory_source_mismatch | D保留修正 | ok=true但来源不匹配也停止；不同于网络失败。 |
| shipments_failed | D保留修正 | 未完成快照不能当确认空快照；保留原main保障。 |
| single_sales | A保留 | 单步销量不扩为完整备货。 |
| ambiguous_store | A保留 | 实际候选歧义需要等待用户。 |
| auth_failed | A保留 | 自动恢复终态失败后不再认证／重试。 |
| auth_false | A保留 | 权限拒绝立即停止，保留原main独立安全样本。 |
| locked | A保留 | 原V1文件占用失败不发送。 |
| send_retry | A保留 | 只重发同一成功文件，不重复计算／取数。 |

回放仍使用同一Provider和工具循环。自动断言检查必要依赖、版本、文件和失败停止，不限制Skill阅读及公开查询次数。
保留MSKU先于报告、深圳来源核验先于货件、输入成功先于计算和发送等契约。最终自由文本状态需人工复核，失败场景输出status_text_review_required=true，不用关键词正则冒充语义验收。
新增`--list`在读取stdin／创建Provider前退出，用于无凭据离线列出场景；没有新增模型框架或调用付费API。

## 本轮实际验证

| 范围 | 结果与原始日志 |
|---|---|
| 当前PR4工作簿、深圳交付、双版本、A规则、V1计算／CLI及销量／CLI，8文件 | 143 passed、无skip，含真实Office Kit、无uq122源表、全行／公式、未知库存及单方失败；`/private/tmp/amazon-cleanup-business.log`。 |
| 修改后的Python Skill及工作簿CLI，2文件 | 44 passed、无skip；`/private/tmp/amazon-cleanup-cli.log`。 |
| Runtime发现与公开CLI归属，2文件 | 34 pass、0 fail、163 assertions；`/private/tmp/amazon-cleanup-runtime.log`。 |
| pool-11真实Chromium行为夹具 | 3组／17个内部场景通过，22 filtered；Amazon天数6、越南8、工作台3；`/private/tmp/amazon-cleanup-renderer.log`。首次因沙箱禁止Vite缓存写入失败，原命令提权重跑后通过。 |
| pool-11 Desktop设置／preload及IPC | 前3文件31 pass，独立IPC14 pass；真实私有Python验证旧布尔true/false兼容、天数持久化和损坏错误；`/private/tmp/amazon-cleanup-desktop.log`、`amazon-cleanup-ipc.log`。 |
| pool-11 Dashboard类型检查 | tsc生产及行为夹具通过；`/private/tmp/amazon-cleanup-typecheck.log`。 |
| 原模型回放脚本离线检查 | --list加载16场景；Bun编译通过；临时固定trace调用同一run循环26项通过（16场景、2种合法替代顺序、1种英文状态说明、7项错误trace拒绝），`/private/tmp/amazon-cleanup-offline.log`。不是模型回放，无API调用。 |

最终收尾重新运行Python44项、Bun34项、16场景列举／编译、26项固定trace及公开doctor/list/V2 describe，均通过；trace临时副本重新从当前脚本生成并逐字核对run函数，未调用模型。日志`/private/tmp/amazon-final-close-*`；业务143项复用上轮同源码／同测试证据，不冒称本轮重跑。
公开doctor、list及主Skill scope下V2 describe均ok=true，doctor为49命令／38 Skill；日志`/private/tmp/amazon-cleanup-{doctor,list,describe-v2}.jsonl`。PR3设置9路径补丁对当前PR4的git apply --check通过，仅检查未应用。
测试从各工作区根使用自己的依赖运行，无安装或锁文件变动。PR4Office运行文件来自本工作区build/desktop-runtime；环境仅临时设置TMPDIR、UV_CACHE_DIR、PYTHONDONTWRITEBYTECODE、LXE_OFFICE_NODE/LXE_OFFICE_CLI。

## 历史风险、未验证范围与下一步

- **历史P2，当前PR4未修复**：store_resolver._read_store_html约415行把403/401同归认证失败，fetch_fba_stores约436行刷新后再试。注入403曾观察2次获取／1次刷新；429为1次／0刷新。复现`/private/tmp/pr4-readonly-final-20261023-1ti4de5d/auth-stop-reproduction.json`；原blob为ed3ceb3d，和PR3／main abde37dd一致。
- 403须立即停止，不能作为普通登录过期自动恢复；401正常恢复应保留。另在`codex/amazon-network-recovery`／pool-10处理，草稿未纳入PR4，不声明已发布修复。
- 真实模型16场景、自由文本语义、当前Desktop完整聊天、生产ERP、外部附件发送／恢复、原生Windows及Microsoft Excel均NOT VERIFIED。Chromium夹具、固定trace、Office Kit和静态检查不替代这些验收。
- 运营仍待确认未知库存未来能否正式交付；当前核对失败规则继续生效。
- 本轮为CONDITIONAL PASS：离线定向通过，具备人工检查条件；PR3 UI补丁独立归位，Stack Base／main兼容及真实运行验收仍需按实际提审阶段处理。
- 上轮精简已通过6d0e72ea提交并Push：8文件+231/-1367、净减1136行，5份handoff压至253行，测试净减131行。该轮没有合并main；以下记录本轮追加授权的兼容合并。

## 2026-10-24 PR4合入main并解决renderer冲突

- 用户明确授权合入最新main、保留双方有效测试，验证后Commit／正常Push更新PR #117，不合并GitHub PR。起始HEAD为6d0e72ea，工作区干净；只读fetch固定main为e3274147246d0bd0deb2c01b5c32f34cfd023b38。
- main新增3个提交（自动化、Desktop MCP、导航等），152路径属于主线继承。唯一内容冲突为renderer.test.ts，合并后保留26套件并集：main navigation-rail 8、conversation-window 5、sidebar 10，以及PR4 Amazon设置6；共用runner／夹具的自动合并内容经复核保留。
- Python业务、CLI/catalog、公式与全部Skill对6d0e72ea的diff为零；没有移入PR3的1c43896d设置补丁或独立网络修复e379881e，不改V1/V2算法或AG规则。
- 按main锁文件执行bun install --frozen-lockfile，同步4个包；锁文件与main逐字节一致，没有自行升级依赖。
- 实际通过：八工作区typecheck、TS生产边界、14文件Bun142 pass／883 assertions；Python四文件53 pass无skip，含真实Office Kit、无uq122、未知库存待核对及双版本失败隔离。16场景--list及编译通过，不执行真实模型。日志`/private/tmp/pr4-renderer-main-{typecheck,boundary,bun,python}.log`及`pr4-renderer-main-scenarios.json`。
- Chromium整份renderer的26套件全部通过、104 assertions，覆盖导航8项、对话窗口5项、侧栏10项和Amazon6项等双方有效断言；日志`/private/tmp/pr4-renderer-main-chromium.log`。
- 默认cached diff检查对main继承的Windows source-hashes.json报告9行CRLF；原文件与main逐字节一致，保持原件。仅临时使用core.whitespace=blank-at-eol,blank-at-eof,space-before-tab,cr-at-eol识别Windows行尾后检查通过，不修改仓库配置或放过实际尾部空格。
- 其他工作区HEAD、暂存／未暂存diff和草稿指纹保存于`/private/tmp/pr4-renderer-main-merge-current-path`指向目录，提交前后复核；PR1～PR3及其他草稿保持，不改PR Base、不force push、不合并GitHub PR。
- 最终合并提交SHA／Push状态以Git、远端PR Head及本轮报告为准。真实模型16场景／自由文本、生产ERP、用户Desktop完整链路、外部附件、原生Windows和Microsoft Excel继续NOT VERIFIED；历史403修复仅存在独立PR #122，不宣称本分支已包含。
