# PR4：Amazon V1/V2 统一入口与 V2 AG 深圳库存修复

## 最新业务决定与 Git 边界

- **一个 Amazon 完整编排 Skill、两种计算版本、分别生成与交付。** V1原普通备货和V2最终备货建议均保留，V1算法和多Sheet产物不被V2替换。此决定替代之前的单算法统一方案和双完整入口方案。
- 主入口：`replenishment-workflow-map`。独立 `replenishment-final-restock` Skill已完整退役，V2生成说明和命令归属均并入主Skill；`replenish final-restock generate` CLI及底层计算能力继续保留。
- Worktree：`/Users/hym/.codex/worktrees/1672/Amazon`；分支：`codex/amazon-replenishment-unification`；PR3功能基线：`092b24cc891ced31da165ee49836157b2ec93d10`；PR4功能提交：`f973ed71ea07a0917d3a9ff60c9d6934aa1c3bdb`。后续main兼容合并及重启见文末。
- 版本化调整前15项修改已保护至 `/private/tmp/pr4-before-versioned-entry-20261023`，含原diff、状态及文件压缩包；更早32项修改快照仍在 `/private/tmp/pr4-before-dual-flow-20261023`。没有整体reset/checkout/restore、stash或其他Git写操作。
- PR4累计增量已按用户授权形成上述本地功能Commit；本轮追加授权将远端main合入当前PR4，并确认唯一测试冲突的最小处理方案，合并结果以本分支 `git log -1` 及收口汇报为准。本轮未获Push或创建PR授权；PR1～PR3历史及其他worktree不变。未调用生产ERP或执行真实外部附件发送。

## 主入口与版本契约

| 请求 | 主入口行为 |
|---|---|
| V1 / 普通备货 | 原流程与参数方案，必要销量分析后调用 `replenish calculate`，交付原多Sheet报表 |
| V2 / 最终备货建议 | 不执行V1销量分析，调用 `replenish final-restock generate`，Office Kit检查后交付35列单表 `mskulist` |
| 版本含糊 | 结合本轮上下文；仍不明只问一次V1/V2/两种都要，并等待明确回答；明确版本不重复确认 |
| 两种都要 | 共享同轮已核验MSKU、深圳报告、货件快照，各取一次；V1销量报告单独生成，两个计算各自调用并分别判定/交付 |

主Skill按用途、输入、依赖、执行、结果五节组织。新一轮采集本轮数据；当前任务已有合格同轮数据优先复用，仅补齐缺失或不兼容输入。V1原顺序保留：解析→MSKU→销量分析→深圳→三类货件→V1计算。V2省去销量步骤。两种都要时V1销量失败只记录V1失败，继续V2所需的共享步骤。

V1沿用原按店铺选择本地销量/库存报告的接口，主入口核对销量返回的 `source_xlsx_path` / `source_data_time` 对应本轮MSKU；计算返回的 `sales_analysis_xlsx_path` / `actual_inventory_xlsx_path` / `source_data_time` 对应本轮两报告。MSKU导出DTO没有虚构的 `source_data_time` 字段，主Skill由后续同源报告交叉核对源时间。V2显式传MSKU、深圳报告及货件三路径，由主Skill直接调用其V2生成命令；参数使用公开 `lxeskill list/describe`，两个货件参数继续分别为V1 `--unlinked-shipments-snapshot`、V2 `--unlinked-shipments-snapshot-path`。

V1无可计算记录、销量失败或自动选中的报告不是本轮，只影响V1；V2库存未知或计算失败不影响符合自身契约的V1。共同数据/认证/来源失败则停止依赖该输入的版本。各版仅在自身成功且文件实际发送成功后标记交付；不把一版成功称为两版成功，交付失败只重试该版发送。

## 计算与 AG 保护

- 原22文件审计清单重新核对后，当前 **19个文件与PR3逐字节一致**，包括V1算法、销量Service/adapter、深圳算法、三货件、来源核验、原参数、PR1公式、V2设置、原报表references及锁文件。另3个已有必要调整：`skills/replenishment-algorithm-config-manage/SKILL.md` 和 `skills/replenishment-amazon-restock-inventory-snapshot/SKILL.md` 收敛V1职责说明；`python/lxeskill_cli/tests/lxeskill/test_lxeskill_cli.py` 更新独立V2 Skill退役后的doctor计数。
- 以上是文件字节对照，Skill/测试变化不代表业务算法变化。V1业务源码保持；另有独立执行PR3和当前实现的6场景、4个Sheet业务结果及单元格值/公式/缓存/格式一致证据，见文末已有V1对照记录。PR1公式、PR2工作簿、PR3取数/认证/交付为继承能力，PR4新增范围是统一主Skill、V2 AG来源整改及其必要契约与测试。
- 独立Skill退役仅调整既有catalog命令owner；V2工作簿、MSKU Service及CLI adapter继续保留此前AG修复，没有新增生产Service、ERP请求、缓存或Runtime关键词路由；Runtime/apps生产实现零diff。
- 相对PR3，catalog移除了仅为V2 AG `uq122`服务的 `include_local_inventory` 参数，并将V2生成命令owner从已退役Skill移至唯一主Skill；V1/V2计算命令参数、产物声明及独立销量命令保持不变。
- 审计清单：`/private/tmp/pr4-versioned-entry-audit.json`。

V2 AG读取原深圳报告 `真实库存（深圳仓库）数量`，普通商品复用原匹配、组合商品复用原组件配比及可拼数量；最终生成阶段只读报告，不重算库存或联网。正数、真实0、有限负数和合法数字文本保留。来源指纹、批次、店铺、MSKU身份及覆盖、重复、结构和数值校验保留；AH报告非空优先，否则回退源表。

