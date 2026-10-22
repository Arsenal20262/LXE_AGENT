# 会话侧边栏：宽松布局与文字层级

2026-10-23。在[原配色适配](conversation-sidebar.md)上继续整理布局。用户选择保持宽松，重点是层级、对齐和分组，不增加同屏密度。

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
| 会话行 | 32px 最小高度，上下各 6px 留白，行间 2px；工作区标题保留 36px，工作区之间 20px |
| 对齐 | 8px 行内留白、16px 会话图标列、8px 图文间距；组名与工作区分区标题对齐，会话名与加载更多沿缩进后的文字轴对齐 |
| 长标题与菜单 | 省略号 + 固定 32px 操作列；鼠标悬停不移动标题，也不再用渐变遮挡文字 |
| 配色与宽度 | 延续原语义颜色，5% 悬停；选中浅色 6% 墨色、暗色 10% 墨色；保留默认 256px、拖动范围及记忆宽度 |

字号使用 rem，表中为标准字号下的值。几何调整只在会话侧栏主题作用域内生效，工作区顺序、分页、搜索、重命名和删除处理逻辑保持原样。

## 渲染记录

截图为生产组件配示例数据，不连接真实会话或运行任务，也不是 Claude 原始证据。下表保留首次布局验收快照（选中 10%、字重 500）；最新效果见下方“缩小会话行高度”。

| 状态 | 浅色 | 暗色 |
| --- | --- | --- |
| 全部工作区展开 | [截图](conversation-sidebar-layout/overview-light.png) | [截图](conversation-sidebar-layout/overview-dark.png) |
| 键盘焦点 | [截图](conversation-sidebar-layout/focus-light.png) | [截图](conversation-sidebar-layout/focus-dark.png) |
| 搜索入口 | [截图](conversation-sidebar-layout/search-light.png) | [截图](conversation-sidebar-layout/search-dark.png) |
| 工作区折叠 | [截图](conversation-sidebar-layout/collapsed-light.png) | [截图](conversation-sidebar-layout/collapsed-dark.png) |
| 500px 窗口 | — | [截图](conversation-sidebar-layout/narrow-dark.png) |

实测值见 [verification.json](conversation-sidebar-layout/verification.json)。检查了标题和操作列不重叠、选中＋悬停的颜色与几何稳定、真实 Tab 焦点、菜单与 Escape、搜索开关、折叠箭头及无水平溢出。测试过程中先修正了临时验收脚本的两处假设：读颜色前须等待主题过渡；窄窗口保持展开抽屉，并不自动修改折叠偏好。最终检查通过，控制台无错误。

验证命令：

```sh
bun run --cwd apps/dashboard typecheck
bun test apps/dashboard/test/behavior/renderer.test.ts --test-name-pattern 'sidebar|workspaces|session-titles'
```

类型检查通过；3 组测试、29 个行为场景通过。另做本地 Electron 亮暗渲染检查，保存 9 张截图。未做真实 Windows 设备或完整读屏、触屏审计。[总表](../current-adaptation.md)的 2026-10-20 展示页记录仍是当日快照，不冒充本轮复测结果。

源码：[侧栏样式](../../../../apps/dashboard/src/features/sessions/sidebar-theme.css)、[工作区分组](../../../../apps/dashboard/src/features/sessions/workspaces.tsx)。

## 减轻选中强调

2026-10-23 后续调整：用户对照 Claude 后，选择将浅色选中背景从 10% 墨色调至 6%（背景 94% + 前景 6%，约 `#eeeeed`），暗色仍为 10%。两种主题的会话标题选中字重均恢复 400，保持 36px 行高、2px 行间距以及既有宽松布局。5% 悬停配方不变。这些比例与字重是 LXE 的局部适配，不是已证实的 Claude 会话侧栏规范。

- [选中配色调整时的浅色](conversation-sidebar-selection/light.png)、[暗色](conversation-sidebar-selection/dark.png)
- [实测值](conversation-sidebar-selection/verification.json)：亮暗选中与选中＋悬停背景、400 字重，以及行高、字号和间距。

## 未选择会话时的空状态

