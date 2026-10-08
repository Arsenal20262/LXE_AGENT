> 已由 PR #80 的越南备货设置简化方案取代：AI 使用普通 `exec` 调用 `lxeskill vietnam stock recommend [--sku-map 文件]`，不足权限走本次审批。SKU 上传和参数维护位于桌面「越南备货设置」。以下保留原实现交接记录。

# 受控 lxeskill 执行入口交接（新 PR7）

- 分支/Pool：`codex/vietnam-clean-pr7-chat`，`pool-13`；基于新 PR6 `373d1079f96d40ca0822ce55de730e581295a565`。本地重建，未 push、未创建 PR。
- 范围：catalog 登记受控 SKU 绑定、在线备货命令和只读表头探针；Runtime/Agent CLI 核验单个附件来源、执行固定参数 CLI、验证终端产物；Skill 声明式预选。没有修改通用 `exec` 的权限边界，也没有修改雅仓请求、Workbook 或补货公式。

## 调用链和边界

聊天目标 → 声明式 Skill 预选/模型判断 → `managed_lxeskill` 登记命令 → Runtime 核验本轮或合规紧邻的唯一 XLSX → Agent CLI 执行受管 Python → 业务 bind 或在线 recommend → 仅在成功且产物契约有效时由 Agent 调用 `send_files`。受控工具本身不自动发送文件；失败不回退到通用 `exec`。

裸上传唯一 XLSX 时，只读探针检查表头，匹配后由现有问题卡提供“仅绑定 / 绑定并查询”选择；同轮已明确生成目标时直接按 Skill 顺序执行。多附件仍先澄清。通用预选器不含越南关键词；关键词和 SKU 表识别留在业务 Skill 与探针。历史附件不能跨轮搜索或混用。

## 验证与限制

- 新 PR7 本地定向结果：Python `lxeskill`、`infra`、越南模块 661 passed、6 skipped；Bun catalog/Skill/受控附件/Agent CLI 80 passed；Runtime/权限/状态/工作区及 Dashboard 155 passed；Runtime、Agent CLI、Dashboard typecheck 通过。测试使用合成文件和假工具，未请求生产雅仓。
- 6 项跳过不是通过。真实模型完整聊天链、生产雅仓及 Windows 安装版未在本次 Clean Stack 重建中重新验收。旧链的人工验收记录不能替代新分支验证。
- 本层只支持既有单附件选择；固定数量多附件属于新 PR8。当前只核验附件记录、来源、路径和文件大小，不保证等长内容改写可被发现或发送时不可变快照。
- 交接前核对本层文件范围、`git diff --check`、`git status` 与敏感内容；本地提交后由新 PR8 以本层最终 HEAD 为基线。