**仅V2**在深圳数量未知或合法占位时，AG留空，保留全部MSKU及14公式，生成 `-库存待核对.xlsx`，返回 `success=false` / terminal `ok=false`，不作正式建议交付；返回代表MSKU、类别及可取得的原因。此临时规则仍待运营未来政策确认，不套用V1，也不以历史25条为数量门槛。源表uq122不再是AG来源、必需列或数值校验条件。

35列、14公式、I/J、AH/AD/AI、每轮旺季默认关闭/本轮显式启用/保存天数及120上限保持；空海运公式没有新增AG扣减。

## 文件增量与调用链

| 范围 | 文件及职责 |
|---|---|
| 4个源码/契约文件（本轮保留原AG修复） | `services/mabang/amazon/fba/final_restock_workbook.py`、`store_msku.py`、`services/agent_cli/mabang/download_store_msku_excel.py`、`lxeskill/catalog.json` |
| Amazon备货Skill | `replenishment-workflow-map`统一编排并拥有V2命令；`replenishment-calculate`继续负责V1计算；resolve/MSKU/深圳/货件/sales及V1辅助Skill保留原职责；`replenishment-final-restock`已退役 |
| 契约及业务测试 | Runtime Skill发现与公开CLI归属；Python最终生成、doctor计数、AG映射、MSKU导出及双版本离线产物测试；退役范围和本次结果见文末 |
| 回放与交接 | `scripts/verify-replenishment-skill-behavior.ts`适配双版本及同轮复用；本handoff |

Python路径均相对 `python/lxeskill_cli`，Skill路径均为 `skills/<名称>/SKILL.md`。没有新增计算CLI或合并两套算法。

## 环境与本轮实际验证

沿用当前worktree按锁文件恢复的独立Python/Bun依赖和项目Office Kit 0.1.5，没有升级依赖、修改锁文件或新增测试框架。所有命令从仓库根运行：

```sh
export TMPDIR=/private/tmp
export PYTHONDONTWRITEBYTECODE=1
export UV_CACHE_DIR=/private/tmp/codex-uv-cache
export LXE_OFFICE_NODE=/Users/hym/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node
export LXE_OFFICE_CLI=/Users/hym/.codex/worktrees/1672/Amazon/build/desktop-runtime/darwin-arm64/office/node_modules/@deepseek-ai/libreoffice-kit/lib/cli.js
# Python：uv run --frozen --no-sync pytest <定向路径> -q --tb=short -rs
```

| 本轮实际范围 | 结果 | 日志 |
|---|---|---|
| 同批双版本、V2正式/待核对真实Office、A规则、V1原算法/CLI、独立销量/CLI，7文件 | **94 passed，无skip** | `/private/tmp/pr4-versioned-entry-business-tests.log` |
| `tests/lxeskill` + `tests/infra`规定契约 | **562 passed、4 skipped、4 warnings** | `/private/tmp/pr4-versioned-entry-contract-tests.log` |
| Bun `skills.test.ts` + `lxeskill-command.test.ts` | **37 passed、287 assertions** | `/private/tmp/pr4-versioned-entry-bun-tests.log` |
| 固定终态模型回放脚本 | **17场景已编写，Bun编译通过；终审启动因未注入模型密钥退出，0场景执行，NOT VERIFIED** | `/private/tmp/pr4-versioned-replay-syntax.js`、`/private/tmp/pr4-final-review-model-replay.log` |
| `lxeskill doctor`及差异检查 | **ok=true**：49命令/39 Skills；`git diff --check`通过，未暂存；22个许可文件新增内容凭据模式扫描通过 | 实际CLI与Git只读检查 |

业务组为 `test_replenishment_versions.py`、`test_final_restock_shenzhen_delivery.py`、`test_final_restock_a_rules.py`、`test_mabang_store_msku_replenishment.py`、`test_mabang_store_msku_replenishment_cli.py`、`test_mabang_store_msku_sales_analysis.py`、`test_mabang_store_msku_sales_analysis_cli.py`。CLI/infra使用 `--basetemp=/private/tmp/pr4-amazon-replenishment-unification-local-verification-20261023/versioned-entry-contract`，允许本机模拟HTTP端口，未访问生产ERP。4个skip为Windows扩展路径2项和Windows原生Job2项；4条warning为既有aiohttp弃用提示。

新增主Skill契约先验证旧文案失败，再更新后转绿。新同批CLI测试首次因夹具多放SKU定义及销售/库存共同必需列误设而失败，仅修正夹具，没有放宽来源校验或修改业务Service。最终4场景通过，亦包含在上述94项中，不重复累计：

1. 同一批合格数据：V1与V2分别成功；V1为原多Sheet，V2为35列/14公式。
2. 部分MSKU深圳未知：V1按原范围成功，V2保留全部行、AG空白并返回待核对失败状态。
3. 注入V1销量报告写入失败：V1保留真实失败，V2仍成功生成并完成真实Office检查。
4. 注入V2 Office重算失败：V2失败且不发布正式文件，V1产物仍存在且不被覆盖。

测试先以原深圳算法产生报告，再禁止ERP/库存重算；核对两版使用同一报告，源文件哈希不变，输出路径不相同。V2普通库存12、真实0、组合7均不采用源表999；既有正式/待核对验收另含有限负数-3，保留全部行和每行14公式，Office重算后无Excel错误。V1原数量/参数/商品筛选/多Sheet回归保持。

17个固定终态场景涵盖V1/V2/both、一次版本澄清、上下文沿用、同轮已有数据复用、共享取数一次、单版及共同失败、认证/歧义/发送重试，核对发送文件归属；它只是待运行模型验收夹具，编译不证明模型实际遵循Skill。静态Skill断言也不等于自然语言选路端到端验证。

