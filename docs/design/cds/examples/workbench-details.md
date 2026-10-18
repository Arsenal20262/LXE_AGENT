# 工作台的三个功能页面

2026-10-19，继续将 LXE 工作台的越南备货设置、亚马逊 AI 人物标签、模板与数据源接入共享主题。目录里的“工具”改为“功能”，避免与“能力 → 工具”混淆。这些名称和页面结构属于 LXE 适配。

## 原规则与本次适配

依据仍是已归档的 [CDS tokens — vanilla](../sources/cds-tokens-vanilla.original.md)，没有新增官方规范证据，也没有安装官方 CDS 组件库。

| 已确认的原规则 | 本次采用 | LXE 的具体决定 |
| --- | --- | --- |
| Rules / Purpose：按用途使用表面、文字、边框变量，主题切换由变量负责 | 三页共用现有 `cds-theme.css`；组件不另写亮暗色值 | 白色／暖黑内容面；页面最大宽度 1040px，沿用外壳左上圆角 |
| Muted text rule：说明文字用 secondary，不用整体透明度淡化文字 | 标题、说明、版本元数据分层；移除上一版整行 opacity | 上一版文件名用次级文字色；保留内部文件标识与实际错误 |
| Restraint：普通按钮优先 secondary；密集列表用分隔行 | 设置与资产列表取消嵌套卡片和阴影，使用 alpha 分隔线 | 设置行、底部保存区、当前／上一版双行布局 |
| Accent：每个视图最多一个 accent 填充按钮 | 保存、扫描、生成使用蓝色；扫描完成后扫描按钮改为普通按钮 | 主操作随流程推进；媒体处理的“生成副本”属于用户操作，不套用 Claude 的 clay 品牌色 |
| Purpose：输入框使用 fill-field；提供 focus-visible 反馈 | 沿用共享的亮色半透明白／暗色 alpha-1 输入底色和蓝色焦点 | 输入框高度 38px、圆角 8px，按钮最小高度 36px；焦点环细节为 LXE 实现 |
| 语义色区分状态，不代替整个界面的中性层次 | 失败用红色，成功用绿色，部分失败用警示色 | “不支持的文件”用中性色，与处理错误分开；空列表、加载和原始错误各自展示 |

`--cds-primary` 是 LXE 对 accent 蓝的别名，不等于原文中取中性色的 `--fill-primary`。具体色值沿用[共享主题](../../../../apps/dashboard/src/shared/cds-theme.css)，不把截图吸色作为来源。

原文建议少用 disabled；这里保留缺少输入、任务执行中和重复提交保护所需的禁用状态。它们是既有流程约束。本次并未声称逐条照搬全部 CDS 规则。

## 页面与截图

截图使用本地 Electron 中的生产组件和示例数据，不是真实业务文件，也不是 Claude 官方界面。媒体列表中的错误同样是测试输入；生产界面仍显示实际桥接层返回的错误。

| 页面／状态 | 亮色 | 暗色 |
| --- | --- | --- |
| 越南备货设置，上传后 | [截图](workbench-details/vietnam-light.png) | [截图](workbench-details/vietnam-dark.png) |
| 媒体，选择来源 | [截图](workbench-details/media-start-light.png) | [截图](workbench-details/media-start-dark.png) |
| 媒体，检查与输出区域 | [截图](workbench-details/media-review-light.png) | [截图](workbench-details/media-review-dark.png) |
| 模板与数据源 | [截图](workbench-details/assets-light.png) | [截图](workbench-details/assets-dark.png) |
| 媒体执行中／部分失败结束 | — | [执行中](workbench-details/media-running-dark.png) · [部分失败](workbench-details/media-complete-dark.png) |
| 资产为空／尚未上传与缺失文件 | — | [空列表](workbench-details/assets-empty-dark.png) · [状态区域](workbench-details/assets-states-dark.png) |
| 480px 英文界面 | — | [设置](workbench-details/vietnam-narrow-en.png) · [媒体](workbench-details/media-narrow-en.png) · [媒体结果](workbench-details/media-results-narrow-en.png) · [资产](workbench-details/assets-narrow-en.png) |

## 实现与检查

- [共享页面标题](../../../../apps/dashboard/src/features/workbench/page-header.tsx)和[三个子页面的主题样式](../../../../apps/dashboard/src/features/workbench/detail-theme.css)。`.workbench-theme` 从目录扩展到全部工作台页面；目录徽章样式收窄，避免误影响保存提示。
- [设置页](../../../../apps/dashboard/src/features/workbench/vietnam-settings-view.tsx)、[媒体流程](../../../../apps/dashboard/src/features/workbench/view.tsx)、[文件版本页](../../../../apps/dashboard/src/features/workbench/input-assets-view.tsx)。数据读写接口、参数换算、媒体任务与取消机制保持原有实现。
- [新增 Electron 检查](../../../../apps/dashboard/test/behavior/workbench-details.cjs)：深浅主题、480px 英文布局、局部表格滚动、进度与任务状态、资产刷新等待／失败／恢复、按文件标识打开目录。原有设置与媒体流程测试继续覆盖保存、导出、扫描、取消和输出。

这些截图与检查不等同于全面读屏或对比度审计。此前[目录案例](activity-workbench.md)和历史样式快照保留原样；本页记录后续扩展。
