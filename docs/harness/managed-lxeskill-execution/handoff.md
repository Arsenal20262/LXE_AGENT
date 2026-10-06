# 受控 lxeskill 执行入口交接

## 分支与范围

- 开发分支：`codex/trusted-lxeskill-execution`，以越南 PR7 分支为依赖；使用独立 worktree，未改动 PR1–PR7 的分支或 PR 关系。
- 只为 catalog 显式登记的越南 SKU 绑定和备货生成提供桌面受控入口。没有放宽通用 `exec` 沙箱，也没有改 Python 业务计算、雅仓接口、SKU 资产或 Workbook。
- 本地步骤提交：设计 `f946045d`，catalog 契约 `efe7cd00`，附件来源 `54b66dc5`，受控工具及宿主接线 `2be5c58f`；本交接与 Skill 文案在最后一个独立提交中收口。尚未 push、创建 PR 或 merge。

## 调用链与权限

聊天中的 `vietnam-stock-recommendation` Skill 判断意图和附件优先级 → `managed_lxeskill` 接收登记命令 ID，以及绑定时的附件 ID → Runtime 按当前/紧邻上一条真实用户消息核验附件来源与 XLSX 文件；遇会话压缩或无法识别的中间用户消息时拒绝复用紧邻附件 → Agent CLI 宿主使用现有受管 Python 构造固定 CLI 参数，注入当前会话工作区和 Skill 范围 → Python 原有 bind 或 generate 逻辑执行 → Runtime 校验 terminal 和当前工作区内的最终 XLSX → Agent 确认成功后用 `send_files` 交付。

Read Only 不执行；Workspace Write 可调用登记命令，但受控宿主可写应用内部数据目录，这不扩大模型通用文件权限。桌面通用 `exec` 遇到登记命令会在审批前提示改用受控工具；其他命令仍遵循原权限和审批。工具调用失败不自动重试或回退到 `exec`。绑定和生成是两个独立调用，是否继续由 Skill 判断；文件不会由受控工具自动发送。

## 验证结果

- Bun 定向回归：6 个测试文件，59 通过、0 失败。覆盖 catalog、附件来源、受控工具、Skill 文案、审批和桌面宿主的合成集成测试。
- Python catalog/infra 定向回归：406 通过、2 跳过、4 条已有依赖弃用提示。
- Runtime 与 Agent CLI TypeScript 类型检查通过；TypeScript 生产边界检查通过；Agent CLI 构建成功。
- 全部自动化测试使用合成附件或假 CLI，没有读取真实 SKU 表，也没有调用雅仓生产接口。`git diff --check` 在提交前通过。

## 未验证与接手事项

- **真实模型决策未验证。** 静态 Skill 断言、假工具及宿主集成测试不能证明真实模型会正确选择 `managed_lxeskill`、先 bind 后 generate、失败后停下。
- 真实雅仓链路和真实 SKU 工作簿未运行；Windows 安装版和 Office 重算环境未验证。上述限制不能写成验收通过。
- 当前桌面开发服务若仍运行越南 PR7 旧 worktree，需切换到本分支构建后才可观察新入口；切换前不能把旧服务结果当作本变更验收。
- 后续先在受控环境做一次真实聊天验收，再按仓库规范单独审批 push、PR 和 merge。若主分支继续变化，按依赖顺序检查并解决冲突；不可直接在 `main` 开发。