## 验收边界、审核与下一步

- 本地代码/CLI/Skill契约、真实Office产物和失败隔离验证通过；Python/Bun/Office测试环境就绪，具备准备本地Commit及人工评审材料的技术条件。模型回放缺少正常运行时凭据注入，仍为NOT VERIFIED。
- 真实模型自动选路、Desktop聊天、生产ERP取数、外部附件发送、原生Windows/Microsoft Excel仍为 **NOT VERIFIED**。本轮沿用不调用生产ERP和不向外发送的边界，未读取模型凭据或冒充真实交付。
- 人工审核重点：主Skill版本选择/同轮复用/分别交付说明，以及V2 AG口径和未知库存临时规则。运营允许未知库存正式交付的未来政策仍待确认；当前核对失败机制继续生效。
- 后续PR按PR1→PR2→PR3→PR4依赖串行审查，PR4初始base为PR3，前序合并后按实际历史复核main和base。功能收口后的main合并已追加授权，详见文末；仍不Push、Rebase或创建PR。

## 历史风险（独立修复任务）

- **P2，未修复，不属于PR4新增。** `python/lxeskill_cli/services/mabang/amazon/fba/store_resolver.py` 的 `_read_store_html`（约415行）将403与401统一归为认证错误，`fetch_fba_stores`（约436行）捕获后刷新认证并再请求一次。按全局规则，403应立即停止，不能当作普通登录过期自动重试。
- 上轮离线复现注入403，观察到2次获取尝试、1次认证刷新；429在该路径为1次尝试、0次刷新。复现没有真实HTTP请求；记录为 `/private/tmp/pr4-readonly-final-20261023-1ti4de5d/auth-stop-reproduction.json`。该文件与PR3及冻结远端main `abde37ddd63ca406921ad73c90dd1afa1139c363` 的Git blob同为 `ed3ceb3d6c6aa2d56b042518ef32adc8514818f7`。
- 影响是403后仍会发生认证恢复和再次请求。建议另开历史修复任务，区分403和可恢复登录失效，并补充403不刷新、不重试的离线测试；PR4不修改该认证逻辑，不扩展到其他ERP认证模块，也不将此风险描述为已修复。

以下分阶段审查记录保留当时状态；独立V2 Skill退役后的现行结论以文末为准。

## 2026-10-23 提交前独立终审

### 范围与结论

- 经GitHub连接器读取main当前的 `docs/pr-review.md`、`AGENTS.md`、`docs/architecture/lxeskill-cli.md` 和架构总览，同时复核《反过度开发》及当前模块实现。审查规范blob为 `e36ca05c06638995cfbc25ac1f1b237cc78c6ceb`，AGENTS blob为 `c2bbd709ce7368f9ed9e6c55000f8399053199c0`；未同步或修改本地Git历史。
- PR4分支和worktree正确，HEAD仍等于PR3 `092b24cc891ced31da165ee49836157b2ec93d10`；暂存为空。只审查相对该基线的19个修改和3个新增文件，以及受影响调用链。终审开始的22文件哈希全部保持，收口仅更新本handoff，没有修改生产代码或测试。
- V1、V2和Skill分别由独立审查者反方核对，未发现可确认的P0～P3问题，无阻塞修复或额外架构建议。主入口、单步能力、同轮输入复用、版本独立失败和文件契约一致。Skill未保留第二套完整编排，旺季开关与真实公开CLI一致。
- 具备本地Commit及人工评审条件；这不代表真实模型选路、生产取数或附件发送已经验收。未知库存可否正式交付仍待运营未来确认，当前V2核对失败规则继续有效。

### 新增实跑与复用证据

| 终审范围 | 实际结果与证据 |
|---|---|
| V1 PR3/当前独立对照 | **11 passed**。用 `git show 092b24cc:...` 提取并执行PR3模块；默认、货件扣减、US一组、UK一组、林美淇二组、清货共6场景的业务payload和4个Sheet值、公式、缓存、样式、行列尺寸一致。另以7行源表贯通销量→深圳→V1，两侧销量7行、V1可计算4行，组合7、真实0、负数-2及未知排除一致。脚本 `/private/tmp/test_pr3_v1_independent_review.py`，结果 `/private/tmp/pr3-v1-independent-summary.json`、`/private/tmp/pr3-v1-chain-summary.json`；准确命令与工具返回摘要 `/private/tmp/pr3-v1-independent-review-verification.log`。 |
| V1及共享取数既有定向测试 | **140 passed**；V1四条catalog契约及16个相关生产模块与PR3逐字节一致，共享MSKU默认请求form及CLI调用一致。准确命令与工具返回摘要 `/private/tmp/pr3-v1-existing-targeted-verification.log`。 |
| V2受影响7文件（含双版本、真实Office） | **110 passed，无skip**。准确命令及工具返回结果补存于 `/private/tmp/pr4-review-v2-final-evidence/pytest-command.txt`、`pytest-captured-result.txt`；原命令未重定向日志，结果记录注明会话及chunk。 |
| V2同批历史样本独立逐行复核 | **2002行、35列、28028公式、0 Excel错误**。独立读取原深圳报告作为AG期望值：1917正数、8真实0、52负数、25未知；普通1473、组合504、无本地SKU24、无库存数据1。全部行及公式保留，25个未知AG为空，`success=false`、文件名带“库存待核对”；三输入哈希不变。脚本及JSON在 `/private/tmp/pr4-review-v2-final-evidence/`。本次临时输出核对后已删除，JSON明确记录不保留工作簿；此前保留的同样本工作簿仍在 `/private/tmp/pr4-original-flow-sample-20261023/`。 |
| 相同源码与环境的既有契约结果 | 复用上述 **562 passed/4 skipped** 的Python CLI/infra及 **37 passed/287 assertions** 的Bun结果；94项业务组与本次测试有重叠，不累计成唯一测试数。 |