同日补充：通用 `EmptyState` 卡片在横向 flex 容器内按内容取宽、纵向被拉伸，形成一根长圆角底板。会话页改用独立空状态，占满剩余内容区域，背景透明，只有居中的 14px 次要文字；按用户要求移除图标。窄窗口自然换行，不改动其他页面的通用空状态或会话加载、错误提示。

CDS 提供语义文字与中性表面的原则；无图标、14px 和居中布局是 LXE 选择。源码：[ConversationPage.tsx](../../../../apps/dashboard/src/features/sessions/ConversationPage.tsx)、[conversation-theme.css](../../../../apps/dashboard/src/features/sessions/conversation-theme.css)。

- [浅色宽窗口](conversation-empty-state/wide-light.png)、[暗色宽窗口](conversation-empty-state/wide-dark.png)
- [浅色窄窗口](conversation-empty-state/narrow-light.png)、[暗色窄窗口](conversation-empty-state/narrow-dark.png)
- [实测值](conversation-empty-state/verification.json)：1200px／420px × 亮暗主题，共 4 个渲染场景，核对透明背景、无图标、占满父容器宽度、文字居中和无横向溢出。

该补充完成 Dashboard 构建与类型检查，工作区行为组的 15 个场景通过。最终展示通过 `bun run desktop:preview` 启动真正的 Electron 窗口；测试页面的临时 HTTP 服务与 Electron 检查进程已关闭。

## 参考 Claude 截图的文字层级

2026-10-23 后续调整：参考用户提供的 Claude 侧栏截图，将工作区标签、普通会话与当前会话分成三层。截图只能支持视觉比较，无法确定系统缩放、实际 CSS 字号和字体；13px 会话、12px 组名、14px 应用标题均为 LXE 适配值。保持既有字体、36px 会话行、2px 行间距、20px 分组间距、固定菜单列以及 6%／10% 选中背景。

普通会话用 `--cds-secondary`；选中、悬停和键盘焦点使用 `--cds-ink`，字重均为 400。组名和分区标题的浅灰标签色由 40% secondary 与 60% muted 混合，避免直接使用低对比度的 muted；本轮核对了标签及普通会话在默认导航底色上的对比度，未做全站无障碍审计。

- [参考来源说明](conversation-sidebar-reference/reference.json)：用户提供的 Claude 局部截图只在本地比对，不随仓库发布；验收图使用虚构会话。
- 字号调整时的效果（历史快照）：[浅色](conversation-sidebar-reference/light.png)、[暗色](conversation-sidebar-reference/dark.png)、[浅色窄窗口](conversation-sidebar-reference/narrow-light.png)、[暗色窄窗口](conversation-sidebar-reference/narrow-dark.png)
- [实测记录](conversation-sidebar-reference/verification.json)：字号、字重、文字层级、默认对比度、悬停、真实 Tab 焦点、菜单列间隔及窄窗口溢出检查。截图使用示例会话，不是 Claude 运行时证据。

## 移除工作区折叠箭头

同日按用户要求移除工作区名称前的箭头和占位。组名左移，与“工作区”分区标题对齐。保留原按钮、`aria-expanded` 和点击处理，仍可点击名称或通过 Tab 后按 Enter／空格展开、折叠。字号、颜色和会话行间距不变；上方历史截图仍保留当时的箭头。

验证：已有工作区行为组 15 个场景通过；`desktop:preview` 完成构建与类型检查。桌面实测点击名称折叠、Enter 展开、空格折叠及再次点击展开，最终保持展开供用户查看。

## 缩小会话行高度

同日按用户要求，将单行会话从 36px 缩到 32px，上下留白由 8px 改为 6px；保持 13px 字号、20px 文字行高、2px 行间距及 28px 菜单按钮。工作区标题继续使用 36px 高度，分组间距保留 20px。使用最小高度，含工作区副标题的搜索结果仍可自然增高。

- 当前效果：[浅色](conversation-sidebar-density/light.png)、[暗色](conversation-sidebar-density/dark.png)
- [实测记录](conversation-sidebar-density/verification.json)：行高、标题与菜单居中、分组尺寸、搜索结果、亮暗与窄窗口。
