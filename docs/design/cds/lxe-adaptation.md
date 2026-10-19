# LXE 如何适配 CDS

本页记录 `d40cc1b8`（设置页）与 `7e2bef2d`（能力页、共享变量）的设计决定。它们是 CDS-inspired 实现，没有安装或调用官方 `@ant/cds` 组件库。

## 实现入口

| 职责 | 当前源码 | 归档快照 |
| --- | --- | --- |
| 共用色彩、亮暗主题和旧变量映射 | [cds-theme.css](../../../apps/dashboard/src/shared/cds-theme.css) | [变量快照](tokens/lxe-theme.snapshot.css) |
| 设置页布局与控件 | [settings-theme.css](../../../apps/dashboard/src/desktop/settings-theme.css) | [设置样式快照](examples/styles/settings-theme.snapshot.css) |
| 能力页与相关详情弹层 | [theme.css](../../../apps/dashboard/src/features/capabilities/theme.css) | [能力样式快照](examples/styles/capabilities-theme.snapshot.css) |

页面样式快照保留原内容，包括原相对 `@import`；它们用于历史核对，不是从文档目录直接运行的页面。完整 JSX 和业务逻辑由 Git 中上述提交保存。

## 规则如何落地

| CDS 原规则 | LXE 采用方式 | 哪部分属于我们的决定 |
| --- | --- | --- |
| 组件使用用途变量 | 设置和能力共用一套主题；兼容原有 `--text`、`--surface` 等名称 | `--cds-ink`、`--cds-surface-nav` 等命名与别名映射 |
| 表面表达层级 | 导航较暗、内容较亮、菜单独立表面 | 暗色弹层 `#232322`，并非 CDS `gray-800` |
| 正文／说明／元数据分级 | 标题、标签用主文字；说明用 secondary；计数等用 muted | 暗色三档文字经 LXE 调整 |
| alpha 边框与中性状态 | 细分隔线、导航选中、目录行悬停、字段边界 | 有些分隔线用更轻的 5%，不是所有边框都用 10% |
| 主按钮要克制 | 设置页保存为主要操作，凭证操作降低强度；技能详情突出“使用” | 蓝色主操作和各页行动优先级 |
| 状态色要有语义 | MCP 错误红、正常绿，模型可用性用语义状态 | 成功／警告／错误实际 hex 为 LXE 配方 |
| 密集列表采用行 | 技能、工具目录用连续表面和细分隔 | 两列目录、折叠分组与窄屏单列 |
| 减少视觉干扰 | 模型页去掉装饰渐变、浮动效果，保留 Logo、选择器和参数 | 模型卡片结构和标签布局 |

## 关键数值对照

以下“原规则”参照 [CDS 原文](sources/cds-tokens-vanilla.original.md)；完整 LXE 声明见[变量表](tokens/README.md)。

| 项目 | CDS 原规则／已提取映射 | LXE 当前值或做法 |
| --- | --- | --- |
| 暗色导航／内容 | `surface-1 = #151515`；`surface-2 = #1a1a19` | 使用这两个值 |
| 暗色弹出层 | `surface-3 = #20201f` | `#232322` |
| 主文字 | `text-primary → neutral-900`，按主题翻转 | 亮 `#0b0b0b`；暗 `#f5f4ed` |
| 次要文字 | `text-secondary → neutral-600` | 亮 `#52514e`；暗 `#bfbdb5` |
| 弱化文字 | `text-muted → neutral-400` | 亮 `#898781`；暗 `#9c9a92` |
| 暗色 ghost 悬停 | 白 7.5% | 白 5% |
| ghost 选中 | 亮 `alpha-2`；暗白 15% | 亮深色 10%；暗白 15% |
| Accent | blue 语义，区分 fill、text、bg、on | 亮 `#184f95`；暗 `#6da7ec`，多个用途经现有别名共用 |
| 主按钮字色 | 原文按 role 区分 `on-*` | 亮白色；暗 `#0b0b0b` |
| 焦点环 | 原文 `focus-shadow` 有 accent 环与柔光 | 字段为隔离环 + 蓝环；按钮为蓝 outline |
| 主题入口 | vanilla 原文 `data-mode`／系统偏好 | LXE `:root[data-theme="dark"]` |
| 禁用控件 | 专用 token；建议尽量避免禁用 | 保留既有禁用逻辑；设置输入仍有整体 opacity |

同色不意味着同一用途。特别是 LXE 的 `--cds-primary` 映射 accent，而原文的 `--fill-primary` 是中性色；这两个名称不能互相替代。

## 布局与作用域

- 设置页：左侧分组导航和搜索，右侧连续表单，底部保存栏；常规宽度的导航为 228px。
- 能力页：标题、下划线标签、内容区；最大内容宽度 1160px。技能／工具两列平面目录，MCP 连续服务行，模型平面卡片。
- 能力详情：技能、工具和用户技能弹层继承同一配色，保留源码、参数和操作。
- 仅作用于 `.desktop-settings-theme` 和 `.capabilities-theme`。聊天、引导流程没有因此整体换主题。
- 新组件如果移到主题容器外的 portal，需要显式获得主题作用域；只复制一个 `var(--cds-*)` 引用不保证变量存在。

这些布局来自用户希望接近 Claude 设置页的方向和 LXE 自身的信息结构，不是 CDS 要求所有产品采用同一种排版。

## 已验证到哪里

两次实现做过定向类型／行为检查和真实 Electron 渲染检查，覆盖亮暗主题、能力四页及详情、键盘焦点、Escape、英文长文本和窄屏。截图和限制见[案例索引](examples/README.md)。

设置任务的全量验证通过。能力任务的全量验证中有一项未改动的文件预览测试首次超时，独立重跑通过；Python 部分另行完成，2401 通过、14 跳过。不能把首次全量运行描述成零失败。

本次收藏任务只核对文件、哈希、引用和快照，不重新运行应用测试。没有据此宣称每个颜色组合都满足某个对比度标准；后续改变表面、文字大小或状态，需要针对实际组合检查。