双版本4场景覆盖同批分别成功、V2未知而V1成功、V1销量写入失败而V2成功、V2 Office失败而V1产物保留。测试实际执行两条CLI并检查各自terminal与附件文件，禁止再联网/库存重算；没有将这些确定性测试描述为真实模型编排或发送成功。

### doctor、跳过与未验证边界

- 新跑 `lxeskill doctor` 返回 `ok=true`：49命令、41业务命令、39份Skill、31个owner Skill、41条命令声明，未报告warning。
- 所谓“4条doctor警告”实际为pytest同一条aiohttp弃用提示出现4次：`enable_cleanup_closed`在Python3.12.10已忽略。前三次分别创建ERP、EXTERNAL、DATA_SERVICE会话，第四次为手动Cookie用例创建ERP会话；位置 `shared/infra/net/aiohttp_client.py:61`，由依赖 `aiohttp/connector.py:1003` 发出。两个用例新跑 **2 passed、4 warnings**，日志 `/private/tmp/pr4-final-review-warnings.log`。相关源码、测试及uv.lock与PR3一致，非PR4引入，未发现运行影响；未修改无关基础设施。
- 既有4项skip仍为Windows扩展路径2项、Windows原生Job所有权/kill-on-close各1项，不计为通过。
- 17个真实模型回放已实际尝试启动，退出码1、报 `missing API key for provider: deepseek`，在provider初始化前终止，**0场景执行，NOT VERIFIED**。标准配置所有provider环境变量及云端凭据均未注入，仅检查存在性；未读取或输出密钥，未发起模型请求。日志 `/private/tmp/pr4-final-review-model-replay.log`，预检 `/private/tmp/pr4-final-review-model-preflight.json`。这属于环境启动阻塞，不是17个场景业务断言失败。
- 真实Desktop聊天、模型实际Skill发现/选路、生产ERP、新一轮真实取数及外部附件发送仍NOT VERIFIED；Office Kit真实重算已验证，未将其等同于Microsoft Excel原生验证。
- 收口执行 `git diff --check`、状态及敏感信息增量检查；不Commit、不Push、不Merge、不Rebase、不创建PR，PR1～PR3不变。

## 2026-10-23 V2 AG 来源最终定向核查

- HEAD仍为PR3 `092b24cc891ced31da165ee49836157b2ec93d10`，当前PR4工作区未暂存；本次没有修改生产代码、catalog或Skill。全仓搜索确认生产源码和CLI/catalog中没有 `uq122`、`include_local_inventory` 或 `include-local-inventory` 引用。V2默认MSKU导出不请求旧库存字段，工作簿源表必需列不含“本地库存”，AG只读取同轮深圳报告的 `真实库存（深圳仓库）数量`；V1计算及默认取数相对PR3不变。
- 扩充现有离线CLI+真实Office Kit测试 `test_final_restock_shenzhen_delivery.py`，覆盖旧列与深圳量冲突、深圳未知、源表完全无旧列、旧列空白及非法五种场景。此次实际运行 **5 passed，无skip**；无旧列场景确认源XLSX表头和已核验记录均没有“本地库存”，仍正常生成35列、全部MSKU、每行14公式，AG普通/组合分别为深圳报告的12、0、−3、7，Office错误0。未知库存仍输出“库存待核对”并返回非正式失败状态。测试只用本地夹具和原深圳算法生成报告，计算CLI阶段禁止再次库存计算及ERP访问。
- 当前Skill中的 `uq122` 只用于说明不再需要旧来源，测试及模型回放脚本中的引用只用于防回归。PR2、PR3、自动取数旧handoff记载各自当时的 `uq122` 规则，作为历史记录保留；执行时以本PR4的Skill、catalog和本handoff新口径为准，不能按旧handoff调用已删除开关。
- 本次未调用生产ERP、没有Git写操作或外部交付；`git diff --check`通过。真实模型选路、生产取数和附件发送仍为 **NOT VERIFIED**；运营尚未批准未知库存正式交付。

## 2026-10-23 双版本入口、冗余与上游继承终核

- **PASS（本地提交及人工提审条件）**。独立检查Skill/Runtime、Git继承/V1、V2/双版本三个范围，未发现确定P0～P3缺陷或需继续删减的无消费者入口；本次生产代码、Skill、catalog和测试均未修改，仅补充本交接。V1/V2计算命令各有独立算法、输入及产物，不能作为重复流程删除。
- 本次依据main现行 `docs/pr-review.md`、`AGENTS.md`、架构及Skill手册，并读取 `/Users/hym/Desktop/反过度开发.md`。本地main=`36130265231ff845646bd138a6ebc9f36b520aaa`，origin/main=`7802c187c3eeda7eac367dd01bee4bbdd05ade0f`；`git ls-remote`只读核实远端main=`2e9bec6692145413d43c9a1efecf159904d7712f`。GitHub compare显示本地主线至该上游新增33提交，相关Skill、CLI/业务Service、Runtime工具及Desktop/Gateway生产契约没有变动；未fetch、同步或合并。
- PR1 `979c33e8`、PR2 `af0d7b8b`、PR3 `092b24cc`均为当前HEAD祖先；HEAD仍精确等于PR3，PR4全部增量仍在工作区。当前代码真实调用PR1公式→PR2工作簿/来源验证/Office，并沿PR3既有取数、认证、CLI终态和文件交付机制执行。后续提交当前增量后，以PR3为Base可呈现PR4独立差异。
- 主Skill唯一负责V1/V2/两版选择、共享取数和交付；V2 Skill只调用三文件计算，销量分析保留V1及独立消费者。实际Runtime发现39个Skill、诊断0；三个计算/销量命令的公开describe均返回正确owner与参数。没有新增Runtime硬路由、执行协议、管理层、ERP请求或缓存系统。
- 本次实跑：Bun Skill/命令归属 **37 passed、287 assertions**；Python `test_final_restock_skill.py` **37 passed**；V2 AG与双版本两文件 **9 passed、无skip**，包含真实Office重算及单方失败隔离。复用源码仍相同的V1固定样本对照 **11 passed** 和原V1/共享取数 **140 passed** 证据；这些历史结果未冒称本次重跑。
- 模型provider只读预检仍返回 `missing API key for provider: deepseek`，未发起模型请求；17场景保持 **NOT VERIFIED**。确定性CLI/Office测试不代表真实模型编排、生产ERP或外部发送已验收。当前22文件开始哈希检查一致，收口仅本handoff更新；暂存为空、`git diff --check`通过，无Commit/Push/Merge/PR操作。

