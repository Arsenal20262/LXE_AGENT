# 运行状态浮层

2026-10-19，将全局运行状态浮层和右下角开关接入 CDS 适配主题。保留五个状态条目、布局、尺寸、圆角、动画和点击导航。

## 原规则与 LXE 适配

依据是归档的 [CDS tokens — vanilla](../sources/cds-tokens-vanilla.original.md) 中 Token、Muted text、Restraint 和 Purpose 规则。它们支持按用途选择表面、文字和状态色；下面的具体搭配是 **LXE 的实现选择**，不是 Claude 运行状态浮层的官方规范。

- 面板使用不透明的 popover 表面：亮色白色、暗色 `#232322`，搭配 10% 墨色边框与中性阴影，防止后方正文透出。
- 普通图标使用次级文字色和 5% 墨色底，品牌 Logo 保留原图案与颜色。模型名称改为主文字色，避免 Kimi 名称在暗色中沿用旧的深色文字。
- 标签、状态值、检查时间分为次级文字、主文字和元信息三个层次；“设置”和键盘焦点用蓝色。
- 状态分类与汇总优先级沿用原逻辑：正常用绿色，启动／连接中用蓝色，需要处理的状态用红色，中性状态用灰色。未配置的通道、云端仍是中性；模型未配置仍沿用原有 warning 分类，未改变其含义。
- 右下角开关沿用同一表面与主文字色，悬停轻微提亮；关闭图标保持清晰，右上状态点继续反映汇总状态。

实现：[局部主题](../../../../apps/dashboard/src/features/runtime-status/theme.css)、[浮层组件](../../../../apps/dashboard/src/features/runtime-status/view.tsx)、[共享变量](../../../../apps/dashboard/src/shared/cds-theme.css)。

## 截图与验证

截图由本地 Electron 渲染生产组件，状态来自临时示例数据，不代表真实账号或服务连接。

| 状态 | 截图 |
| --- | --- |
| 亮色／暗色 | [亮色](runtime-status/status-light.png) · [暗色](runtime-status/status-dark.png) |
| 开关悬停／条目键盘焦点 | [悬停](runtime-status/status-hover-dark.png) · [焦点](runtime-status/status-focus-dark.png) |
| 正常、启动中、异常与未配置并存 | [暗色](runtime-status/status-mixed-dark.png) |
| 窄窗口 | [暗色](runtime-status/status-narrow-dark.png) |

亮暗主题、Kimi／DeepSeek、混合状态和窄窗口共 441 组元素采样与移除主题时的布局一致；另核对了模型异常提示、Escape 关闭与焦点返回、五个条目的导航目的地。[实测颜色与结果](runtime-status/geometry-and-colors.json)保留供复查。截图只覆盖所列状态，不等于完整的读屏或所有尺寸验证。

Dashboard 类型检查、既有四项运行状态模型测试及 dashboard-pages Electron 行为测试通过。临时视觉检查的预览服务和 Electron 均已退出。
