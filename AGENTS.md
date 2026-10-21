# AGENTS.md — AI 编码代理须知

## 项目地图（30 秒版）

- **Electron**：面向用户的应用入口。`apps/dashboard` 提供桌面界面，`apps/desktop` 负责主进程、侧栏与文件预览、系统集成、配置和进程管理，`apps/gateway` 负责渠道接入、任务调度和结果交付。
- **agentcli**：独立的 Agent Harness。`apps/agent-cli` 是命令行宿主，`packages/agent/runtime` 是 Bun Agent 执行核心，负责模型调用、上下文、工具、会话、执行权限和统计。
- **lxeskillCLI**：`python/lxeskill_cli` 中按次启动的业务 CLI，通过 `lxeskill` 暴露业务命令，独立管理业务数据、配置和文件产出。
- **Skill**：`skills/` 存放通用和业务指引，为模型提供任务知识与工作上下文。
- **文档**：[README](README.md#架构) 提供整体架构，[docs/README.md](docs/README.md) 是专题入口；`docs/harness/` 包含运行时、CLI 契约和外部平台参考。

## 模块协作与 Skill 工作上下文

- Electron 与 agentcli 通过 **JSON-RPC 2.0** 通信，使用 stdin/stdout 传输。
- Electron 通过 lxeskillCLI 暴露的命令调用业务能力；标记为 `internal` 的集成命令也属于 CLI 契约，不等于直接调用内部模块或函数。
- 对 agentcli 而言，lxeskillCLI 与其他外部 CLI 一样，由模型通过 `exec` 调用。lxeskillCLI 的安装与运行不是 Agent Harness 自身成立的前提。
- `python/lxeskill_cli/lxeskill/catalog.json` 由 lxeskillCLI 内部维护；Electron 和 agentcli 的集成代码按需通过 `lxeskill list`、`lxeskill describe ...`、`lxeskill datasets list` 查询契约，不直接加载该文件。
- Electron 预览使用 LibreOffice Kit 的 Node API；模型通过 `exec` 调用 Kit CLI；lxeskillCLI 通过内部适配调用 Kit CLI 完成业务文件处理。详见 [Office 文件能力](docs/office-runtime.md)。

Skill 可以根据任务需要，向模型介绍 Electron、lxeskillCLI 等模块的内部结构、实现细节、数据组织和操作方法。这些说明属于工作上下文，本身不构成程序模块之间的耦合，也不改变各模块的职责和数据归属。模型按任务使用通用 Tool 时，遵循任务要求和执行权限。

审查 Skill 时关注指引是否准确、是否有助于任务；实现变化后同步更新相关指引。审查程序模块依赖时，关注生产代码是否绕过约定接口、直接依赖其他模块的内部实现或存储结构。

## 红线（违反 = 生产事故）

- **状态归属**：各模块的生产实现分别管理自身数据，通过约定接口协作，不把其他模块的内部存储作为集成接口，也不建立对方状态的副本来替代接口。Electron 管理桌面配置、凭据、缓存及 Gateway 接入数据；agentcli 管理 Agent 会话、执行状态和统计，SQLite 保存状态与索引，JSONL transcript 保存消息和工具记录；lxeskillCLI 管理业务数据与配置。桌面运行时的数据库分别为数据目录下的 `db/gateway.sqlite3`、`db/agent.sqlite3` 和 `db/lxeskill.sqlite3`。
- **紫鸟状态**：浏览器真实状态以紫鸟客户端实时接口和浏览器实际状态为准，本地只保留可丢弃的缓存。
- **紫鸟浏览器页面自动化只允许官方配对的 Selenium 链路**（`SeleniumRunner` + 按 `core_version` 配对的 chromedriver）。禁止引入 Playwright / Puppeteer / 裸 CDP 做页面级操作——会被站点风控识别，有封店风险。依据与豁免清单见 `docs/harness/skill/reference/ziniao-webdriver-doc-1.0.0/reference/automation-framework-policy.md`。
- **禁止共享或复制 `.venv`**：editable 安装的 `.pth` 指向创建它的 checkout 绝对路径，共享会导致"改的是这份代码、跑的却是另一份"。每个 worktree 各自 `uv sync --frozen`，`wt-claim` 会自动同步。
- **错误真实性**：必须让 AI 看到经过必要脱敏和显式截断的实际错误，不得用无事实依据的推测、通用提示或自写占位文本覆盖实际异常。只有错误形状固定，并有真实响应 fixture 或集成测试证明替代文本与原错误语义等价时，才允许使用固定替代文本；此时仍须在结构化诊断或日志中保留实际错误。

## Instruction Handling

When you receive an instruction:

1. If the instruction is incorrect, explain why.
2. If the instruction is ambiguous, ask for clarification.
3. Otherwise, carry out the instruction.

## 工具链

- **依赖管理与源码开发**：Python 使用 `uv`，不直接用 pip 管理依赖；JS/TS 使用 `bun`，不使用 npm/yarn 管理依赖。安装分别执行 `uv sync --frozen` 和 `bun install --frozen-lockfile`，依赖版本以声明文件和 lockfile 为准。
- **运行时调用**：按被调用程序的接口要求执行。上面的开发工具约定不禁止产品使用 Node.js、随包 Python 或其他运行时，例如 Kit CLI 使用独立 Node.js；不要为了统一开发工具而改写已有运行接口。
- **Obsidian 协作**：需要访问 Obsidian 时，先发现当前机器上的 CLI 路径，并用 `obsidian vaults` 确认 Vault，不要写死安装位置或笔记目录。若 CLI 已安装且应用正在运行，但沙箱因看不到应用 IPC 而误报未运行，申请在沙箱外执行，并将命令前缀限制为实际 CLI 路径；若未安装或未启用 CLI，明确说明，并在已知 Vault 路径时回退为直接读写 Markdown，否则询问用户。默认只读；只有用户明确要求维护笔记时才执行写操作，不执行 `eval` 或插件管理命令。
- 测试必须从仓库根运行，Python 定向测试使用 `uv run --frozen pytest <测试文件或目录>`。从子目录运行会因相对路径假失败。
- **验证必须拿真实结果，警惕假通过**：管道会吞掉退出码（`cmd | tail` 的退出码是 tail 的，不是 cmd 的——用 `set -o pipefail` 或先落盘再查 `$?`）；扫描类校验匹配到空集也会"通过"（cwd 漂移、glob 写错时扫了 0 个文件照样报绿）。报告通过之前，先确认命令真的执行了、扫描真的扫到了东西。
- agentcli 的统计适配通过 `lxeskill list` 查询命令归属。修改命令契约时，两端定向测试都要跑：`uv run --frozen pytest python/lxeskill_cli/tests/lxeskill python/lxeskill_cli/tests/infra` 加 `bun test packages/agent/runtime/test/tooling/lxeskill-command.test.ts`。
- 开发过程中按影响范围运行必要的定向检查；纯文档修改检查内容、链接和涉及的命令，不因完成任务而机械运行全量测试。代码任务在最终 rebase 到最新 `origin/main` 后、PR 合并前运行一次完整验证；代码和基线均未变化时不得重复执行。
- 如果全量测试后代码发生修改，或 `main` 的变化实际进入了当前分支，则原验证结果失效，自己决定要重新全量测试还是定向测试；无变化的 rebase 不构成重复测试理由。

## 工作区选择与 PR 流程

### 统一通过 PR 合并

所有进入共享 `main` 分支的仓库改动，包括代码、文档和配置，统一通过 PR 合并。这一规则适用于所有维护者及其 AI 代理；不得直接向 `main` 提交或推送任务改动，也不得以本地合并任务分支后推送的方式绕过 PR。

所有 PR 均由 AI 完成技术检查，并说明实际验证结果和未确认事项。涉及《PR 审查规范（LXE_AGENT ）》中的人工审核项时，由 AI 简单总结修改缘由、改动内容和预期影响，经人工审核通过后再合并。审核要求按改动内容判断，不因文件少、修改简单或提交者身份而免除。

由有合并权限的维护者按仓库规则合并 PR；AI 代为合并时须已有明确授权。已有审核结论可用于其覆盖的改动，后续发生实质变化时应重新审核受影响部分。

### 工作区选择

开发和提交均在任务分支进行。AI 根据改动范围、验证成本和并行冲突风险，自行选择复用已有的任务工作区，或领取独立 worktree；复用时必须确认该工作区及分支属于当前任务。常规选择无需额外询问用户，用户已有明确安排时按其安排执行。

开发过程中出现并行冲突风险时，应及时调整工作区安排。是否有人实时跟进，不单独决定工作区选择。使用 PR 不要求每次新建 worktree，但不能省略任务分支和审查流程。

无论选择哪种方式，都必须保护已有改动，只提交本任务涉及的内容。主工作区保持在 `main`，用于同步已合并的改动和检查。需要 worktree 时，通过 `scripts/wt-claim` 或其 Windows 版本 `scripts/wt-claim.ps1` 领取和归还。不要自行执行 `git worktree add` 或删除 worktree。脚本会同步各自的依赖并复用可用缓存，首次使用或缓存失效时可能需要下载。

### 开发、审查与合并

1. **准备任务分支**：复用属于当前任务的工作区，或执行 `scripts/wt-claim <task-slug>` 领取 worktree；Windows PowerShell 使用 `scripts/wt-claim.ps1 <task-slug>`（slug 用 kebab-case，如 `fix-store-lock`）。脚本输出的最后一行是 worktree 路径，分支自动建为 `codex/<task-slug>`，bun/uv 依赖已同步好。获取最新远端基线，在任务工作区开发和测试。
2. **开发与提交**：修改 → 完成与改动相关的定向检查（Python 测试使用该任务工作区自己的 `.venv`）→ commit；开发阶段不重复跑全量测试。
3. **创建 PR**：推送任务分支，创建目标为 `main` 的 PR，说明改动目的、实际验证结果及需要人工审核的内容。后续修复继续提交到同一任务分支。
4. **合并前检查**：获取最新 `origin/main` 并 rebase → 按上述验证规则完成检查（代码任务执行一次完整验证，纯文档做相关检查）→ 更新 PR 并完成技术检查和必要的人工审核。若 rebase 无变化，不在验证前后额外重复测试；并行任务依次合并，后合并者先更新基线并判断原验证结果是否仍适用。
5. **通过 PR 合并与同步**：满足审查要求后，通过 PR 合并。确认远端已合并，再在主工作区使用 `git pull --ff-only` 同步；如有本地改动或分叉，先检查并保护已有内容，不强制覆盖。
6. **归还 worktree**：使用池子时，确认 PR 已合并、本地 `main` 已同步且任务工作区干净后，执行 `scripts/wt-claim release <task-slug>`，Windows 使用 `scripts/wt-claim.ps1 release <task-slug>`。脚本会尝试删除任务分支并归还 slot；如因 Squash、rebase 等导致本地分支仍被保留，应核对 PR 状态和提交内容再处理。PR 尚待审核或修复时，继续使用当前任务分支和工作区。

### 操作约束

- 开发、提交或同步前必须检查 `git status`，确认当前分支、已有改动及并行任务不会受到干扰。
- 一个分支只属于一个任务；禁止动别的任务已领取的 slot（Bash 用 `scripts/wt-claim status`，Windows PowerShell 用 `scripts/wt-claim.ps1 status` 查占用）。
- 释放前必须工作区干净（committed 或 discard）；`release` 会强制检查。
- 池子默认 4 个 slot；Bash 用 `WT_POOL_MAX=6 scripts/wt-claim <slug>`，Windows PowerShell 用 `$env:WT_POOL_MAX=6; scripts/wt-claim.ps1 <slug>` 临时扩容。

## Windows 编辑安全

- 在 Windows 上，**不要**对含中文、emoji 或其他非 ASCII 文本的 Python 文件做临时性的 PowerShell 整文件重写——会损坏编码、破坏字符串和 docstring。

## commit 规范

- commit 备注用英语，按以下类型开头：

| 类型 | 说明 | 版本选择参考 |
| :--- | :--- | :--- |
| **feat** | 新增功能 (Feature) | `Minor` |
| **fix** | 修复 Bug | `Patch` |
| **docs** | 仅文档修改 | 无 |
| **style** | 不影响代码含义的修改（空格、格式化、分号等） | 无 |
| **refactor** | 代码重构（既不是修复 Bug 也不是新增功能） | 无 |
| **perf** | 提高性能的修改 | `Patch` |
| **test** | 添加或修改测试用例 | 无 |
| **chore** | 构建过程或辅助工具的变动（如更新依赖） | 无 |
| **ci** | 持续集成配置文件或脚本的变动 | 无 |

版本列仅供发布时参考，不表示每个 commit 都要升级版本。正式版本和更新说明由发布者在 `config/desktop-release.json` 中显式设置；commit 类型不会自动递增版本。详见 [Windows 更新与发布](docs/desktop-updates.md)。

## DOCS 规范

- 如果编写文档，分清主次，重点多讲，细枝末节少讲，多用大白话。
