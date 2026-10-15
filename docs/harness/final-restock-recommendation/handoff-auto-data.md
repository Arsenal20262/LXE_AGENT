# 最终备货建议：自动取数衔接交接

## 范围与工作区

- 分支 `codex/final-restock-auto-data`，Pool `.worktrees/pool-7`；原从 PR3 `63672882` 创建，现以 PR3 `82f4f7a0` 为上游，自动取数提交重放为 `c0d10ac8`，后续 fix 见本分支 Git 记录。依赖链为 main → PR1 → PR2 → PR3 → 本次修改。
- 本轮仅调整新 Skill 的自动取数编排、普通备货 Map 的转介描述、Skill 清单和两端定向契约测试。保留 PR1–PR3 的公式、服务、catalog 四项文件输入契约及 Runtime；不新增命令或数据源。
- 本轮经用户授权仅完成本地 Commit，不 push、merge，也不连接生产 ERP。

## 入口与调用链

用户说“帮 Amazon-Test 生成最终备货建议”时，`replenishment-final-restock` 现在默认按本轮取数：

1. `replenishment-store-resolve` → `lxeskill replenish store resolve`，取得规范店铺、`store_id`、`id_type`。
2. `mabang-store-msku-export` → `lxeskill mabang store msku export`，取得本轮 `data.xlsx_path`。
3. `mabang-store-shenzhen-inventory-export` → `lxeskill mabang store shenzhen-inventory export`，取得报告及它实际使用的 `source_msku_xlsx_path`。后者必须指向步骤 2 的文件，否则停止。这个导出命令按店铺选本地最新源表，因此核对是必要的。
4. `mabang-store-unlinked-shipments-export` → `lxeskill mabang store unlinked-shipments export`，取得三个状态完整成功的 `data.snapshot.snapshot_xlsx_path`。有效空快照可用，失败不能当零货件。
5. `lxeskill replenish final-restock generate`，传入规范店铺和以上三个实际路径；原服务核验文件指纹、店铺、批次、快照、MSKU 覆盖及数值，再生成并重算 34 列 XLSX。仅发送最终 terminal `files`。

用户明确指定整套离线文件时，仍可直接调用底层计算。普通备货继续进入旧流程；不为新流程运行旧销量分析或旧 `replenish calculate`。失败保留真实诊断，不寻找历史文件，不要求用户自行准备三个路径。

## 验证与限制

以下是 `ba543ed0` 自动取数衔接提交时的验证记录；后续真实验收和当前离线回归以文末相应章节为准。

- 从本 worktree 根运行，Python 新 Skill 契约 `16 passed`；最终工作簿、来源核验与深圳库存相关定向测试 `69 passed`；Bun Skill 发现及 CLI 归属 `25 passed`；Runtime 技能激活与命令归属定向测试 `1 passed`；`lxeskill doctor` 返回 `ok=true`，47 catalog 命令、38 个 Skill 文件。
- 使用项目现有 DeepSeek provider 和当前 Skill 目录做真实模型隔离演练：店铺名成功场景选择新 Skill，依次产生 5 条命令并模拟发送最终文件；深圳报告引用旧源表时止于第 3 步；货件快照返回失败时止于第 4 步；普通备货选择旧 `replenishment-workflow-map`。演练中的 `exec` / `send_files` 返回合成终态，不执行 ERP 或真实文件发送。脚本与结果位于 `/private/tmp/final-restock-auto-model-test.ts`、`/private/tmp/final-restock-auto-model-result.json`。
- 另一次相同真实模型演练将前四步取数替换成已有合成文件终态，第五步实际执行本 worktree 的离线 `lxeskill replenish final-restock generate`：退出 0、`ok=true`，生成文件实际存在，`mskulist` 为 34 列、表头加 4 行数据；`send_files` 仍为模拟。结果位于 `/private/tmp/final-restock-auto-model-cli-result.json`，输出位于 `/private/tmp/final-restock-auto-cli-output`。这证明模型参数传递接上了真实底层计算，不证明 ERP 实时取数或 Desktop 实际发送。
- 真实马帮取数、正式 Desktop 对话中的完整执行、真实业务 Excel 及附件发送：**NOT VERIFIED**。全量测试、build/typecheck、Windows 原生与 Microsoft Excel 原生重算：**NOT VERIFIED**。定向工作簿测试使用现有 Office Kit，不能替代这些验收。
- 不增加环境变量。实际取数仍依赖现有马帮登录态、`LXE_DATA_SERVER_URL` / `LXE_DATA_SERVER_API_KEY`；计算继续依赖现有 `LXE_OFFICE_NODE` / `LXE_OFFICE_CLI` 配置。不得在失败后绕过凭据或源数据校验。

