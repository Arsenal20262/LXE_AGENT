# 会话权限与工作区目录

第一阶段已经建立会话权限状态和统一策略解析，并切换了新产物位置。当前实际执行能力仍是 Full access；没有文件系统沙箱、网络隔离、单次审批或模式选择 UI。

## 会话策略

Bun 的 `agent_sessions.permission_mode` 保存模式。新建普通会话、空白会话和历史数据库升级均默认 `danger-full-access`。已有模式在再次接收消息和重启后保持不变。内部存储接口 `getSessionPermissionMode` / `setSessionPermissionMode` 独立于 `source` 和工具 `state_patch`；Python 不读写 Agent 数据库，也不接收其路径环境变量。

`PermissionPolicyService.resolve` 接收会话状态以及宿主装配的路径，返回以下约定：

| 模式 | 审批策略 | 工具文件写入根 | 当前可执行 |
| --- | --- | --- | --- |
| `read-only` | `ask` | 无 | 否 |
| `workspace-write` | `ask` | 固定工作区、该会话的工具临时目录 | 否 |
| `danger-full-access` | `never` | 不施加文件沙箱 | 是 |

解析本身不创建目录、不修改会话、不发起审批。回合开始时检查模式；每次工具调用前重新读取会话并解析策略，随后传给工具，包括 native 和 MCP 调用。若读到受限模式，明确返回执行后端尚未实现的错误，不降级成 Full access。内部模式存取不暴露为 Dashboard RPC 或模型工具。

会话的 `workspace.directory` 是固定的目录边界。即使它只是仓库子目录，也不扩展到 Git 根。`workspace.worktree` 继续负责 Git、指令加载和开发依赖定位；改变 `exec.cwd` 只改变命令运行位置。当前 Full access 仍可访问宿主用户有权访问的其他目录，边界诊断不是保护机制。

## 路径及属主

下表中的 `var` 指宿主配置的 `LXE_DATA_ROOT`。Desktop 默认工作区保持 `var/workspace/`；用户选择外部目录时，产物跟随所选目录。

| 路径 | 属主和用途 |
| --- | --- |
| `var/db/` | Runtime 的 Agent DB 与 transcript；Gateway DB；Python 独立的 `lxeskill.sqlite3` 和业务状态，各有自己的属主 |
| `var/config/` | Desktop 配置、凭据及各服务配置；Runtime 维护技能开关等配置 |
| `var/logs/` | 各宿主与 Python 日志，沿用原日志清理规则 |
| `var/inputs/` | 长期输入素材，仍由现有素材服务与 CLI 维护 |
| `var/lxeskill/` | Python CLI 内部状态，不改名为产物目录 |
| `var/cache/`、`var/electron/` | 文件预览缓存与 Electron 状态，保持原路径 |
| `var/tmp/tools/<runtime>/<session>/` | Runtime 在启动工具命令前创建，供该会话的子进程临时文件使用 |
| `var/tmp/exec/<session>/` | Runtime 保存命令输出；沿用输出保留与清扫规则，不依赖 Git 根或命令 cwd |
| `<workspace.directory>/.lxeagent/artifacts/` | Python 业务输出；按 catalog 的业务模块和数据集目录组织，同工作区的会话共享 |

`<runtime>` 为策略服务实例生成的 UUID，`<session>` 为会话 ID 的 SHA-256，避免任意 ID 成为路径片段。工具临时目录与命令输出目录各司其职：后者由宿主写入，不列入受限工具的写入根。第一阶段不新增后台临时目录回收器；残留临时文件按应用维护需求清理，不能删除仍运行会话的目录。

模型最新 `environment_context.artifact_root`、文件工具的目录识别和 Python 的 `artifact_root()` 都指向当前工作区产物根。`exec` 下发 `LXE_WORKSPACE_ROOT` 为会话所选目录，统一覆盖 `TMP`、`TEMP`、`TMPDIR`；开发环境的 Python/`.venv` 仍按 worktree 定位。

独立 Python CLI 没有显式 `LXE_WORKSPACE_ROOT` 时使用调用者 cwd。无会话的宿主维护调用、素材导入及合成形象调用显式传入默认工作区；其应用内部状态仍留在 `var`。已有 `activate_external_workspace` 接口的 `.lxeskill` 内部状态约定保留，产物也使用新的 `.lxeagent/artifacts`。

## 真实路径诊断

策略解析按真实路径比较包含关系，包括尚未创建目录的已有父路径、符号链接目标和 `..`；Windows 按其路径分隔符、盘符和大小写规则比较。相似字符串前缀不代表目录包含。

默认 `var/workspace` 与 `var/db` 等私有目录不重叠。选择整个仓库作为工作区时，会报告它包含应用私有目录和宿主临时目录。产物链接到工作区外、临时目录链接越界、工作区或临时目录与私有数据重叠也会产生诊断。除默认私有目录外，宿主还注入配置覆盖的数据库和配置路径。

Full access 下诊断只记录事实，不阻止执行。受限模式尚未接入时统一拒绝执行；后续沙箱必须保护这些路径，否则继续拒绝。路径解析也不能解决检查后被替换的符号链接等竞争，实际安全保证必须落在执行后端。

## 历史数据

Desktop 首次升级启动时，会在 Agent 和 Python 启动之前，把旧 `var/artifacts/` 一次性复制到默认工作区的 `var/workspace/.lxeagent/artifacts/`，保持业务目录结构。已有目标文件优先，只补齐缺失项；目录与文件冲突也保留目标项，不沿目标符号链接写入。此迁移只处理默认工作区，外部工作区不自动导入旧数据。独立 CLI 不触发这项 Desktop 升级迁移。

复制先写入目标旁的专用暂存目录，完整文件就绪后再发布；中断后下次启动重试，不把半个文件当作已完成产物。全部成功后，在 `var/migrations/default-workspace-artifacts-v1.json` 原子记录完成，之后即使删除新产物也不会重新导入旧数据。没有旧目录的新安装同样记录完成，并且不再创建旧全局产物目录。失败时显示实际错误并停止启动，不记录完成；修复原因后重新启动即可重试，无需迁移 UI。

旧目录始终保留，历史附件继续按原绝对路径打开，不修改数据库、附件记录或文件内的路径引用。新业务只使用当前工作区的数据集，不回退查找旧目录，也不自动改名旧业务数据集目录。

## 接入沙箱前仍需处理的依赖

CLI 初始化目前会创建内部状态、产物和输入目录；日志初始化会写日志并执行清理；业务命令可能打开 Python DB、写认证缓存和锁文件。某些配置的原子替换临时文件必须与目标文件同目录，设置 `TMPDIR` 不会改变这些写入。

因此不能按命令名字宣称“只读”。后续需要将宿主状态写入与受限工具执行拆开，或用明确的宿主代理接口完成。共享 MCP 服务、维护进程、浏览器及其驱动也有独立生命周期，不能仅靠 exec 环境变量获得会话沙箱。当前只允许 Full access 运行，后续逐一接入这些执行入口后才能开放受限模式。
