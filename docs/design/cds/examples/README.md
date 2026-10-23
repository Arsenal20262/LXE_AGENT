# LXE 精选案例

按设计问题查案例，不按每次修改日期堆记录。这里的截图使用示例数据，展示 LXE 的适配效果；原规则与未验证部分在各案例中标明。历史版本通过 Git 查阅。验证记录保留当时的检查范围，图片只精选其中有代表性的状态。

## 页面与组件

| 设计问题 | 案例／实现入口 | 代表性效果 |
| --- | --- | --- |
| 设置导航、连续表单与文字层级 | [适配说明](../lxe-adaptation.md)、[设置样式](../../../../apps/dashboard/src/desktop/settings-theme.css)、[设置结构](../../../../apps/dashboard/src/desktop/shell.tsx) | [浅色](settings/appearance-light.png) · [暗色](settings/appearance-dark.png) · [焦点](settings/focus-light.png) |
| 技能、工具目录与详情 | [能力主题](../../../../apps/dashboard/src/features/capabilities/theme.css)、[页面](../../../../apps/dashboard/src/features/capabilities/CapabilitiesPage.tsx)、[详情](../../../../apps/dashboard/src/features/details/view.tsx) | [技能浅色](capabilities/skills-light.png) · [技能暗色](capabilities/skills-dark.png) · [工具详情](capabilities/tools-detail-light.png) |
| MCP 状态和模型设置 | 同上，品牌图标保留原色，普通内容使用中性层次 | [MCP 浅色](capabilities/connections-light.png) · [MCP 暗色](capabilities/connections-dark.png) · [模型浅色](capabilities/models-light.png) · [模型暗色](capabilities/models-dark.png) |
| 侧栏分组、行高、选中与空状态 | [会话侧边栏](conversation-sidebar-layout.md) | [浅色](conversation-sidebar-density/light.png) · [暗色](conversation-sidebar-density/dark.png) |
| 审批内容层级、主次操作 | [权限审查卡片](permission-approval.md) | [浅色](permission-approval-layout/write-light.png) · [暗色](permission-approval-layout/write-dark.png) |
| 输入、附件、消息与浮动控件 | [对话配色](conversation-colors.md) | [输入框](conversation/composer-focused-light.png) · [文件块](conversation/artifact-dark.png) · [消息气泡](conversation-bubble/bubble-dark.png) |
| 首页信息概览 | [首页](home.md) | [浅色](home-restored/home-light.png) · [暗色](home-restored/home-dark.png) |
| 数据图表与功能目录 | [活动与工作台](activity-workbench.md)、[三个功能页](workbench-details.md) | [活动](activity-workbench/activity-light.png) · [设置](workbench-details/vietnam-dark.png) · [文件版本](workbench-details/assets-light.png) |
| 统计与语义状态 | [统计卡片](conversation-statistics.md)、[运行状态浮层](runtime-status.md) | [统计](conversation-statistics/statistics-dark.png) · [混合状态](runtime-status/status-mixed-dark.png) |

## 状态怎么检查

优先使用[组件状态展示页与适配总表](../current-adaptation.md)，从仓库根运行 `bun run cds:preview`。首批覆盖输入框、导航行、工具调用条，可以实际操作 hover、Tab 焦点、选择和展开。

色彩从[共享主题](../../../../apps/dashboard/src/shared/cds-theme.css)引用。截图帮助判断视觉效果，组件源码决定当前实现；测试与实测记录说明当时检查过什么。保存、删除、连接等业务行为仍由各自测试验证。