## 2026-10-23 Skill清单与等价实现专项审查

- **PASS**。按当前main规范及《反过度开发》检查实际消费者、PR1前原流程、PR3/PR4差异、公开CLI和Runtime发现；未发现确定P0～P3冗余问题。生产代码、Skill、catalog和测试本轮均为0处修改，仅记录本交接。HEAD仍为PR3 `092b24cc891ced31da165ee49836157b2ec93d10`，PR4分支及原22份未提交文件受到保护。
- 实际相关Skill共 **10个：公共5个、V1专属4个、V2专属1个**；其中默认完整流程核心8个，V1可选辅助2个。完整业务主入口只有 **1个**。下表命令均省略 `lxeskill` 前缀；Service均位于 `python/lxeskill_cli/services/mabang/amazon/fba/`，由既有 `services/agent_cli/mabang/` 标准适配器调用。

| Skill | description职责摘要／消费者 | 版本 | CLI → Service | 结论 |
|---|---|---|---|---|
| replenishment-workflow-map | 完整自然语言备货请求：版本选择、同轮取数、分别计算及交付 | 公共 | 自身无业务命令，调用下游及send_files | 唯一完整入口，保留 |
| replenishment-store-resolve | 店铺名称、ID及候选解析；主入口及单步消费者 | 公共 | replenish store resolve → store_resolver.resolve_fba_store | 原能力，保留 |
| mabang-store-msku-export | 按已解析店铺导出MSKU；主入口及单步导出 | 公共 | mabang store msku export → store_msku.download_store_msku_excel | 原能力，保留 |
| mabang-store-shenzhen-inventory-export | 从MSKU生成普通／组合SKU深圳真实库存报告 | 公共 | mabang store shenzhen-inventory export → store_msku_actual_inventory.export_store_msku_actual_inventory / calculate_inventory_rows | 原算法，保留 |
| mabang-store-unlinked-shipments-export | 三类货件原生文件及扣减快照；主入口及单步下载 | 公共 | mabang store unlinked-shipments export → unlinked_shipments.download_store_unlinked_shipments / build_store_unlinked_shipments_snapshot | 原能力，保留 |
| replenishment-sales-analyze | 链接、ASIN、MSKU销量报告；V1主流程及独立分析 | V1 | replenish sales analyze → store_msku_sales_analysis.analyze_store_msku_sales | 有实际消费者，保留 |
| replenishment-calculate | V1原算法、参数方案、多Sheet；完整V1及离线复算 | V1 | replenish calculate → store_msku_replenishment.calculate_store_msku_replenishment | 独立算法，保留 |
| replenishment-final-restock | 三文件输入，35列／14公式；完整V2及离线复算 | V2 | replenish final-restock generate → final_restock_workbook.generate_final_restock_recommendation | 纯单步计算，保留 |
| replenishment-algorithm-config-manage | 查看、导出、校验及维护参数方案；V1计算实际get_template消费者 | V1可选 | replenish template → replenishment_template | 独立配置管理，保留 |
| replenishment-amazon-restock-inventory-snapshot | Seller Central手动CSV转对照快照；V1计算可选输入消费者 | V1可选 | replenish inventory restock-snapshot-build → amazon_restock_inventory.build_amazon_restock_inventory_snapshot | 独立输入适配，保留 |

