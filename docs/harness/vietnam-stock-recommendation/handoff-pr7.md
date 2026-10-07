# 新 PR7 交接：聊天绑定与受控执行

- 分支/Pool：`codex/vietnam-clean-pr7-chat`，`pool-13`；基线为新 PR6 `373d1079f96d40ca0822ce55de730e581295a565`。本层仅在本地重建，未 push、未创建 PR。
- 范围：聊天 SKU 表绑定、单附件来源校验、受控 `managed_lxeskill`、声明式 Skill 预选及工作台展示调整。PR1 的资产槽与只读校验、PR5 的受信 current/version/rollback、PR6 的稀疏 SKU 规则继续有效。下一层 PR8 才提供固定数量多附件能力。
- 文件：Agent CLI 宿主与预选、Runtime 受控工具和附件来源、Python `vietnam sku bind` 与只读探针、catalog、两份 Skill、Dashboard SKU 卡、相应定向测试，以及本目录和 `docs/harness/managed-lxeskill-execution/` 的交接文档。相对基线的准确文件列表以 `git diff --name-only` 为准。

## 入口与调用链

- 明确越南备货请求由 Skill 判断目标；合规的新单个 XLSX 先经宿主附件来源核验，再由受控 CLI 绑定到受信 current；绑定成功后才调用现有在线 `vietnam stock recommend`。没有待处理新附件时使用已绑定 current。只绑定不生成；用途含糊、多附件或库存问法含糊时先澄清。
- Runtime 只执行 catalog 登记的受控命令并核验本轮或合规紧邻附件。Skill 预选读取业务 Skill 的声明，不在公共层写入越南关键词。最终文件仍须经生成、Office 重算与结果校验后由 `send_files` 交付。
- 工作台展示 current、previous 和回滚；聊天成为 SKU 表的业务上传入口。底层受信存储、校验和历史模板槽的兼容契约没有被移除。

## 环境与验证

- 无新增必需环境变量；继续使用宿主现有工作区、受信 SKU 存储与 Office 配置。本次只运行合成/假工具测试，未调用生产雅仓。
- Python `lxeskill`、`infra`、越南模块：661 passed、6 skipped。Bun Runtime/Skill/Agent CLI 定向：80 passed；Runtime/权限/状态/工作区及 Dashboard 定向：155 passed。Runtime、Agent CLI、Dashboard typecheck 均通过。
- 6 项 Python 跳过不计为通过；本次 Clean Stack 重建没有重新验收真实模型完整聊天、生产雅仓或 Windows 安装版。既有真实聊天记录保留在旧链，不把它当作本次新分支测试结果。

## 依赖、风险与 Git

- 依赖新 PR1～PR6；PR8 的多附件与 PR9 的三报表离线生成不属于本层。单附件来源校验沿用既有路径/记录/大小信任边界，不保证发送时字节级不可变快照。
- 完成迁移后应核对相对新 PR6 的文件范围、`git diff --check`、敏感内容与 `git status`；仅本地提交，不推送或创建 PR。新 PR8 应从本层最终 HEAD 继续。