## Git 与下一步

- 此处记录原始提交状态：自动取数衔接当时提交为 `ba543ed0`，父提交 PR3 `63672882`；当前同步后的提交及差异以文末最新章节为准。
- 本节记录原提交时的验证和下一步；后续真实交付、剩余风险与当前同步结果见文末。

## 2026-10-14 深圳库存导出失败最小修复（离线修复记录）

- 真实记录：YHQUS 经确认对应 `Amazon-Yihaiqian-US`；本轮 MSKU 下载 2003 行，1979 行核验通过。13:54–13:56 深圳库存导出三次返回同一 HTML 业务错误“查询条件已被新的搜索覆盖，请重新搜索后再导出”。货件快照、最终计算和交付未执行。原始会话记录在本机 `var/db/session_transcripts/e6c656dc0f364ba0be1c9b22f65627fb.jsonl`，不提交业务记录。
- 已确认的代码缺口：搜索可选 JSON 检查把非 JSON/空响应当作成功继续；下载仅检查 HTTP 状态及非空，将 HTML 写成 XLSX，真实业务错误被后续 `BadZipFile` 遮住。搜索到导出已有本地进程锁；没有搜索响应记录，不能认定其他用户操作、缺少接口参数或 Cookie 状态变化是根因。搜索表单和导出 URL 本轮不猜改。
- 重复调用位置：会话模型在收到 `ok=false`、`auth_refresh_required=false` 后再次调用同一库存 CLI（其中一次等待 70 秒后再执行）；服务本身只有认证异常才进入既有恢复分支。未增加 Runtime 或持久化调用拦截机制。
- 最小修改：`store_msku_actual_inventory.py` 复用 `_read_json_response`，要求搜索明确 `success=true`；删除宽松的 `_read_optional_json_response`。私有 `_warehouse_response_diagnostic` 使用既有 BeautifulSoup 与 `official_api.diagnostic` 提取可见原文、脱敏并显式截断；`download_warehouse_stock_xlsx` 在写文件前检查 ZIP/XLSX 容器及 CRC，失败不创建/覆盖 XLSX，沿用现有业务异常与 CLI 终态（`ok=false`、`auth_refresh_required=false`、`files=[]`）。原有来源指纹、批次、店铺、快照及覆盖校验均保留。
- Skill：仅补充现有最终备货及深圳库存 Skill 的非认证失败立即结束规则，明确不得等待后重复导出、改写命令重试或刷新认证；不要求用户自行准备三个文件。未新增 Skill、CLI、参数或重试框架。
- 修改文件：上述 Python 服务；两份现有库存/CLI 测试；真实 HTML fixture（仅规范行尾及末尾空格）；两个现有 Skill；现有 Bun Skill 契约测试；本 handoff。
- 定向验证：新增回归先在旧实现观察到失败；修复后 Python 八个相关测试文件 `199 passed`（库存、CLI、来源存储/核验、组合商品、最终工作簿及新 Skill），Bun Skill/命令契约 `25 passed`。用 pool-7 已准备 Office Kit 完成合成工作簿重算；合法库存下载字节不变，搜索失败不进入下载，业务错误只执行一次搜索/导出且不刷新认证；CLI 原文、空附件、认证标记均有离线验证。`git diff --check` 无问题，HTML fixture 另行检查行尾。
- 验证边界：本轮全部使用已落盘错误文件及模拟 HTTP，不新增生产 ERP 请求，也不调用真实模型。服务停止/不认证重试已验证；修改后的真实模型是否持续遵守停止规则、搜索条件失效的具体原因、线上库存成功导出、后续真实货件/计算/交付、全量测试及 build/typecheck 均为 **NOT VERIFIED**。真实复测需重新读取当前 Skill，并在明确允许生产取数后保留脱敏搜索响应与紧接的导出响应以进一步定位。
- 可删减性复核：删掉原有宽松响应解析器，复用现有严格解析和诊断；仅新增一个本模块私有诊断函数，供搜索与下载两个错误边界共用。未新增公共抽象、下载入口或状态层。

