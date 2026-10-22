# 权限审查卡片

2026-10-23 更新。在共享 CDS 配色基础上，参考用户提供的 Claude 浅色审批卡截图，调整信息层级与按钮位置。审批内容、单次授权、拒绝、重试及折叠详情的操作方式保持原样，没有新增快捷键。

这是 **LXE 适配**，依据是 [CDS 原文](../sources/cds-tokens-vanilla.original.md)的用途变量、表面层次和语义状态色原则。用户截图提供了中性边框、操作标题、说明文字、命令底色与左右按钮的视觉参考；不能由截图确定字号、间距、暗色配方或完整状态规范。原始截图留在本地，不上传到仓库。本案例不代表上游审批组件的复刻。

| 用途 | 本次适配 |
| --- | --- |
| 卡片 | `--cds-surface-panel`、10% 中性边框与轻阴影，取消整圈黄色描边 |
| 标题与说明 | 取消独立等待状态条，改为“允许 LXE Agent 运行命令／写入文件／编辑文件？”；15px / 600 标题，12px 权限说明，14px / 400 原始申请原因，均为 LXE 尺寸选择 |
| 权限与队列 | 请求的权限等级单独列出；多项待审批时保留数量；标题按真实 tool 类型确定，不把模型理由改写为未经验证的动作摘要 |
| 命令与变更内容 | 5% 中性底色，13px 等宽 secondary 文字，保留完整文本、选择复制及长行换行 |
| 工作目录 | secondary 文字，去掉路径上旧主题的独立棕灰底色 |
| 操作 | 拒绝在左、允许一次在右；允许按钮用 ink 实色和 panel 反色文字，悬停用 secondary；拒绝为中性描边，悬停不表示执行失败 |
| 焦点和忙碌 | 蓝色键盘焦点环；提交时保持禁用，透明度 0.4 |
| 实际错误 | danger 文字、浅底和边界，保留真实错误内容与重试行为 |

源码：[组件](../../../../apps/dashboard/src/features/sessions/permissions.tsx)、[样式](../../../../apps/dashboard/src/features/sessions/permissions.css)、[共享变量](../../../../apps/dashboard/src/shared/cds-theme.css)。共享变量没有新增或改值，历史变量快照保留。

## 当前本地验证

- `bun run --cwd apps/dashboard typecheck`：通过。
- `bun test apps/dashboard/test/behavior/renderer.test.ts --test-name-pattern permissions`：通过，包含 10 个权限交互场景，覆盖单次授权、拒绝、实际错误与重试、防重复提交、命令与写入/编辑预览、窄窗口等。
- 另外用临时 Electron 检查脚本运行真实生产组件和内存 fixture，检查写入内容及原始理由保真、两种主题的原生鼠标悬停、Tab 焦点、长命令、原始命令展开、480px 窗口、错误及提交中禁用，保存 [计算样式记录](permission-approval-layout/verification.json)。离屏窗口启用焦点模拟；不代表操作系统原生窗口验收。
- 本次抽查正文、说明与主按钮的文字对比度均达到 4.5:1；未声称完成全部无障碍审计。
- 页面中的命令、路径与错误均为示例，没有执行真实业务命令或授权实际操作。预览进程、端口和临时用户目录在验证结束后清理。

| 状态 | 浅色 | 暗色 |
| --- | --- | --- |
| 文件写入，展开内容 | [截图](permission-approval-layout/write-light.png) | [截图](permission-approval-layout/write-dark.png) |
| 命令审批 | [截图](permission-approval-layout/exec-light.png) | [截图](permission-approval-layout/exec-dark.png) |
| 键盘焦点 | [截图](permission-approval-layout/focus-light.png) | [截图](permission-approval-layout/focus-dark.png) |
| 窄窗口与原始命令 | [截图](permission-approval-layout/narrow-light.png) | [截图](permission-approval-layout/narrow-dark.png) |
| 实际错误 fixture | [截图](permission-approval-layout/error-light.png) | [截图](permission-approval-layout/error-dark.png) |

## 历史配色记录（2026-10-22）

下面保留的是上一版的状态条、蓝色主按钮与右侧双按钮布局，不代表当前样式。[历史计算样式](permission-approval/verification.json)。

| 状态 | 浅色 | 暗色 |
| --- | --- | --- |
| 命令审批 | [截图](permission-approval/exec-light.png) | [截图](permission-approval/exec-dark.png) |
| 键盘焦点 | [截图](permission-approval/focus-light.png) | [截图](permission-approval/focus-dark.png) |
| 窄窗口与原始命令 | [截图](permission-approval/narrow-light.png) | [截图](permission-approval/narrow-dark.png) |
| 实际错误 fixture | [截图](permission-approval/error-light.png) | [截图](permission-approval/error-dark.png) |
