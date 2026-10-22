# 会话侧边栏：宽松布局与文字层级

2026-10-23。在[原配色适配](conversation-sidebar.md)上继续整理布局。用户选择保持宽松，重点是层级、对齐和分组，不增加同屏密度。

## 规则与适配边界

依据 [CDS 原文](../sources/cds-tokens-vanilla.original.md)的 Typography、Sizing、Density adapts to the surface、Muted text rule：界面使用无衬线字体；字号、控件高度和间距协调；密度服从使用场景；重要内容不能过度弱化。

这些原则不规定 LXE 侧栏的具体像素。下列尺寸、折叠箭头、标题省略方式和菜单列均是 **LXE 适配**，没有据此补齐 Claude 会话侧栏的专用规则证据。

| 项目 | 本次实现 |
| --- | --- |
| 应用标题 | 16px、600 字重，40px 高标题行 |
| 新对话 | 14px、500 字重，40px 最小高度 |
| 工作区分区标题 | 12px、次要文字色；与上方操作留出 12px 间距 |
| 工作区名称 | 13px、500 字重、次要文字色；始终可见的折叠箭头 |
| 会话标题 | 14px／20px 行高，选中时 500 字重；正文保持主文字色 |
| 会话行 | 36px 最小高度，行间 2px；工作区之间 20px |
| 对齐 | 8px 行内留白、16px 图标列、8px 图文间距；组名、会话名、加载更多沿同一文字轴对齐 |
| 长标题与菜单 | 省略号 + 固定 32px 操作列；鼠标悬停不移动标题，也不再用渐变遮挡文字 |
| 配色与宽度 | 延续原语义颜色、5% 悬停与 10% 选中；保留默认 256px、拖动范围及记忆宽度 |

字号使用 rem，表中为标准字号下的值。几何调整只在会话侧栏主题作用域内生效，工作区顺序、分页、搜索、重命名和删除处理逻辑保持原样。

## 渲染记录

截图为生产组件配示例数据，不连接真实会话或运行任务，也不是 Claude 原始证据。

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

## 未选择会话时的空状态

同日补充：通用 `EmptyState` 卡片在横向 flex 容器内按内容取宽、纵向被拉伸，形成一根长圆角底板。会话页改用独立空状态，占满剩余内容区域，背景透明，只有居中的 14px 次要文字；按用户要求移除图标。窄窗口自然换行，不改动其他页面的通用空状态或会话加载、错误提示。

CDS 提供语义文字与中性表面的原则；无图标、14px 和居中布局是 LXE 选择。源码：[ConversationPage.tsx](../../../../apps/dashboard/src/features/sessions/ConversationPage.tsx)、[conversation-theme.css](../../../../apps/dashboard/src/features/sessions/conversation-theme.css)。

- [浅色宽窗口](conversation-empty-state/wide-light.png)、[暗色宽窗口](conversation-empty-state/wide-dark.png)
- [浅色窄窗口](conversation-empty-state/narrow-light.png)、[暗色窄窗口](conversation-empty-state/narrow-dark.png)
- [实测值](conversation-empty-state/verification.json)：1200px／420px × 亮暗主题，共 4 个渲染场景，核对透明背景、无图标、占满父容器宽度、文字居中和无横向溢出。

该补充完成 Dashboard 构建与类型检查，工作区行为组的 15 个场景通过。最终展示通过 `bun run desktop:preview` 启动真正的 Electron 窗口；测试页面的临时 HTTP 服务与 Electron 检查进程已关闭。
