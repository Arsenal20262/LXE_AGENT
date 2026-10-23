# 会话侧边栏：宽松布局与文字层级

2026-10-23。保留分组之间的留白，整理文字层级、对齐、选中背景和会话行高度。

## 规则与适配边界

依据 [CDS 原文](../sources/cds-tokens-vanilla.original.md)的 Typography、Sizing、Density adapts to the surface、Muted text rule：界面使用无衬线字体；字号、控件高度和间距协调；密度服从使用场景；重要内容不能过度弱化。

这些原则不规定 LXE 侧栏的具体像素。下列尺寸、标题省略方式和菜单列均是 **LXE 适配**，没有据此补齐 Claude 会话侧栏的专用规则证据。

| 项目 | 本次实现 |
| --- | --- |
| 应用标题 | 14px、600 字重，40px 高标题行 |
| 新对话 | 13px、400 字重，40px 最小高度 |
| 工作区分区标题 | 12px、400 字重、浅灰标签色；与上方操作留出 12px 间距 |
| 工作区名称 | 12px、400 字重、浅灰标签色；点击名称展开／折叠，不显示箭头 |
| 会话标题 | 13px／20px 行高，均为 400 字重；普通为次要文字色，选中、悬停及键盘焦点为主文字色 |
| 会话行 | 32px 最小高度，上下各 6px 留白，行间 2px；工作区标题保留 36px，工作区之间 16px |
| 对齐 | 8px 行内留白、16px 会话图标列、8px 图文间距；组名与工作区分区标题对齐，会话名与加载更多沿缩进后的文字轴对齐 |
| 长标题与菜单 | 省略号 + 固定 32px 操作列；鼠标悬停不移动标题，也不再用渐变遮挡文字 |
| 配色与宽度 | 延续原语义颜色，5% 悬停；选中浅色 6% 墨色、暗色 10% 墨色；保留默认 256px、拖动范围及记忆宽度 |

字号使用 rem，表中为标准字号下的值。几何调整只在会话侧栏主题作用域内生效，工作区顺序、分页、搜索、重命名和删除处理逻辑保持原样。

普通会话用 `--cds-secondary`，当前、悬停与键盘焦点用 `--cds-ink`。组名使用 40% secondary 与 60% muted 混合的标签色。导航表面为浅色 `#fcfcfb`／暗色 `#151515`，边界用 10% 透明墨色；运行状态仍按原逻辑使用语义颜色。

工作区名称保留原生按钮和 `aria-expanded`，点击、Enter、空格均可展开／折叠。用户的 Claude 参考截图只支持视觉对照，无法确定实际 CSS 字号或缩放；没有把原截图放入仓库。

源码：[共享主题](../../../../apps/dashboard/src/shared/cds-theme.css)、[侧栏样式](../../../../apps/dashboard/src/features/sessions/sidebar-theme.css)、[工作区分组](../../../../apps/dashboard/src/features/sessions/workspaces.tsx)。

## 精选效果与验证

| 场景 | 浅色 | 暗色 |
| --- | --- | --- |
| 会话分组与选中 | [截图](conversation-sidebar-density/light.png) | [截图](conversation-sidebar-density/dark.png) |
| 窄窗口 | [截图](conversation-sidebar-density/narrow-light.png) | [截图](conversation-sidebar-density/narrow-dark.png) |

[实测记录](conversation-sidebar-density/verification.json)记录字号、行高、分组间距、对比度抽查、悬停、键盘焦点和搜索副标题；截图为生产组件与虚构会话。旧版箭头、选中强度与不同字号的中间快照通过 Git 查阅。

定向行为检查：`bun test apps/dashboard/test/behavior/renderer.test.ts --test-name-pattern 'sidebar|workspaces|session-titles'`。未做完整读屏、触屏或真实 Windows 设备审计。

## 未选择会话的空状态

空状态占满剩余内容区，背景透明，只有居中的 14px 次要文字，无装饰图标；窄窗口自然换行。这些尺寸与布局是 LXE 选择。

源码：[ConversationPage.tsx](../../../../apps/dashboard/src/features/sessions/ConversationPage.tsx)、[conversation-theme.css](../../../../apps/dashboard/src/features/sessions/conversation-theme.css)。

[浅色](conversation-empty-state/wide-light.png) · [暗色](conversation-empty-state/wide-dark.png) · [窄窗口](conversation-empty-state/narrow-dark.png)。[实测记录](conversation-empty-state/verification.json)保留检查范围；不改变其他页面的通用空状态或会话加载、错误提示。
