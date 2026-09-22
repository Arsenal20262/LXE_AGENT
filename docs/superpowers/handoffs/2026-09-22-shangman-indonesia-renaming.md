# 上马印尼名称与导出契约收口

## 当前状态

- 分支：`feature-amazon-replenish-multi-platform`
- 本轮未提交、未推送。
- 运行中的服务无需为本次 Python/Skill 文案变更重启；新的 CLI 调用会加载当前源码。

## 已完成

- 面向模型、Desktop 和 Skill 目录的“智慧印尼”名称统一为“上马印尼”。
- Shangman 的公开结构化参数和终端投影使用 `platform: "上马印尼"`。
- 原始 XLSX 文件名使用 `上马印尼-商品-YYYYMMDD-HHMMSS.xlsx`。
- Skill 只接受“上马”“上马印尼”或 `Shangman` 触发；旧公开参数 `platform: "智慧"` 被明确拒绝。
- 内部技术标识保持 `shangman`：Python 包、CLI 命令、环境变量和认证逻辑均未改动。
- 清除了误写的旧 TMS 文件名前缀，改为正确的 `智汇tms`；新增回归验证现有智汇合并文件可被识别。

## 调用链

```text
上马 / 上马印尼 / Shangman
  → shangman-goods-export-workflow-map
  → catalog: shangman_goods_export_{preview,run}
  → services.agent_cli.shangman
  → services.shangman.intent / goods_export
  → terminal data + XLSX artifact
```

## 环境变量

认证和生产门禁保持不变：`LXE_SHANGMAN_TENANT_ID`、`LXE_SHANGMAN_USERNAME`、`LXE_SHANGMAN_PROCESSED_PASSWORD`、`LXE_SHANGMAN_BASIC_AUTH`、`LXE_SHANGMAN_PROD_ENABLED`。

## 验证结果

- `uv run pytest python/lxeskill_cli/tests/shangman python/lxeskill_cli/tests/zhihui_tms -q`：106 passed。
- `uv run pytest python/lxeskill_cli/tests/lxeskill python/lxeskill_cli/tests/infra -q`：347 passed；其中 aiohttp loopback 用例需在沙箱外运行。
- `bun test packages/agent/runtime/test/tooling/skills.test.ts packages/agent/runtime/test/tooling/lxeskill-command.test.ts`：19 pass。
- `bun run typecheck`：全部工作区通过。
- `git diff --check`：通过。

## 已知限制与下一步

- 旧“智慧”自然语言和结构化 `platform` 不再兼容；这是本轮显式改名要求。
- 本工作区仍有雅仓的既有未提交改动和若干未跟踪文档，提交时必须仅暂存本轮文件并与雅仓变更分开收口。
- 下一步：经用户批准后，检查本轮 diff 并执行精确 `git add` / `git commit`；`push` 仍需单独批准。