## 2026-10-14 搜索状态覆盖复核（离线记录）

- 14:36–14:41 的真实桌面会话 `ca7fb3cea5224384b3e52e86f14984d4` 再次取得本轮 MSKU（2003 行、1979 行核验通过）；库存搜索的 `success=true` 后，导出仍返回“查询条件已被新的搜索覆盖”。HTML 原文进入 CLI 错误，`ok=false/auth_refresh_required=false` 后模型停止，未查询货件或计算。此复测发生在本节诊断日志新增之前。
- 服务与运行代码来自 pool-7；该会话绑定的工作区仍是从 pool-6 复制的旧路径。已通过桌面设置把**新会话默认工作区**改为 pool-7 的 `var/workspace`，保存前后除 `workspace_root` 外的设置摘要一致；旧会话记录不迁移。尚无证据表明旧工作区路径导致马帮服务端搜索状态覆盖。
- 巴西同端点成功流程为 `searchwarehousestock` → `getSearchWarehouseStockPage(page=1,rowsPerPage=50)` → `doexportwarehousestock`，同一 `BrazilClient` 及登录态，并核对列表总数和导出文件；Amazon 为搜索 → 直接导出，两次分别读取现有认证。巴西查询页用于获取、核验总数，现有记录不能证明它是导出必需的状态写入，因此未擅加接口。两流程的仓库、过滤表单、认证读取方式和重定向处理也不同，不能只归因于缺少中间请求。
- Amazon 的搜索与导出位于同一个库存导出锁内；本模块中间没有再次搜索。此次会话在该阶段只发起一次库存命令；两次认证读取日志均为已有文件来源，未见认证刷新。程序以外的会话是否覆盖，以及两次 Cookie 值是否相同，现有日志无法证明。
- 只在现有搜索/下载边界补充日志：复用 `auth_audit.log_auth_material_consumed` 记录 Cookie **名称**及共享会话 CookieJar 状态；记录仓库 ID、SKU 数、搜索 `success` / `pageHtml` 形状、HTTP 状态、导出内容类型白名单、字节数、ZIP 候选、重定向数及响应是否设置 Cookie。不记录 SKU、Cookie 值或响应正文；原始业务错误仍按原契约脱敏返回。没有新增接口、延时、重试或刷新。
- 修改文件仅为已有库存服务、对应定向测试和本 handoff（本节此前未提交的 HTML/停止修复仍在同一工作区）。新增日志的正常 XLSX、HTML 错误与敏感值不入日志测试通过；从 pool-7 根执行两份库存定向测试 `30 passed`。初次执行因沙箱无法写默认 uv 缓存而未运行，改用 `/private/tmp/uv-cache-pool7-debug` 后通过。全量、真实生产导出与后续交付仍 **NOT VERIFIED**。
- 下一次经明确授权的受控测试应新建 pool-7 默认工作区会话，只观察：搜索/导出两次认证材料名称与来源、CookieJar 是否为空；搜索 `success` 和 `pageHtml` 状态及服务端是否 `Set-Cookie`；两次请求的 HTTP 状态/重定向及导出 MIME、ZIP 判定；模型是否在业务错误后停止。若仍不能定位，再考虑更窄的同轮会话连续性诊断，不直接把中间页请求当修复。
- 可删减性复核：新增内容只有两处请求边界日志与复用既有认证审计；没有新客户端、状态、路由或通用重试层。列表页调用因必要性证据不足而未加入。