- 本轮真实执行SkillCatalog发现 **39个仓库Skill、0诊断**，公开 `lxeskill list` 返回相关9命令，逐个 `describe` **9/9成功**。description原文、命令、owner、参数及执行记录位于 `/private/tmp/pr4-skill-inventory-discovery.json`。店铺resolve的多个owner是同一命令的授权使用方，归属仍唯一；不代表多份实现。Office Kit是内部适配、send_files是Tool，不计Skill。SP发货单相关Skill与东南亚入口有其他业务消费者，不属于此10个。
- V2单步Skill没有解析、导出或发送命令；完整取数及失败隔离只在主Skill。没有Runtime硬路由或另一个完整V2执行器。PR3自动取数提交 `f3ab2e77` 只改Skill、文档和测试；深圳显式源文件参数扩展了原Service。PR4未新建生产取数模块。
- 等价性反查：V2 `_load_shenzhen_rows` 与V1 `load_inventory_rows` 的行参与规则不同，V2必须保留未知及全部MSKU，不能直接套V1过滤；V2 `_shipment_quantities` 调用原快照读取并补充键冲突／数值检查，没有重新下载或汇总；V1对销量＋库存报告核验，V2对源表＋库存核验，底层均复用source_verification。CLI参数适配、输入路径校验、Office诊断与通用结果／附件协议各有实际职责，未发现需删除的多层转发。
- 商品类型目录在MSKU导出时取得并写入核验源，深圳导出读取同一元信息和combo_map，不另建V2组件算法。认证、Cookie恢复、HTTP和有限重试继续使用既有auth及shared.infra.net；交付继续使用business统一终态／附件和send_files。内部final-restock settings由Desktop实际调用，应保留。
- 请求次数边界：原店铺解析后，MSKU导出仍会再次查询以核验name/id/组范围，货件还需解析自身API的shop ID；这些原有入口身份保障在PR1前已经存在，不是V2新增第二轮取数，未在PR4删除。主Skill要求双版本复用合格输入，离线双版本测试禁止计算期间再次取数／重算；模型是否始终正确复用仍需真实回放，不作过度保证。
- 旧 `uq122/include_local_inventory/include-local-inventory` 生产依赖已清除；剩余Skill及测试说明旧依赖失效，PR2/PR3历史handoff保留历史事实。V1算法、多Sheet与既有规则不变；V2仍使用深圳报告AG及库存待核对临时机制。
- 本轮未改业务源码，复用上节相同源码与环境的Python Skill契约 **37 passed**、Bun **37 passed／287 assertions**、真实Office及双版本 **9 passed无skip**、V1历史对照 **11 passed** 和原共享能力 **140 passed**，未冒称本轮重跑。17个模型场景、生产ERP及外发仍 **NOT VERIFIED**。本轮新验证为实际Runtime／公开CLI盘点、调用链／Git核对及收口diff检查；无新业务测试失败。
- 具备PR4本地Commit及人工提审条件；本轮不执行Commit、Push、Merge或创建PR，不扩展架构审查。

## 2026-10-23 Amazon V1/V2 Skill文字质量定向收敛

- 依据远端main `2e9bec6692145413d43c9a1efecf159904d7712f`（GitHub compare核实未变化）的有效 `AGENTS.md`、`docs/pr-review.md`、架构规范，以及《反过度开发》，对上节10份Skill逐一复核。PR4仍在 `codex/amazon-replenishment-unification`，HEAD及PR3基线仍为 `092b24cc891ced31da165ee49836157b2ec93d10`；未改Git历史或暂存。修改前对工作区与Skill共24份文件逐份复制到 `/private/tmp/pr4-skill-quality-start/`，据此核对本轮净增量。
- V2单步Skill的description、四输入和主入口边界已准确，保留；精简旺季持久设置解释、AH/T/AD/AI逐列实现、AI完整公式及重复的未知库存交付提醒。保留35列/14公式、I/J/AI、AG深圳真实库存、`uq122`非依赖、普通／组合SKU、正数／真实0／有限负数／未知、旺季裸flag、`success=false`/terminal `ok=false`、Office核验、真实错误及主入口交接。工作簿及公式源码没有改动。
- 7份原有单步Skill的共同8条泛化“执行与错误”文字缩为针对当前命令的4条，保留公开CLI查询、同会话终态、真实错误、必要认证恢复和交付边界；4份本地命令删除无关的ERP认证／分页话术。MSKU Skill另删重复的核验页存储行类型、内部批次及超时细节；深圳Skill把“自动补齐前置数据”归属主入口。方案管理与Amazon库存对照的description明确V1，主入口补充两项可选Skill的真实名称。货件Skill有独特三状态／空快照／部分失败契约，本轮原样；其余业务输入、算法与路径规则保留。
- 本轮改动：9份Skill文字、1份Bun Skill测试以及本handoff。相对修改前快照，10份Skill合计**删除78行、新增44行，净减34行**；其中未修改的货件Skill为0行。Bun测试由绑定V2表格行与非执行字段改为检查AG、未知库存、旺季、Office及主入口等语义契约。没有改Service、CLI/catalog、Runtime生产代码或Excel。
- 首轮定向Python结果 **1 failed、38 passed**：已有参数方案契约测试要求主Skill明确包含 `replenishment-algorithm-config-manage`，原“对应单步Skill”未写出名称；补充主入口可选依赖名后复跑 **39 passed**。Bun Skill和lxeskill归属 **37 passed、284 assertions、0 fail**；Runtime发现39个Skill、0诊断；公开 `lxeskill list` 与9个相关命令 `describe` 全部成功；`lxeskill doctor` `ok=true`（49命令、39 Skill）；`git diff --check`通过。
- 通用 `skill-creator/scripts/quick_validate.py` 对V2 Skill返回退出码1，原因是该通用校验器只接受标准Codex前置键，不接受项目现有的 `type` 和 `commands`；项目Runtime与CLI原生契约均正常。本轮不为迁就通用校验器改掉现有仓库Skill格式。
- 既有相同业务源码／环境的V1固定样本对照、V2真实Office及双版本失败隔离测试结果可沿用上节证据；本轮文字修改不改变算法。17个真实模型回放、生产ERP与外部文件发送仍 **NOT VERIFIED**，不能由静态Skill测试推断模型实际选路。未知深圳库存仍按V2临时核对失败规则，运营尚未批准正式交付。具备PR4本地Commit及人工提审条件，本轮不提交、不推送、不合并、不创建PR。

## 2026-10-23 独立V2 Skill退役与统一入口最终收敛

