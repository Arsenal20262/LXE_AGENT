# 本地数据与存储

## 先说结论

Electron / Gateway、agentcli 和 lxeskillCLI 分别管理自己的数据，通过约定接口协作，不把其他模块的数据库当作集成接口。数据库按职责分开；各模块内部的并发访问由其存储实现管理，不代表每个数据库只能由一个操作系统进程写入。

会话正文也不放在 SQLite 里，而是写入 append-only 的 Transcript v2 JSONL。SQLite 保存适合查询和更新的状态，JSONL 保存按时间追加的会话事件。

## 当前存储分工

| 文件 | 所属模块／维护方 | 保存什么 |
| --- | --- | --- |
| `db/gateway.sqlite3` | Electron Main / Gateway | Gateway session、平台来源和 response route |
| `db/agent.sqlite3` | 私有 `agent-cli` / Runtime | Agent session（含独立的 `permission_mode`）、pending event、usage、模型信息和 transcript 索引 |
| `db/exec-sessions/<thread-id>/agent.sqlite3` | 一次性 `agent-cli exec` / Runtime | 单个 CLI thread 的 session、usage、模型信息和 transcript 索引 |
| `db/lxeskill.sqlite3` | lxeskillCLI | 业务状态与可丢弃的紫鸟会话缓存；浏览器真实状态以紫鸟客户端实时接口为准 |
| `db/sessions.json` | Gateway | 平台 source 到 session id 的稳定绑定 |
| `db/session_transcripts/<session>.jsonl` | Runtime | 原始消息、turn metadata 和 `context_patch` |
| `db/machine_identity.json` | Desktop 与 agentcli 用量同步服务（共用 Core 实现） | Cloud、WireGuard 和可选 Data Server 共用的本机身份 |

表中路径均相对于宿主实际使用的数据目录。Desktop 的默认位置、`LXE_DATA_ROOT` 和升级迁移统一见 [程序与用户数据](../desktop/data-location.md)；不要按程序安装目录推导数据库位置。

每个持久化的 CLI thread 还在自己的目录内使用 `session_transcripts/`，并用独占锁保证同一时刻只有一个 `exec resume` 写该数据库。`--ephemeral` 改用系统临时目录并在结束时删除。独立 CLI 的目录参数与默认值见 [Agent CLI exec](../harness/runtime/agent_cli_exec.md#会话与存储)。

测试 fixture 或旧源码环境里仍可能出现 `local_agent.sqlite3` 这个文件名；它不是 Desktop 当前默认的单库布局。

## 为什么要拆开

- Gateway 必须在 Runtime 重启时继续知道消息来自哪里、结果应该发到哪里。
- Runtime 需要独立维护模型上下文、pending event 和 usage。
- lxeskillCLI 按需启动业务命令，独立管理业务数据与配置。
- 数据归属清晰，模块协作不依赖对方的表结构或存储布局。

Gateway 创建 session 时，会同时让 Gateway store 和 Agent store 建立对应记录；response route 留在 Gateway，pending event 留在 Agent。两边通过稳定的 session id 关联，不通过共享 SQLite 表通信。

## Transcript v2

普通 user、assistant 和 tool 消息按顺序追加到 JSONL。压缩、修复或重置上下文时，Runtime 追加一个最小 `context_patch`，只说明当前模型视图中哪一段要删除、插入什么内容。

旧行不会被回写，因此 Dashboard 可以保留完整审计展示；模型 replay 则按顺序应用 `context_patch`，得到下一次请求真正使用的短历史。两种视图都来自同一个 transcript，但用途不同。

详细事件格式和兼容规则见 [Context Persistence](../harness/runtime/context/context_persistence.md)。

## 一致性与安全

- session、route、pending event 和 usage 更新使用各自数据库事务。
- tool call 与 tool result 必须在 transcript 中保持闭合。
- 轻量查询只读 SQLite metadata；需要模型历史时才 replay transcript。
- 数据归属见 [架构简介](../architecture/README.md#3-数据归属)。工具的文件写入范围由 [权限策略](../harness/runtime/permission-policy.md)控制；数据目录不另设统一写保护，位于所选工作区内的应用数据也进入工作区写入范围。
- 公司身份和集成凭证由桌面安全存储保存；用户本地模型 Key 明文写入数据目录下的 `config/auth.json`。具体存储与访问规则见 [桌面配置](../desktop/README.md#桌面配置与安全)。
- Workspace Skill、AGENTS Instructions 和搜索服务只做进程内缓存，不新增数据库表或磁盘解析缓存。

待回答问题及其唤醒回调只存在 Bun Runtime 内存中，问题和最终工具结果进入会话历史。界面刷新重新查询当前问题；Agent 重启不会恢复旧等待，未闭合调用沿用历史修复机制处理。详见 [结构化提问](../harness/runtime/tools/ask-user-question.md)。

## 备份与恢复

手工迁移或修复前，先完全退出 Desktop，再一起备份整个 `db/` 目录。只复制某一个 SQLite 或只复制 transcript，可能让 session、route 和历史互相对不上。

恢复后至少检查：

1. Gateway 能找到原 session 和 response route。
2. Agent 能 replay transcript，且最近消息与 Dashboard 一致。
3. pending event、usage 和 transcript 索引可以正常读取。
4. 三个 SQLite 都没有 integrity 或 lock 错误。

优先使用带备份和完整性检查的迁移脚本，不直接手改数据库行或 JSONL。

## 排障顺序

消息路由错误先看 `gateway.sqlite3` 和 `sessions.json`；模型历史错误看 transcript 与 `context_patch`；后台任务或 usage 错误看 `agent.sqlite3`；紫鸟会话状态错误再看 `lxeskill.sqlite3`。

当前路径装配见 [Desktop Gateway](../../apps/desktop/src/main/desktop-gateway.ts)，Transcript 实现见 [Runtime storage](../../packages/agent/runtime/src/state/storage.ts)。
Machine identity 的唯一实现见 [Core machine identity](../../packages/foundation/core/src/machine-identity.ts)；移动代码不会迁移或重写现有 JSON 文件。
