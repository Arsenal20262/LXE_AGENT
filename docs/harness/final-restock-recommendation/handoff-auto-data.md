# 最终备货建议：自动取数衔接交接

## 范围与工作区

- 分支 `codex/final-restock-auto-data`，Pool `.worktrees/pool-7`，从 PR3 `63672882` 创建；依赖链为 main → PR1 → PR2 → PR3 → 本次修改。
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

- 从本 worktree 根运行，Python 新 Skill 契约 `16 passed`；最终工作簿、来源核验与深圳库存相关定向测试 `69 passed`；Bun Skill 发现及 CLI 归属 `25 passed`；Runtime 技能激活与命令归属定向测试 `1 passed`；`lxeskill doctor` 返回 `ok=true`，47 catalog 命令、38 个 Skill 文件。
- 使用项目现有 DeepSeek provider 和当前 Skill 目录做真实模型隔离演练：店铺名成功场景选择新 Skill，依次产生 5 条命令并模拟发送最终文件；深圳报告引用旧源表时止于第 3 步；货件快照返回失败时止于第 4 步；普通备货选择旧 `replenishment-workflow-map`。演练中的 `exec` / `send_files` 返回合成终态，不执行 ERP 或真实文件发送。脚本与结果位于 `/private/tmp/final-restock-auto-model-test.ts`、`/private/tmp/final-restock-auto-model-result.json`。
- 另一次相同真实模型演练将前四步取数替换成已有合成文件终态，第五步实际执行本 worktree 的离线 `lxeskill replenish final-restock generate`：退出 0、`ok=true`，生成文件实际存在，`mskulist` 为 34 列、表头加 4 行数据；`send_files` 仍为模拟。结果位于 `/private/tmp/final-restock-auto-model-cli-result.json`，输出位于 `/private/tmp/final-restock-auto-cli-output`。这证明模型参数传递接上了真实底层计算，不证明 ERP 实时取数或 Desktop 实际发送。
- 真实马帮取数、正式 Desktop 对话中的完整执行、真实业务 Excel 及附件发送：**NOT VERIFIED**。全量测试、build/typecheck、Windows 原生与 Microsoft Excel 原生重算：**NOT VERIFIED**。定向工作簿测试使用现有 Office Kit，不能替代这些验收。
- 不增加环境变量。实际取数仍依赖现有马帮登录态、`LXE_DATA_SERVER_URL` / `LXE_DATA_SERVER_API_KEY`；计算继续依赖现有 `LXE_OFFICE_NODE` / `LXE_OFFICE_CLI` 配置。不得在失败后绕过凭据或源数据校验。

## Git 与下一步

- 本分支在 PR3 基础上仅提交上述自属修改，PR1–PR3 和主工作区不动；不 push、merge。
- 下一步等待用户授权后处理远端 PR；如需真实业务端到端验收，应在另行允许连接马帮生产 ERP 后，用有权限的店铺最小样本验证文件生成及 Desktop 实际发送。