## 2026-10-14 搜索与导出 Cookie 连续性修复（离线修复记录）

- 最新真实测试在 pool-7 新会话中仍止于库存导出：搜索 HTTP 200、`success=true`、`pageHtml=false`、无重定向且响应有 `Set-Cookie`；紧接的导出 HTTP 200 但为 HTML，原文仍是“查询条件已被新的搜索覆盖”。两次认证来源均为本地状态文件，Cookie 名称相同，共享 CookieJar 均为空。日志未记录响应 Cookie 名称或两次 Cookie 值是否一致，所以不能断言此缺口就是马帮业务错误的完整根因。
- 可确认的 HTTP 状态传递缺陷：现有 `erp_http_session` 刻意使用 `DummyCookieJar`，搜索响应 Cookie 不会入共享会话；原代码导出前又重新读取认证文件并构造显式 `Cookie` 请求头，搜索响应的 Cookie 更新必定丢失。搜索与导出均在同一个 `warehouse_export_lock` 内，本模块中间没有其他搜索；上次真实请求两边无重定向，亦无认证刷新证据。
- 仅在 Amazon 库存服务内修复：搜索成功后使用短命 `aiohttp.CookieJar` 按响应 Cookie 的域名和路径筛出适用于导出的更新，并在内存中合入原显式 Cookie 请求头；导出沿用该同轮请求头，不再为这一对请求重新读取认证。没有更改共享 HTTP 客户端、认证状态文件、搜索/导出接口、重试或 CLI。响应没有适用更新时，原请求头保持不变。
- 诊断只记录搜索响应 Cookie 名称、实际转发名称及请求头是否变化，不记录任何 Cookie 值、Token、SKU 明细或响应正文。原有 HTML 业务错误保真与失败立即停止规则保留。
- 回归先看到新增会话 Cookie 测试在原实现失败，修复后通过。本 worktree 根执行库存服务、CLI、来源核验及组合 SKU 五份定向测试：`176 passed`，其中本机 `localhost` 模拟服务以真实 `aiohttp.ClientSession(DummyCookieJar)` 验证搜索 `Set-Cookie` 到导出请求的传递；还覆盖无更新、不相关域名、过期 Cookie 不再发送、合法 XLSX、HTML 业务失败及无认证重试。沙箱禁止绑定本机端口，模拟服务测试经工具批准在沙箱外运行；全程只连本机，不连接马帮。
- 仍待真实验证：马帮本轮设置的是哪些 Cookie 名称、修复后哪些名称实际转发、导出是否变为 XLSX，以及后续货件/最终计算/交付。若仍返回同一业务错误，凭这些脱敏字段可判定此修复是否触及实际服务端会话，再继续定位；不得把离线模拟结果写作生产成功。

## 2026-10-14 Amazon 库存搜索令牌传递修复（离线修复记录）

- 新的网页源码证据：成功搜索后页面将响应的 `r.searchToken` 保存为本轮导出令牌，导出 URL 会追加 `searchToken` 查询参数；此前 CLI 只传递同轮 Cookie，未提取或发送令牌。历史少量 SKU 成功记录未携带此参数，不能单凭离线修复断言线上失败已解决。
- 仅在现有 Amazon 库存服务中，从成功搜索响应校验非空字符串 Token，与同轮 Cookie 一起传给紧接的导出，使用既有 `yarl.URL` 编码追加查询参数。缺失或无效 Token 在导出前按现有业务错误终止；不缓存、不重试、不记录 Token 值。原有 HTML、XLSX、Cookie 与来源校验保持原样。
- 修改文件：本 handoff、`store_msku_actual_inventory.py`、库存服务和 CLI 两份测试，以及三个直接模拟库存搜索返回值的既有测试。新增回归在修复前复现缺少查询参数和缺失 Token 仍进入导出；修复后相关七份测试文件 `244 passed`（本机模拟 HTTP 仅连接 localhost）。真实马帮导出、货件、最终计算与交付仍 **NOT VERIFIED**；本轮不调用生产 ERP，不暂存或提交。
