# 马帮 TMS PH1 / VN1 仓库导出交接

本文件汇总当前状态、必要历史和真实验收证据。历史测试只证明对应阶段，不累加为当前测试数；详细逐轮记录保留在提交 `cdfda4d4` 的同名文件中，可用 `git show cdfda4d4:docs/record/20261016-mabang-tms-warehouse-export-handoff.md` 查阅。

## 当前工作区、基线和 Git 状态（2026-10-20）

- 分支 `codex/mabang-tms-warehouse-export`，Pool `pool-3`；工作区 `/Users/hym/PycharmProjects/LXE_AGENT/.worktrees/pool-3`。
- 本轮起点 HEAD：`cdfda4d47525eab3a4e03b3666705315b2b03e51`。业务提交为 `93cc6135`；`785ad37b` 合入最新主线；`cdfda4d4` 只修正文档链接及交接状态。
- PR 目标：`Arsenal20262/LXE_AGENT:main@88a303386826e560ec6e45c692f93ee0f20311de`。本轮通过 GitHub 只读查询确认 Arsenal 与 LXE123 两个远端 main 均仍为该 SHA，本地 `arsenal/main`、`origin/main` 相同；本地 `main` 仍为 `9f36647a`，未切换或修改。
- Arsenal main 已按此前单独授权从 `5af6a40e` 快进同步 8 个上游提交，没有将 TMS 或 Runtime 功能合入 main。
- 文档提交前只读查询：[Arsenal PR #11](https://github.com/Arsenal20262/LXE_AGENT/pull/11) 为草稿；[上游 PR #95](https://github.com/LXE123/LXE_AGENT/pull/95) 已进入评审。查询时两者 head 均为 `cdfda4d4`、累计 16 个文件、3 个提交，均未合并、无合并冲突；随后文档提交按末节授权追加，远端结果以 Git/PR 记录为准。
- 独立 [Runtime PR #9](https://github.com/Arsenal20262/LXE_AGENT/pull/9)（`313cd8bf0f830f6480e444804d69a637d923acf8`）仍未正式集成，不复制其公共分派修复。

## 新能力与调用链

`mabang-tms-products-export` → native exec → `lxeskill mabang-tms products export --warehouse PH1|VN1|all` → 原 `services.agent_cli.mabang_tms.export_run` → `services.mabang_tms.workflow` → 原 TMS client / workbooks → terminal `files` → 独立 `send_files`。

用户确认的真实接口合同：PH1 为 `warehouseId=12107`，VN1 为 `warehouseId=12831`；列表和导出均接受该参数，`idsList` 使用列表顶层记录 `id`，两仓字段结构相同。测试数据是依据这些已确认字段构造的合成样本，未冒称生产抓包或真实越南 Excel。

每页查询、导出使用同一仓库 ID。先检查每条库存记录顶层 `warehouseId`，忽略可能不同的嵌套 `stock.warehouseId`；原有 SKU/仓库名称覆盖检查再拒绝文件混仓。异常批次不保存、不合并，之前通过校验的批次仍可作为明确标注的部分结果交付。重复 SKU、多库存记录及一 ID 多行不去重。

自然语言明确越南选 VN1，明确菲律宾选 PH1；未指定先询问三个范围，明确全部才用 `all`。桌面使用真实 `ask_user_question` schema，其他渠道普通提问等待回复；跳过、空答案、取消不授权导出。已有 Agent scope 环境下漏传仓库在登录前拒绝，避免模型漏参触发全仓；无 scope 的外部 CLI 保留无参历史全仓兼容。

结果新增 `warehouse`、`warehouse_id`；选仓时 `filters.warehouseId` 记录实际条件，`warehouse_scope=selected_warehouse`。全部仓库保留 `warehouse_scope=current_account_all` 和无仓库参数的请求体。原完成/部分失败、统计、原始文件、账号锁、附件和错误脱敏合同保留。

## 当前业务边界

- 文件名为 `马帮TMS-商品-菲律宾PH1仓-<日期>-<时间>.xlsx`、`马帮TMS-商品-越南VN1仓-<日期>-<时间>.xlsx` 或 `马帮TMS-商品-全部仓库-<日期>-<时间>.xlsx`；部分成功加 `-部分导出`。原 `artifacts.kind` 保持兼容，附件沿用返回路径的 basename。
- 同一任务已确认 ERP 时复用该来源；仅给国家先确认雅仓/TMS，仅称“马帮”且来源未明时区分马帮 ERP/TMS。雅仓的 PH8805/VN8806 与 TMS 的 PH1/VN1 分开，未改雅仓 Service/CLI 规则。
- 沿用固定筛选 `status=1`、`isConfirm=1`、`gridproperty=-1`、`if_produce="-1"`、`stockQuantity=-1` 等，以结果 `filters` 为准；不把枚举推定为覆盖全部商品/库存状态，`all` 不取消筛选。
- 原认证变量为 `LXE_MABANG_TMS_ACCOUNT`、`LXE_MABANG_TMS_PASSWORD`，由桌面配置注入。复用既有 `LXESKILL_SKILL_SCOPE`，没有新增业务环境变量；每个 worktree 使用自身 `.venv`。
- 查询和导出均为 `pageSize=1000`，最多 100 页、10 万条、15 分钟。PH1 4325、VN1 4208、all 8533 的离线规模分别需 5/5/9 页；8533 不是账号全仓真实总数证明。模拟服务端每页只返回 50 条时，100 页后按 `page_limit` 交付已验证部分，不报完成。
- 完成依据为稳定 `totalNum`、唯一顶层记录 ID 及逐批文件校验。忽略无关 `totalPage` 值和格式；显式页码、重复 ID、提前空页、累计超限检查保留。同 SKU 的独立库存记录、一 ID 多行不去重。
- Excel 的 SKU/仓库 Counter 只证明覆盖及行数下界；无接口记录 ID 时，不能证明逐 ID 内容、精确展开行数或识别条数相同的错误替代。

## 当前分支累计修改文件

2026-10-19 按相对本轮 PR 目标 `Arsenal20262/LXE_AGENT:main@88a30338` 的实际 diff 核对：累计 14 个修改、2 个新增，共 16 个任务文件，完整清单如下。目标 main 原有能力及历次基线同步带入的上游提交不计为本任务新增；此前各文档收口阶段的文件数仍按当时增量理解。

- `python/lxeskill_cli/lxeskill/catalog.json`：同命令可选 `warehouse` 字符串，PH1 / VN1 / all。
- `python/lxeskill_cli/services/mabang_tms/client.py`：列表、导出可选同一 `warehouseId`；无参请求不新增字段；复用现有机制增加下载安全日志。
- `python/lxeskill_cli/services/mabang_tms/workflow.py`：仓库映射、显式范围、顶层仓库检查、范围元数据、分页兼容和最终文件命名。
- `python/lxeskill_cli/services/mabang_tms/workbooks.py`：反方审查后增加同 SKU/同仓库存记录的输出行数下界检查。
- `python/lxeskill_cli/tests/mabang_tms/test_mabang_tms_export.py`：分仓、分页、Excel、CLI、下载及部分成功的离线回归。
- `python/lxeskill_cli/tests/mabang_tms/fixtures/vn1-pagination-metadata.json`（新增）：脱敏的 VN1 分页元数据，商品及 Excel 测试行另行合成。
- `packages/agent/runtime/test/engine/runtime.test.ts`：TMS/雅仓工具轨迹、附件名称及 2 个共享 Runtime 阻塞回归；后两项仍失败，正式集成 PR #9 后再去重。
- `packages/agent/runtime/test/tooling/lxeskill-command.test.ts`：参数与同命令归属合同。
- `packages/agent/runtime/test/tooling/skills.test.ts`：索引描述、跨 ERP 来源/范围规则及禁止默认全仓。
- `packages/agent/runtime/test/tooling/user-questions.test.ts`：直接使用 Skill 中的真实提问参数，验证三选项、等待和跳过。
- `skills/mabang-tms-products-export/SKILL.md`：国家/仓库选择、询问、执行与部分交付说明。
- `skills/southeast-asia-replenishment-workflow-map/SKILL.md`：更新现有 TMS 能力范围。
- `skills/yacang-reports-export/SKILL.md`：补充同国家仓库的 ERP 来源澄清，不改变雅仓导出规则。
- `docs/harness/skill/current_skill_catalog.md`：同步能力说明。
- `docs/acceptance/mabang-tms-export-validation.md`：随 main 迁移后的验收文档，修正旧命令并追加本次证据边界。
- `docs/record/20261016-mabang-tms-warehouse-export-handoff.md`（新增）：本 handoff。

## 最新已执行验证（2026-10-19）

以下测试运行于 `785ad37b` 对应业务代码；之后 `cdfda4d4` 和本轮仅改文档，未重复业务测试。

| 范围 | 命令与实际结果 |
| --- | --- |
| Python TMS / CLI | 从 pool-3 根运行 `UV_CACHE_DIR=/private/tmp/lxe-uv-cache uv run --offline --no-sync pytest python/lxeskill_cli/tests/mabang_tms python/lxeskill_cli/tests/lxeskill/test_lxeskill_cli.py`：218 通过。 |
| Skill / CLI / 问答契约 | `bun test packages/agent/runtime/test/tooling/lxeskill-command.test.ts packages/agent/runtime/test/tooling/skills.test.ts packages/agent/runtime/test/tooling/user-questions.test.ts`：55 通过。 |
| Runtime 与上述三个契约文件 | 另包含 `packages/agent/runtime/test/engine/runtime.test.ts`：184 通过、2 个已知失败；已包含上述 55 项，不重复累计。 |
| Runtime 类型检查 | 在 `packages/agent/runtime` 运行 `bun run typecheck`：退出码 0。 |
| 桌面手工测试 | pool-3 独立服务启动后用户反馈通过；具体场景未逐项记录，不代替全量生产或全部模型行为验收。 |

两个失败为 `review TMS mixed question/exec must not export on skip` 的 question-first / exec-first：前者跳过后仍执行同批排队 exec，后者在回答前执行。模型和 exec 均为离线替身，未调用生产。保留正常断言，不 skip/todo，不改成接受错误行为。

## 必要历史记录

| 阶段 | 变更与证据 |
| --- | --- |
| 2026-10-16：选仓与独立反方检查 | 原链路增加 PH1/VN1/all；集合覆盖改为 Counter 下界，复现并修复同 SKU 多记录少导。最初将 `totalPage` 解释为总页数的严格检查随后被真实证据推翻，现已移除其阻断。 |
| 文件名与跨 ERP 澄清 | 保留单 Skill/CLI/Workflow，补范围命名、来源澄清及固定模型工具轨迹。该阶段 Python 630 通过、4 跳过，契约 53 通过。 |
| 分页与真实规模 | 保存的 VN1 响应为顶层 `datas/totalNum=4208`，`pop.totalPage` 随请求页 1～5 变化，行数 1000/1000/1000/1000/208。fixture 仅为脱敏元数据；商品/ID/Excel 行为合成。TMS 132→136→149 项通过分别对应分页语义、规模和格式阻断收口，不累加。 |
| Skill 与固定筛选说明 | 参考雅仓的范围/来源/参数/结果结构，明确内部 HTTP 不是 Agent 工具；补“马帮＋国家”上下文处理和完整 Map 名称，按真实筛选替代过宽业务描述。未改查询条件。 |
| TLS 离线诊断与日志 | 首轮异常后增加 16 个离线用例，TMS 165 通过；安全日志增加 6 项后 171 通过。测试覆盖 TLS/半截文件/429、单次 GET、原异常、停止及部分交付，生产根因仍未知。 |
| Runtime 临时组合探测 | 测试进程临时加载 `313cd8bf` 后曾 35 通过、0 失败；未 merge/cherry-pick 或改 Runtime 源码，不能称正式集成。 |
| 2026-10-19：同步 Arsenal main@3b81841b | 保留 main“四选项上限”及新增 TMS 仓库测试，原断言均不变。Python TMS/CLI/infra/雅仓 703 通过、4 跳过；契约 54 通过；Runtime 定向 33 通过、2 失败。备份快照 `/private/tmp/lxe-tms-pre-sync-benozgy9`、stash `129c0778865a5b3f8f1dac063fb0ee8ee951a4dc` 保留。 |
| 2026-10-19：同步 main@88a30338 与推送 | 主线合并及最新验证见上节，随后推送 TMS 分支并更新原草稿 #11；上游主线能力不计为本次新增。 |

此前还只读检查过用户手动产生的两个旧命名文件：VN1 4208 行、PH1 4324 行，各 5 批，与原始批次逐行逐单元格一致且仓库分开。该文件检查不等于下面两次受控 CLI 的单次全量验收，也不证明当前所有 Agent 场景。

## VN1 单次受控生产验收（部分成功）

2026-10-16 17:39（本地时间），用户明确授权仅 VN1（12831）一次完整生产导出。使用 pool-3 自有 `.venv` 和当前 CLI：`uv run --frozen --no-sync lxeskill mabang-tms products export --warehouse VN1`；现有桌面 TMS 凭据仅在内存中注入，使用原有业务工作区 `var/workspace`。未执行 PH1/all，没有重新启动、补发请求或修改业务数据。临时观测器位于 `/private/tmp/lxe-tms-vn1-production-acceptance`，只记录本次请求元数据和散列，不修改项目源码、认证、重试或 Runtime。

- CLI 返回 `partial_success`、`ok=false`、退出码 4。第 2 批文件下载发生 `download_network_error`：`SSLError` / `UNEXPECTED_EOF_WHILE_READING`。现有机制停止，未保存或交付未验证的第 2 批；没有触发整任务重试。未发生 401/403/429 或已观察到的业务数据校验失败。TLS 连接中断的具体根因 **NOT VERIFIED**，不据此推断服务端或本地故障。
- 实际请求 **7 次**：登录 1、列表 2、导出提交 2、下载 2；6 次 HTTP 200，另 1 次下载在获得响应前发生 TLS 异常。下载错误中的 `Max retries exceeded` 为底层异常文本；观测到该下载仅发起 1 次，没有应用层重试。两次列表和导出均为 `warehouseId=12831`、`pageSize=1000`，每批提交 ID 与对应列表顶层 ID 顺序一致。
- 已观察第 1、2 页各 1000 条、`totalNum` 均为 4208，`pop.totalPage` 分别为 1、2，没有因此错误终止。2000 个顶层记录 ID 唯一、无页内或跨页重复，顶层 `warehouseId` 均为 12831；这 2000 条的嵌套 `stock.warehouseId` 与顶层不同，未将其混同为库存记录仓库。第 3 页及以后未请求，完整分页 **NOT VERIFIED**。
- `read_unique_ids=2000`，`exported_unique_ids=1000`，`remaining_records=3208`，完成并校验 1 批。最终部分文件 1000 行、994 个 SKU；2 个 SKU 各有 4 行，6 条额外库存记录完整保留。最终文件与第 1 批原始 XLS 的全部行、单元格值（空值规范化）、顺序、SKU/仓库及整行重数一致，没有去重。18 项只读核验全部通过，仅证明已交付部分。
- 最终工作表为“商品”，仓库列只有“越南VN1仓”。12 列表头：库存SKU、30天销量、7天销量、可用库存、15天销量、仓库、库存量、在途量、成本价、采购价、入库时间、90天销量；无公式或错误单元格。Excel 没有库存记录 ID，不能由文件独立证明每个 ID 的业务内容身份或服务端未返回记录的完整性。
- 最终 `files` 与 `artifacts[].path` 一致，文件名正确包含“越南VN1仓-部分导出”，不含“合并”。路径：`var/workspace/.lxeagent/artifacts/mabang_tms/exports/a410a5b5c960cb8e68d0ae93d0aebc48848273bc04d175a332949bc12a935c0a/878d901a36244cf3b11c7bbd3c118e61/马帮TMS-商品-越南VN1仓-部分导出-20261016-173941.xlsx`。文件 49685 字节，SHA-256：`b8a4431e4733a2c9ebfccd4f45c39878ded5f688c59e177f784ba2835d2eb51c`。

## VN1 第二次单轮受控验收（部分成功）

2026-10-16 18:02:39～18:03:09（本地时间），用户重新明确授权仅 VN1（12831）一次完整生产 CLI 导出。沿用 pool-3 当前 `.venv`、原 CLI、桌面配置、固定筛选及异常机制，命令仍为 `uv run --frozen --no-sync lxeskill mabang-tms products export --warehouse VN1`。未执行 PH1/all、未重新提交同一批导出、未重复下载或再次启动本轮任务。

- 结果 **partial_success**、`ok=false`、退出码 4。第 4 批下载在 HTTP 响应返回前再次发生 `download_network_error` / `SSLError` / `UNEXPECTED_EOF_WHILE_READING`。现有机制停止，仅保留已验证的前 3 批；无认证异常、429 或观察到的数据校验失败。TLS 中断根因仍未验证，未修改任何网络或下载配置。
- 实际 **13 次请求**：登录 1、列表 4、导出 4、下载 4；12 次 HTTP 200，1 次下载 TLS 异常，没有重试。列表页码 1～4，各 1000 条、`pageSize=1000`、`totalNum=4208` 稳定，顶层仓库均为 12831，4000 个记录 ID 无页内或跨页重复；每批导出的 ID 顺序与当前页列表完全相同。`pop.totalPage` 依次 1～4，未引起错误分页结束；第 5 页未请求，完整分页仍 **NOT VERIFIED**。
- `read_unique_ids=4000`，`exported_unique_ids=3000`，`remaining_records=1208`，`completed_batches=3`。最终 Excel 3000 行、2990 个 SKU，5 个重复 SKU 分别为 2、2、3、4、4 行，共 10 条额外库存记录，均保留。仓库列只有“越南VN1仓”。21 项只读核验通过，覆盖全部已交付行与原始 3 批的单元格值（空值规范化）、顺序、完整行重数、SKU/仓库重数、记录/批次数、仓库范围、无公式/错误单元格、命名和交付路径一致；不以此证明未完成部分。
- 表头 12 列一致：库存SKU、30天销量、7天销量、可用库存、15天销量、仓库、库存量、在途量、成本价、采购价、入库时间、90天销量。文件名正确标明“越南VN1仓-部分导出”，不含“合并”，`files` 与 `artifacts[].path` 相同。
- 交付路径：`var/workspace/.lxeagent/artifacts/mabang_tms/exports/a410a5b5c960cb8e68d0ae93d0aebc48848273bc04d175a332949bc12a935c0a/6a4723214df64a17bf5fae5b08693b95/马帮TMS-商品-越南VN1仓-部分导出-20261016-180309.xlsx`。136693 字节，SHA-256：`02767a89c28f98e42a9940fb0e58945da2496dbd11d0a4d5caf8e3d76f49c4a3`。本轮请求元数据及本地核验记录位于 `/private/tmp/lxe-tms-vn1-production-acceptance-2`，不保存或输出认证凭据及敏感下载链接。

## VN1 两轮 TLS 异常最终本地对比

本轮仅比较已有本地记录、当前下载客户端及 Requests/urllib3 源码，并做禁止 DNS/外网连接的离线回放；没有生产访问，没有重新提交 export POST。仅更新本 handoff，其余 15 个已有任务文件（含测试）保持原样；两份已交付部分 Excel 的 SHA-256 仍与原核验记录一致。对比元数据位于 `/private/tmp/lxe-tms-vn1-final-tls-diagnosis/comparison.json`，不含凭据、完整签名 URL 或业务记录。

| 观察项 | 第一次 | 第二次 |
| --- | --- | --- |
| GET 成功/失败 | 1/1；第 2 批失败 | 3/1；第 4 批失败 |
| HTTP 请求总数 | 7 | 13 |
| 已交付/接口总数 | 1000/4208 | 3000/4208 |
| 整轮墙钟耗时 | 17.407 秒 | 30.282 秒 |
| 失败位置 | Session.send 返回 HTTP 响应前 | 相同 |

成功与失败均走允许的 `tms-cos.mabangerp.com` HTTPS 文件域名；成功 GET 返回 200，失败 GET 没有响应状态。原调用 `allow_redirects=False`，两轮未观察到下载重定向。每次 GET 是独立 Session、默认 adapter 零重试，未共享 POST Session/Token/Cookie；两轮均未重复请求失败链接。异常摘要均为 `requests.SSLError` 包装 urllib3 `MaxRetryError` / `SSLError`，内含 `ssl.SSLEOFError(8)` / `UNEXPECTED_EOF_WHILE_READING`，不是记录到的 Timeout、DNS 解析失败或证书验证失败异常。

**证据边界**：整轮耗时包含登录/列表/导出、请求间隔、GET 和本地文件处理，不能当作失败 GET 耗时。旧观测器没有逐请求时间、DNS/TCP/TLS 阶段、对端地址或完整堆栈，stderr 为空，不能补造这些信息。离线使用真实 Requests/urllib3，分别在 `_validate_conn` 和 `HTTPSConnection.getresponse` 注入同形 SSL EOF，两次均得到相同异常摘要、单次调用且零 DNS/外网连接；这只证明摘要不能唯一定位真实中断阶段，不证明线上两种情形均发生。响应返回前失败说明本次并非 `iter_content` 已接收正文后抛错，但不据此确定握手或响应头阶段。

**客户端判断**：没有发现必须修改的 TLS、Session、代理、DNS、超时或流式处理缺陷。当前连接/读取预算 5/30 秒、证书验证开启；前次本地配置检查无环境/系统代理及自定义 CA，但失败时完整网络路径和 DNS 所选节点仍 **NOT VERIFIED**。不能仅据 SSL EOF 归责服务端、代理、某一 IP 或本地 TLS，也不调整证书校验、DNS/地址族、代理、连接复用或超时。

**重试合同**：两次失败摘要里的相对文件路径未显示查询参数；这不能证明链接无时效或允许重复读取。没有对同一链接重复 GET 的轨迹、有效期/一次性限制或平台兼容说明。即使两轮第 1 批文件字节相同，也是不同导出执行的结果，不能作为同一 URL 可重放证据。保持下载不自动重试。

2026-10-16 诊断环境为 Requests 2.32.5、urllib3 2.6.3、OpenSSL 3.0.16。离线用真实 Requests/urllib3 回放流中断与 Content-Length 不符，验证错误传播、响应关闭、仅一次 GET 及此前批次保留；没有复现或证明线上 TLS 根因。

## 下载 GET 安全日志补强（2026-10-16）

复用 `shared.logging.get_logger` 和原 stderr/runtime-py.log 处理器，不创建新日志系统。每个实际 GET 结束记录 `service=mabang_tms_file`、`elapsed_ms`、`http_status`、`stage`、`exception_type`、`reason`。耗时从限速结束到下载完成/失败，包含流读取，不包含 POST 或 Excel 处理；未取得 HTTP 响应时为 null / `unknown`，不推测 TLS 阶段。其余阶段为 `response_headers`、`response_body` 或 `completed`；GET 完成不等于业务导出成功。

实际异常原因沿用 `self.safe` 脱敏和截断，额外移除完整/相对下载地址及 Requests `url:` 形式；不传原异常对象、不写 exc_info、Token、密码或签名参数。日志失败不覆盖下载结果或原异常。原有 TLS 证书验证、代理、超时、独立 Session、GET/POST 不重试及部分成功合同均不变。

禁网离线回归及隔离 runtime-py.log 处理器检查证明日志不改变正常结果或 SSL 异常，URL/签名已脱敏；测试数见历史表。日志可帮助确认下次 GET 耗时、有无 HTTP 状态和正文读取阶段，`unknown` 不能定位 DNS/TCP/TLS/响应头等待。

## 剩余依赖、验收与评审顺序

- Runtime PR #9 仍未合并。对最新 main 的只读合并模拟确认仅 `docs/harness/tool/ask-user-question.md` 内容冲突，Runtime 源码和测试可自动合并；本轮未修改该分支。先完成其独立设计评审与获批集成，再回归本任务已确认的提问独占要求并去重重叠测试。
- [上游审查说明](https://github.com/LXE123/LXE_AGENT/pull/95#issuecomment-6265254194) 已撤回此前 P1 定级及“必须合入前修复”的建议。该审查只针对 `785ad37b`；评级变化不等于两个行为用例通过，也不取消本任务已确认的提问独占目标，不把它描述为本 PR 新引入的公共 Runtime 回归。
- 单次 VN1 全部 4208 条交付、TLS EOF 根因、PH1/all 新选仓参数下的完整生产导出仍 **NOT VERIFIED**。两次生产授权已使用完毕；无链接有效期/重复 GET 合同证据，不增加重试、不重放旧链接或自动启动新任务。
- 真实模型的来源/仓库澄清、选择、跳过、取消及跨渠道交付仍需逐项验收。现有用户手工测试反馈和固定模型轨迹分别说明，不冒充全部场景已验证。
- Arsenal #11 已记录验证和限制；上游 #95 说明尚缺最新测试、Runtime 依赖及两次部分交付事实，需另行授权更新。TMS 可独立代码评审，当前不能称全绿或完整生产验收通过；正式集成时对当时 main 做必要回归。

## 本轮文档收敛（2026-10-20）

本轮仅收敛本 handoff 和验收说明：将重复阶段记录归并到历史表，保留两次生产请求计数、文件路径/散列、内容核验、TLS 证据和当前依赖。仓库 ID、分页、Excel、Skill/catalog/CLI、下载日志、认证、附件及两个 Runtime 失败回归均未修改；无新增入口、命令、抽象或测试框架。

本轮一次性文档/范围核对 27 项通过：两次生产验收核心段落与原提交逐字一致，4 处本地链接引用（3 个目标）均有效，16 文件清单与实际 diff 一致，其余任务文件未变；`git diff --check` 通过。没有新增测试文件或重跑业务全量测试。

用户随后授权将两份收敛文档提交、推送至原 TMS 分支并更新 Arsenal 草稿 PR #11。仅追加 docs 提交，不改 main、Runtime 或既有业务提交，不合并 PR；新提交 hash 及推送结果以本轮 Git/PR 记录为准。上游 #95 使用同一 head 分支，代码随推送更新，其说明和合并状态不在本轮操作范围。

本轮未访问生产；当前仓库文件清单见上，原始业务验收说明见 [实现与验收](../acceptance/mabang-tms-export-validation.md)。
