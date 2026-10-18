# 活动页与工作台

2026-10-19 新增的 LXE 适配案例。截图来自本地 Electron 的生产页面组件，数据由测试 fixture 提供，不是真实账号统计，也不是 Claude 官方界面。

## 规则与适配边界

| 原规则及出处 | 本次采用 | LXE 自己的设计决定 |
| --- | --- | --- |
| [用途变量、主题层级、中性状态](../sources/cds-tokens-vanilla.original.md) | 共用设置页、能力页的亮暗主题；主文字、说明、元数据分级；alpha 分隔线与悬停底色 | 工作台单列工具目录，活动页六项指标与折叠明细 |
| [Charts：Cove 分类色与语义状态色分工](../sources/embedded-text-8.original.md) | 回合用第一色蓝；技能执行用第二色橙；错误数字与图标用语义红。图例、柱状和折线保持同一对应 | 错误项不再铺满红底；具体红色继承 LXE 语义变量 |
| [Charts：网格、基线、线宽与标记](../sources/embedded-text-8.original.md) | 亮暗网格分别为 `#e1e0d9 / #2c2c2a`；基线 `#c3c2b7 / #383835`；线宽 2px；标记 8px、表面环 2px；柱宽上限 24px、顶部圆角 4px | 日期标签随宽度减少；指标仍用紧凑无衬线字，没有采用原文的大号衬线 hero number |
| [Charts：明确图例与数据提示](../sources/embedded-text-8.original.md) | 两个系列均有图例和每日数据提示 | 图表只占一个 Tab 停靠点；左右键逐日查看，Home/End 跳转，Escape 关闭提示 |

蓝／橙：亮色 `#2a78d6 / #eb6834`，暗色 `#3987e5 / #d95926`，直接来自上述图表原文。它们是数据系列色，不是按钮 accent。页面没有安装官方 CDS 组件库。

## 截图

| 页面或状态 | 亮色 | 暗色 |
| --- | --- | --- |
| 活动页 | [截图](activity-workbench/activity-light.png) | [截图](activity-workbench/activity-dark.png) |
| 工作台 | [截图](activity-workbench/workbench-light.png) | [截图](activity-workbench/workbench-dark.png) |
| 折线 | — | [截图](activity-workbench/activity-line-dark.png) |
| 键盘数据提示 | — | [截图](activity-workbench/activity-keyboard-dark.png) |
| 480px 英文活动页、90 天 | — | [截图](activity-workbench/activity-narrow-en.png) |
| 480px 英文工作台 | — | [截图](activity-workbench/workbench-narrow-en.png) |

## 实现与验证

- [活动页样式](../../../../apps/dashboard/src/features/stats/theme.css)、[图表交互](../../../../apps/dashboard/src/features/stats/view.tsx)。
- [工作台样式](../../../../apps/dashboard/src/features/workbench/index-theme.css)、[工具目录](../../../../apps/dashboard/src/features/workbench/index-view.tsx)。
- [Electron 行为检查](../../../../apps/dashboard/test/behavior/overview-pages.cjs)：范围查询、柱状／折线、键盘、三组明细、三个工作台入口、亮暗与窄屏溢出。

本次主题作用域新增 `.activity-theme` 与 `.workbench-theme`；后者只用于工作台目录。工具内部流程保持既有实现。原始资料和此前的色彩／样式快照仍保持归档时内容，不自动覆盖为本次版本。
