# 对话侧边栏配色

后续更新：2026-10-23 的[宽松布局与文字层级](conversation-sidebar-layout.md)已调整字号、间距、分组和长标题显示。本页保留 2026-10-19 配色阶段的历史记录。

2026-10-19，将会话选择侧边栏接入共享 CDS 适配主题。保留原有宽度、布局、间距、圆角、字体、标题截断与操作方式；顶部窗口按钮及左侧全局导航保持原主题。

## 原规则与 LXE 适配

依据仍是 [CDS tokens — vanilla](../sources/cds-tokens-vanilla.original.md) 的 Token、Muted text、Purpose 与 Restraint 规则：按用途引用颜色变量、区分文字层级、保持导航与普通操作克制。没有新增官方来源。

| 用途 | 本次适配 |
| --- | --- |
| 背景／边框 | nav 表面：亮色 `#fcfcfb`、暗色 `#151515`；边界使用 10% 透明墨色 |
| 文字层次 | 会话名与工作区名使用主文字，辅助图标与说明使用次级文字，默认标签与分组小标题使用 muted |
| 悬停／选中 | 分别使用背景与主墨色按 95:5、90:10 混色，选中状态更明显 |
| 操作按钮遮罩 | 使用与所在行一致的不透明底色，保留原有阴影范围，让长标题在按钮前自然隐去 |
| 搜索／键盘焦点 | 搜索启用状态和焦点使用蓝色，搜索框外圈采用淡蓝色；不改变控件尺寸 |
| 会话状态 | 运行、排队和等待输入使用蓝色，完成使用 success，错误使用 danger；状态判断和动画不变 |

这些颜色映射、混色比例与具体作用范围是 **LXE 的适配**，不能据此声称还原了 Claude 官方侧边栏规范。颜色来自[共享主题](../../../../apps/dashboard/src/shared/cds-theme.css)，局部映射在[侧边栏主题](../../../../apps/dashboard/src/features/sessions/sidebar-theme.css)。

## 截图与验证

截图使用本地 Electron 中的生产侧边栏和示例会话，不读取真实会话内容。

| 状态 | 截图 |
| --- | --- |
| 亮色／暗色 | [亮色](conversation-sidebar/sidebar-light.png) · [暗色](conversation-sidebar/sidebar-dark.png) |
| 悬停与选中对比 | [暗色](conversation-sidebar/sidebar-hover-dark.png) |
| 搜索与焦点 | [暗色](conversation-sidebar/sidebar-search-dark.png) |
| 临时展开／窄窗口抽屉 | [临时展开](conversation-sidebar/sidebar-peek-dark.png) · [窄窗口](conversation-sidebar/sidebar-narrow-dark.png) |

通过启用／移除侧边栏主题类，对比各状态的坐标、尺寸、字体、padding、gap、边框宽度与圆角。[实测记录](conversation-sidebar/geometry-and-colors.json)保存测量数量和主要计算颜色。

Dashboard 类型检查，以及现有 sidebar、workspaces 两组 Electron 行为测试通过。截图不涵盖每一种状态圆点和系统平台，也不代替完整的对比度或读屏审计。验证脚本在结束时关闭临时预览服务与 Electron 进程。
