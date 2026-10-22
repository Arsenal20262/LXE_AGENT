# 权限审查卡片配色

2026-10-22。将对话中的权限审查卡片接入共享 CDS 主题，保留审批内容、命令预览、操作顺序、单次授权和拒绝逻辑。

这是 **LXE 适配**，依据是 [CDS 原文](../sources/cds-tokens-vanilla.original.md)的用途变量、表面层次和语义状态色原则。尚未取得 Claude 审批卡完整状态规范，本案例不代表上游审批组件的复刻。

| 用途 | 本次适配 |
| --- | --- |
| 卡片 | `--cds-surface-panel`、10% 中性边框与轻阴影，取消整圈黄色描边 |
| 等待审批 | 导航层表面配小面积 `--warning` 文字和圆点；待审批数量用说明文字色 |
| 命令与变更内容 | 5% 中性底色和细边界，保留完整文本、选择复制及长行换行 |
| 工作目录 | secondary 文字，去掉路径上旧主题的独立棕灰底色 |
| 操作 | “允许一次”使用共享蓝色主操作；“拒绝”使用中性次操作，悬停不表示执行失败 |
| 焦点和忙碌 | 蓝色键盘焦点环；提交时保持禁用，透明度 0.4 |
| 实际错误 | danger 文字、浅底和边界，保留真实错误内容与重试行为 |

源码：[组件](../../../../apps/dashboard/src/features/sessions/permissions.tsx)、[样式](../../../../apps/dashboard/src/features/sessions/permissions.css)、[共享变量](../../../../apps/dashboard/src/shared/cds-theme.css)。共享变量没有新增或改值，历史变量快照保留。

## 本地验证

- `bun run --cwd apps/dashboard typecheck`：通过。
- `bun test apps/dashboard/test/behavior/renderer.test.ts --test-name-pattern permissions`：通过，包含 10 个权限交互场景，覆盖单次授权、拒绝、实际错误与重试、防重复提交、命令与写入/编辑预览、窄窗口等。
- 另外用临时 Electron 检查脚本运行真实生产组件和内存 fixture，检查两种主题的原生鼠标悬停、Tab 焦点、长命令、原始命令展开、480px 窗口、错误及提交中禁用，保存 [计算样式记录](permission-approval/verification.json)。离屏窗口启用焦点模拟；不代表操作系统原生窗口验收。
- 本次抽查正文、等待状态与主按钮的文字对比度均达到 4.5:1；未声称完成全部无障碍审计。
- 页面中的命令、路径与错误均为示例，没有执行真实业务命令或授权实际操作。预览进程、端口和临时用户目录在验证结束后清理。

| 状态 | 浅色 | 暗色 |
| --- | --- | --- |
| 命令审批 | [截图](permission-approval/exec-light.png) | [截图](permission-approval/exec-dark.png) |
| 键盘焦点 | [截图](permission-approval/focus-light.png) | [截图](permission-approval/focus-dark.png) |
| 窄窗口与原始命令 | [截图](permission-approval/narrow-light.png) | [截图](permission-approval/narrow-dark.png) |
| 实际错误 fixture | [截图](permission-approval/error-light.png) | [截图](permission-approval/error-dark.png) |