- **PASS：具备本地Commit及组长人工提审条件。** 最终架构为一个完整主Skill `replenishment-workflow-map`，保留V1计算Skill及V2计算CLI；独立V2 Skill文件和空目录均已删除。Amazon相关Skill由10个减少为9个，仓库实际发现38个Skill。此前日期相同的审查记录描述的是当时状态，以本节和文首现行契约为准。
- 当前worktree/分支不变，HEAD仍为PR3 `092b24cc891ced31da165ee49836157b2ec93d10`，暂存为空。只读连接器核实远端main为 `abde37ddd63ca406921ad73c90dd1afa1139c363`，读取其现行AGENTS、PR审查与lxeskillCLI架构规范，并复核《反过度开发》；本地main为 `36130265`、origin/main为 `7802c187`，未同步或合并。Shell的远端查询因本机代理不可达而失败，连接器读取成功。
- 真实依赖：CLI `owner_skills` 控制现有scope可见性，Runtime从Skill的 `commands` 和公开 `lxeskill list` 发现及归属命令。V2命令owner已改为主Skill，主Skill声明同一命令；旧Skill scope现在被拒绝。沿用原CLI分发、结果终态与附件协议，没有新增Runtime路由、注册系统、包装Skill或业务Service。
- 必要改动共14个文件：删除 `skills/replenishment-final-restock/SKILL.md`；调整主Skill、深圳取数Skill和catalog；同步Runtime两个测试文件、Python最终Skill/doctor/工作簿CLI/深圳库存交付/双版本五个测试文件；更新本handoff及两份PR3历史交接的现行入口提示。主Skill复用已有V2内容，仅补齐命令归属、必需文件及真实返回字段交接，保持用途、输入、依赖、执行、结果五部分。旧Skill名称只剩退役防回归断言和已标记的历史记录，活动Skill、生产注册及回放脚本均无读取旧Skill的指引。
- V1计算、销量分析和公开catalog条目与PR3一致；V2生成命令除owner外的参数与产物契约与PR3一致。V1算法、深圳算法、PR1公式、V2工作簿和生成adapter等6份受保护生产文件与本轮开工哈希一致；既有AG修复完整保留，没有改写算法或公式。行数统计及修改前副本位于 `/private/tmp/pr4-retire-v2-skill-20261023/`。

| 本次实际验证 | 结果 |
|---|---|
| Python最终Skill、工作簿CLI、深圳库存交付、同轮双版本4文件 | **55 passed，无skip**。包含主Skill scope调用、旧scope拒绝、公开参数、裸旺季开关、真实Office Kit重算、35列/14公式、全部MSKU、普通/组合与正数/0/负数、无/空/非法uq122、未知库存待核对及单版失败隔离。 |
| `tests/lxeskill` + `tests/infra` | **562 passed、4 skipped、4 warnings**。最初沙箱阻止本机模拟HTTP端口且默认临时路径不足，恢复离线测试环境后定位出doctor旧39计数；同步为38后完整重跑通过。4个skip为Windows路径/Job，4个warning为既有aiohttp弃用提示。 |
| Bun Skill发现与公开CLI归属两个文件 | **37 passed、0 failed、256 assertions**。真实CLI归属验证V1仍为V1计算Skill，V2归主Skill；Runtime不再发现旧Skill。 |
| `lxeskill doctor` | **ok=true**：49命令、41业务命令、38个Skill、31个owner、41条命令声明。 |

- 日志：`python-targeted.log`、`python-cli-infra-final.log`、`bun.log`，均在上述临时目录。两组Python有重叠，不累计为唯一测试总数。真实模型17场景、Desktop聊天、生产ERP、外部附件发送及原生Microsoft Excel本轮未验证；不把确定性契约与Office Kit测试当成真实模型交付。
- V2未知库存仍为运营确认前临时规则：AG空白、全部行及公式保留、待核对文件、非成功终态，暂停V2正式交付；未批准未知库存正式成功。V1继续使用原契约。收口检查diff、敏感内容、`git diff --check`和Git状态；未Commit、Push、Merge、Rebase或创建PR。

## 2026-10-23 终审问题收口与本地Commit

- 本轮直接基于上节及最后只读终审收口，不新增架构审查。GitHub只读核实main仍为 `abde37ddd63ca406921ad73c90dd1afa1139c363`，沿用该版本AGENTS、PR审查及模块规范。PR1 `979c33e8`、PR2 `af0d7b8b`、PR3 `092b24cc`均为提交前HEAD祖先；暂存初始为空，29条路径与只读终审基线哈希一致。
- 开工备份为 `/private/tmp/pr4-final-local-commit-20261023-sakgkvvi/`：保留29路径状态、全部现存文件副本、SHA256清单和二进制diff。没有reset、覆盖其他改动或改写PR1～PR3历史。
- **P3已修正**：原22文件审计清单当前为19个逐字节一致、3个Skill/doctor测试变化。文首分别说明业务源码未变、Skill/测试变化及V1六场景业务结果对照一致；保留原有效验证记录，继承的PR1～PR3能力未计作PR4新增。
- **测试补齐**：在现有 `test_final_restock_workbook.py` 新增 `test_inventory_report_rejects_duplicate_msku_across_sheets`，用原夹具将 `SEA-1` 同时放在库存sku和组合sku两个Sheet，库存值分别为12和999。完整生成入口返回既有 `FinalRestockWorkbookError`，诊断包含重复MSKU；断言写表和Office均未调用、没有发布XLSX。现有拒绝实现正确，未修改业务Service。
- **历史P2未修复**：403认证恢复/重试已在“历史风险”节独立记录；认证源码与PR3一致，本次不修改。

| 本轮实际执行 | 结果与证据 |
|---|---|
| Python六文件：工作簿、深圳库存交付、双版本、最终Skill、MSKU API、MSKU CLI | **114 passed，0 failed、无skip**；包含新增跨Sheet重复用例、真实Office重算、35列/14公式、AG普通/组合及正数/0/负数、无/空/非法uq122、待核对状态和单方失败隔离。日志 `python-focused.log`。 |
| Bun Runtime Skill发现及公开CLI归属 | **37 passed、0 failed、256 assertions**；日志 `bun.log`。 |
| 实际 `doctor`、`list`、V1/V2/MSKU三个 `describe` | **5/5成功**；doctor为49命令、41业务命令、38个Skill；V2 owner为主Skill，V1仍为原计算Skill，MSKU参数不含 `include_local_inventory`。见 `prestage-verification.json` 及 `public-*.jsonl`。 |
| 定向diff和保护核对 | 本轮仅修改本handoff和现有工作簿测试；生产源码相对开工哈希不变，历史认证未改；`git diff --check`通过。 |

