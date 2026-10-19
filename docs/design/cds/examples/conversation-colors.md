# 对话输入框与文件块配色

2026-10-19，将输入框、待发送附件、已发送文件和产出文件块接入共享 CDS 适配主题。按用户要求保留原有布局、尺寸、间距、圆角、字体和控件顺序。

## 原规则与 LXE 适配

来源仍是已归档的 [CDS tokens — vanilla](../sources/cds-tokens-vanilla.original.md)，没有新增官方资料。以下是 LXE 的实现，不代表 Claude 对话页的官方样式。

| CDS 原规则 | 这次的使用方式 | LXE 的具体决定 |
| --- | --- | --- |
| Token rule / Purpose：按背景、文字、边框用途引用变量 | 输入框和文件块复用共享语义变量，亮暗主题一起切换 | 输入框使用 raised surface，文件块使用 panel；具体色值沿用 LXE 已有主题 |
| Muted text rule：说明用 secondary；占位和元信息用 muted | 输入文字和文件名保持高对比，辅助控件与占位文字分级 | 文件类型、应用和模型图标保留原色 |
| Accent rule：一个视图最多一个强调色填充按钮 | 可发送时突出发送按钮；焦点边框、引用使用强调色，其余控件保持中性 | 发送按钮用现有蓝色主题。这是 LXE 的选择；原文另有 clay/brand 用于 send、generate 等动作的说明，不应把蓝色发送按钮说成 CDS 强制规则 |
| Restraint / Elevation：保持克制，区分表面层次 | 中性底色、透明边框和轻阴影；悬停略微增强边界 | 保留原卡片结构与阴影尺寸；这次不应用任何会改变布局的规则，也保留原来的禁用行为 |

## 主要色值

这些是 **LXE 适配值**，生产来源为[共享主题](../../../../apps/dashboard/src/shared/cds-theme.css)和[对话局部主题](../../../../apps/dashboard/src/features/sessions/conversation-theme.css)。

| 用途 | 亮色 | 暗色 |
| --- | --- | --- |
| 输入框底色 | `#ffffff` | `#232322` |
| 文件块底色 | `#ffffff` | `#1a1a19` |
| 主文字 | `#0b0b0b` | `#f5f4ed` |
| 次级文字 | `#52514e` | `#bfbdb5` |
| 占位／元信息 | `#898781` | `#9c9a92` |
| 默认边框 | 主墨色 10% | 白色 10% |
| 文件悬停底色／边框 | 主墨色 5%／20% | 白色 5%／20% |
| 发送／焦点强调色 | `#184f95` | `#6da7ec` |

错误仍使用红色语义变量。发送不可用时使用中性底色；正在运行时保留停止按钮的原有交互。

## 截图与验证

截图来自本地 Electron 中的生产组件与示例数据，不读取真实业务会话。这里只保存组件裁剪图，周围页面保持原主题。

| 状态 | 亮色 | 暗色 |
| --- | --- | --- |
| 空输入框 | [截图](conversation/composer-empty-light.png) | [截图](conversation/composer-empty-dark.png) |
| 输入聚焦／可发送 | [截图](conversation/composer-focused-light.png) | [截图](conversation/composer-focused-dark.png) |
| 运行中／停止按钮 | [截图](conversation/composer-running-light.png) | [截图](conversation/composer-running-dark.png) |
| 产出文件 | [截图](conversation/artifact-light.png) | [截图](conversation/artifact-dark.png) |
| 文件悬停 | [截图](conversation/artifact-hover-light.png) | [截图](conversation/artifact-hover-dark.png) |
| 已发送文件 | [截图](conversation/sent-file-light.png) | [截图](conversation/sent-file-dark.png) |
| 窄窗口输入框 | — | [截图](conversation/composer-narrow-dark.png) |

通过临时移除／重新添加局部主题类，对比亮暗主题及窄窗口下共 40 组元素测量：坐标、宽高、padding、字体、边框宽度和圆角均一致。[实测颜色及测量数量](conversation/geometry-and-colors.json)保留供核对。它只证明这些采样元素的布局未变，不代表穷举了全部内容与窗口尺寸。

验证还包括 dashboard 类型检查，以及既有 composer、references、conversation-content、permissions 四组 Electron 行为测试。文件截图使用测试文件与文件夹定位按钮，未单独保存每一种系统默认应用菜单的截图。

## 补充：跳到最新按钮

同日将浮动的“跳到最新”按钮接入同一主题。这是 LXE 对语义变量与克制用色规则的适配，没有发现 CDS 对此按钮的专门规定。

- 底色使用不透明的 popover surface（亮色 `#ffffff`，暗色 `#232322`），避免下方正文透出。
- 主文字保持清晰；边框默认使用 10% 墨色，悬停增加到 20%，底色混入少量墨色。
- 键盘焦点使用蓝色轮廓。位置、尺寸、间距、字体、圆角与跳转逻辑保持原样。

保存了[亮色](conversation-jump/jump-light.png)、[暗色](conversation-jump/jump-dark.png)、[暗色悬停](conversation-jump/jump-hover-dark.png)和[键盘焦点](conversation-jump/jump-focus-dark.png)截图。四种状态的采样布局测量均与移除局部主题时一致，[测量结果](conversation-jump/geometry-and-colors.json)同时记录了实测颜色与跳转结果。类型检查和既有 conversation-window 行为测试通过；测试所用预览服务与 Electron 已退出。

## 补充：用户消息气泡

“用户消息气泡”指用户已经发送的消息容器；“对话框”通常指弹出的交互窗口。此次只调整气泡与附属控件的配色。

沿用 CDS 的用途变量、文字层级与克制用色原则：正文使用主文字色，时间使用元信息色，文件／技能引用使用强调色。底色取导航表面 94% 与主墨色 6% 的混合，亮色约为 `#eeeeed`、暗色约为 `#222222`；边界使用 5% 墨色，不增加浮起的阴影。混合比例、边界强度和引用的蓝色是 **LXE 适配选择**，并非已确认的 Claude 消息气泡专属规范。

宽度、右对齐、内边距、圆角、字体与换行保持不变。复制按钮沿用原有显隐行为，文件／技能引用补充蓝色焦点轮廓。普通文本、多段文本、排队消息与带附件消息统一应用；助手正文保持原有配色。

保存了[亮色](conversation-bubble/bubble-light.png)、[暗色](conversation-bubble/bubble-dark.png)、[引用焦点](conversation-bubble/bubble-references-dark.png)、[带附件](conversation-bubble/bubble-attachment-dark.png)和[窄窗口](conversation-bubble/bubble-narrow-dark.png)截图，使用生产组件与临时示例数据渲染。亮暗主题及窄窗口共 224 组元素测量与移除局部主题时一致，复制内容完整，助手正文的采样颜色未变；详见[测量结果](conversation-bubble/geometry-and-colors.json)。类型检查及既有 conversation-content、references 两组行为测试通过。预览服务与 Electron 已退出。
