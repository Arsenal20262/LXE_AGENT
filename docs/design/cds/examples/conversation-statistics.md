# 对话欢迎页的统计卡片

2026-10-19，统计卡片沿用对话输入框和文件块的共享配色，保留原有八项指标、时间切换控件、26 周热力图，以及尺寸、间距、字体和圆角。

## CDS 原规则与 LXE 适配

依据是归档的 [CDS tokens — vanilla](../sources/cds-tokens-vanilla.original.md) 中 Token、Muted text、Restraint 和 Purpose 规则：使用语义变量，区分文字层次，保持表面与交互状态克制。

- 卡片使用 panel 表面和 10% 透明边框；指标底色使用 5% 透明墨色，数字用主文字色，标签用次级文字色。
- 时间切换使用中性底色与轻选中态，键盘焦点使用蓝色；保留原控件结构。
- 热力图未活动格使用中性色，有活动的四档使用单一蓝色的深浅梯度。混色比例沿用 28%、52%、76%、100%，统计分档算法未改。

**蓝色热力图及混色比例是 LXE 的可视化选择，不是已确认的 CDS 原始热力图规范。** 日期范围仍只改变上方指标；热力图保持最近 182 天，避免切换时改变形状。

实现：[局部主题](../../../../apps/dashboard/src/features/sessions/conversation-theme.css)、[统计卡片组件](../../../../apps/dashboard/src/features/sessions/welcome.tsx)。共享色值见[对话配色案例](conversation-colors.md)。

## 预览与验证

截图使用本地 Electron 中的生产组件和示例统计数据，不是实际账号数据。

| 状态 | 截图 |
| --- | --- |
| 亮色／暗色 | [亮色](conversation-statistics/statistics-light.png) · [暗色](conversation-statistics/statistics-dark.png) |
| 键盘焦点 | [暗色](conversation-statistics/statistics-focus-dark.png) |
| 较窄窗口 | [暗色](conversation-statistics/statistics-narrow-dark.png) |

对比启用／移除局部主题类时的元素坐标、尺寸、字体、间距及圆角，并核对 7／90／30 天切换和固定 182 格热力图。[测量记录](conversation-statistics/geometry-and-colors.json)包含实测配色；示例数据未出现的活动等级通过隐藏色块读取计算样式。

Dashboard 类型检查、7 项统计汇总测试和既有 Electron readiness 行为检查通过。截图与抽样尺寸检查不代替完整的对比度、读屏和所有窗口尺寸验证。
