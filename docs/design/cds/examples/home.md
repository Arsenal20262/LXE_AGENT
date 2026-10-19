# 首页运行概览

2026-10-19，将首页接入现有 CDS 主题。实现提交：`cfd0172d`。保留最近 24 小时指标、最近 6 个会话、近 7 天最多 5 个活跃技能，以及原有统计和会话跳转。

## 原规则与 LXE 适配

依据是已归档的 [CDS tokens — vanilla](../sources/cds-tokens-vanilla.original.md)，没有新增官方来源。这里展示的是 LXE 首页，不能据此推断 Claude 官方首页的结构。

| CDS 原规则 | 首页的使用方式 | LXE 的具体决定 |
| --- | --- | --- |
| Rules / Purpose：按用途选择表面、文字、边框变量 | 使用共享亮暗主题；连续内容面、主文字、次级说明、元数据分别取语义色 | 亮色白底、暗色暖黑；仅作用于首页内容区域 |
| Muted text rule：说明文字用 secondary，不靠整块透明度 | 指标标签与介绍用 secondary，时间与 Token 元数据用 muted | 问候语 28px；数字使用无衬线等宽数字特性；这些字号并非原文规定 |
| Restraint / Elevation：密集信息优先分隔行，避免层层卡片 | 四个指标取消独立背景和阴影，会话与技能使用 alpha 分隔线 | 指标条、1.3:1 双栏、最大宽度 1120px；内容不足 800px 时合为单栏，560px 内指标变为 2×2 |
| Accent：强调色用于明确的操作；普通内容保持中性 | “查看全部”“查看统计”和重试使用蓝色，悬停底色保持中性 | 首页没有必要增加填充型主按钮；蓝色焦点轮廓帮助键盘定位 |
| Purpose：颜色表达状态 | 执行失败非零时数字用红色；成功率使用绿／黄／红，并保留百分比文字 | 沿用原有成功率阈值：≥98% 绿、≥90% 黄、其余红。阈值是 LXE 逻辑，不是 CDS 原规则 |

共享变量来自 [cds-theme.css](../../../../apps/dashboard/src/shared/cds-theme.css)，页面结构与间距见 [首页主题](../../../../apps/dashboard/src/features/home/theme.css)。侧边栏收起时，首页内容面沿用外壳左上圆角；展开时由侧边栏承担外侧圆角。

## 数据状态与案例

原页面把尚未返回的数据、读取失败和真正的空列表都显示成“暂无数据”。现在分开展示；各区首次读取失败显示实际错误并提供重试，已有数据刷新失败时保留已有内容。错误处理和重试是 LXE 产品行为，不声称来自 CDS。

截图由本地 Electron 中的生产组件配合示例数据生成，不读取真实业务会话。截图中的 `SQLITE_BUSY` 是专门用于验证的测试错误；实际应用显示接口返回的错误。

| 场景 | 截图 |
| --- | --- |
| 亮色／暗色首页 | [亮色](home/home-light.png) · [暗色](home/home-dark.png) |
| 侧边栏展开 | [暗色](home/home-sidebar-dark.png) |
| 480px 英文窗口 | [顶部](home/home-narrow-en.png) · [滚动到底部](home/home-narrow-skills-en.png) |
| 读取中／空列表／局部错误 | [读取中](home/home-loading-dark.png) · [空列表](home/home-empty-dark.png) · [错误](home/home-error-dark.png) |

[Electron 行为检查](../../../../apps/dashboard/test/behavior/home-page.cjs)覆盖数据时间范围、会话键盘打开、查看全部、统计跳转、主题切换、侧栏展开、窄窗口溢出和滚动，以及首次加载／部分失败／全部失败／重试恢复。截图不等同于完整读屏或对比度审计。

原始资料与历史 CSS 快照保持原样；本页记录新增的首页适配。