- 日志均在本轮备份目录。**复用证据，未冒称本轮执行**：上轮86项业务定向（含V1独立PR3对照11项、A规则及真实Office）；既有CLI/infra **562 passed、4 Windows skipped、4条既有aiohttp warning**。V1业务源码、A规则和CLI/infra源码未变化；本轮工作簿测试变化已完整重跑。不同测试范围有重叠，不累计成唯一测试总数。
- PR4累计范围为 **29条路径：25个修改、3个新增、1个删除**。新增为本handoff、`test_final_restock_shenzhen_delivery.py`、`test_replenishment_versions.py`；删除为独立V2 Skill。其余为既有AG修复、catalog归属、9个现行Amazon Skill、Runtime/Python测试、回放脚本及两份PR3历史交接提示。本轮新增回归放在已有文件，没有引入框架、依赖或锁文件变化。
- 本轮用户授权精确暂存上述累计范围并完成一次本地Commit，提交信息为 `refactor: unify Amazon V1/V2 replenishment workflow`；提交SHA及最终工作区状态由 `git log -1`、`git status` 和收口汇报确认。后续Push、创建PR、Merge均需分别取得授权，PR4初始Base为PR3。
- **技术收口PASS，具备后续提审准备条件**；人工仍需审核Skill版本选择、命令归属、AG口径及未知库存临时规则。17个真实模型回放、Desktop聊天、生产ERP、外部附件交付/发送恢复、原生Windows及Microsoft Excel仍为 **NOT VERIFIED**，历史403 P2仍需独立修复；不将技术收口视作生产验收。

## 2026-10-23 main兼容合并与Desktop重启

- 用户追加授权“远端main有更新则合并兼容”，并在预检发现冲突后明确确认最小处理方案。`git fetch origin main`取得 `abde37ddd63ca406921ad73c90dd1afa1139c363`；与此前只读审查查询相同，但当前PR4尚未合入。相对PR4功能提交有34个主线提交，其中29个非合并提交，涵盖文档整理、侧栏与权限界面、模型思考级别和MCP SDK v2。
- 合并以PR4功能提交 `f973ed71` 为第一父节点、上述main为第二父节点，保留PR1～PR3及PR4既有历史，不修改本地main或前序分支，不Rebase、不Push、不创建PR。合并前提交信息、预检和日志保存在 `/private/tmp/pr4-main-compat-restart-8xxm9j8r/`。
- 唯一冲突是 `apps/dashboard/test/behavior/renderer.test.ts` 的场景计数行：保留main的 `sidebar: 10`，同时保留Amazon设置的 `amazon-final-restock-settings: 6`。其余自动合并；PR4原29条路径在追加本节前逐字节保留。没有改业务算法、AG来源、公式或ERP认证。
- 依照main声明执行 `bun install --frozen-lockfile` 同步3个包，锁文件SHA256保持 `129423dbbf5e0236db562425038fabc73882f201b62ab9f6d8e442c96e91e013`。这是复用main依赖，不是PR4自行升级。当前Python锁文件和业务源码未受main修改。

| 合并后实际验证 | 结果与日志 |
|---|---|
| 全工作区TypeScript检查 | **通过**，8个工作区退出码均0；`typecheck.log`。 |
| TypeScript生产模块边界检查 | **通过**，`bun run check:ts-boundary`。 |
| Bun MCP协议/错误/图像、Skill/CLI归属、模型目录、Desktop设置及健康，11文件 | **120 passed、0 failed、705 assertions**；`bun-compat.log`。MCP使用本机模拟HTTP/stdio，未连接生产ERP。 |
| 真实Chromium夹具：sidebar、amazon-final-restock-settings | **2 passed、0 failed、23 filtered**；`renderer.log`，分别保留10项侧栏和6项Amazon设置断言。 |
| Python深圳库存交付、双版本、跨Sheet重复MSKU、Skill及仓库结构 | **56 passed、0 failed、无skip**；`python-compat.log`，包含真实Office Kit及V1/V2结果隔离。 |
| 公开CLI检查 | doctor及V1/V2 describe均成功；49命令、38个Skill，V1 owner仍为原计算Skill，V2 owner仍为主Skill；`merged-cli-checks.json`。 |

- **重启通过**：停止原PR4 Desktop/Agent后，以既有 `bun run desktop:preview` 重新准备缓存资源、构建Dashboard和Electron并启动合并源码。启动日志记录 `gateway_ready`、`lxeskill_probe_ready`、`skill_catalog_loaded`（38个Skill、0诊断）；新Desktop主进程63753、Agent子进程63785。日志为 `merged-desktop-preview.log`；默认数据仍在本worktree的 `var/`。
- Electron实际用户窗口的自动化访问未获许可，因此本轮采用进程/日志检查；上述Chromium夹具不等同于真实用户聊天验收。17个模型回放、生产ERP、外部附件交付、原生Windows和Microsoft Excel继续 **NOT VERIFIED**；历史403 P2未修复。
- PR4功能差异可独立通过 `092b24cc..f973ed71` 核对；本次带入的主线改动不计作备货功能新增。若后续仍以旧PR3为Base，PR差异还会包含这段main历史，提审时须按实际父链明确区分；没有擅自同步PR1～PR3。最终合并提交SHA及工作区状态以 `git log -1`、`git status` 和收口汇报为准。
