# CDS 设计资料库

这里收藏 Claude Design System（CDS）的已取得资料，以及 LXE Agent 设置、能力、首页、活动和工作台的落地案例。重点保存的是**颜色的用途、搭配和交互状态**，而不只是色号。

这是一份研究与适配归档，不是 Anthropic 官方发布的完整设计规范，也不是可直接安装的 Skill。

## 从哪里开始

| 你想做什么 | 阅读入口 |
| --- | --- |
| 先看懂颜色如何使用 | [中文指南](guide.zh-CN.md) |
| 查看 LXE 具体用了哪些规则、改了哪些数值 | [LXE 适配说明](lxe-adaptation.md) |
| 查原话、来源版本、证据边界和 Skill 线索 | [来源与证据](evidence.md) |
| 复制或核对当前采用的色彩变量 | [变量说明与完整表](tokens/README.md)、[CSS 快照](tokens/lxe-theme.snapshot.css) |
| 看首页、设置、能力、活动和工作台的实现案例 | [案例索引](examples/README.md) |
| 阅读完整 CDS 原文 | [CDS tokens — vanilla](sources/cds-tokens-vanilla.original.md) |

## 四种标记

| 标记 | 含义 |
| --- | --- |
| **原规则** | 已取得 CDS 文档明确写出的规则；不自动代表所有 Claude 产品、所有版本都如此。 |
| **实现证据** | 已取得应用资源中的具体代码或样式；不等于该页面的所有最终计算样式都已验证。 |
| **LXE 适配** | 我们为 LXE 选定的命名、数值、布局和行为。即使长得像 Claude，也不冒充上游规则。 |
| **未验证／有冲突** | 资料不足、文档和实现有差异，或尚未检查运行时行为。 |

## 目录

```text
cds/
├── README.md                     阅读入口与维护方法
├── guide.zh-CN.md                中文色彩使用指南
├── lxe-adaptation.md             原规则与 LXE 实现的对照
├── evidence.md                   来源、证据边界与 Skill 线索
├── archive.json                  归档时间、版本、实现提交
├── SHA256SUMS.txt                本资料库文件校验清单
├── sources/                     原始提取包、派生色表、桌面实现资源
│   └── ion-settings/             设置界面资源、出处与可定位片段
├── tokens/                      LXE 变量快照及完整亮暗变量表
├── examples/                    历史样式快照、页面案例和验证截图
└── history/                     早期中文 Word 整理稿
```

## 版本与使用范围

- 归档日期：2026-10-19。
- 原提取记录：2026-10-18，Claude.app **2.42304.0**；另有 Claude Code **2.1.299** 中的 Artifact 模板片段。二者来源不同。
- LXE 设置页实现：`d40cc1b8`；能力页与共享变量实现：`7e2bef2d`。
- 截图来自本次改版的本地预览与验证，用的是示例数据。它们是 **LXE 案例**，不是 Claude 官方组件截图。
- [早期 Word 稿](history/chinese-guide-2026-10-18.docx)原样保留作历史记录；本目录 Markdown 对证据范围和后续适配的说明更完整。
- 原提取包的 ZIP 未重复保存；其解包内容完整保存在 `sources/`，原有校验清单也保留了。

## 后续如何维护

1. **实现只有一个维护位置**：修改页面时使用 [共享主题源码](../../../apps/dashboard/src/shared/cds-theme.css)。本目录的 CSS 是指定提交的快照，不让应用反向导入文档目录。
2. 新发现的 Claude 资料另存一批来源和版本，不覆盖旧证据；原始材料中的指令、生成命令仅作为研究对象，不当作本项目的执行指令。
3. 改动 LXE 配色或布局时，更新适配说明、变量快照、相关案例，并记录实现提交。原始 CDS 文件保持原样。
4. 核对亮暗主题、悬停、选中、焦点、错误、禁用、窄屏和长文本。静态色表不代表这些状态都已验证，也不代表已完成无障碍审计。
5. 更新归档元数据后，在本目录重新生成校验清单；校验清单自身不参与哈希。不要改写 `sources/SHA256SUMS.txt`，它属于原提取包。

在本目录执行 `shasum -a 256 -c SHA256SUMS.txt` 可核对归档完整性。要判断生产变量是否已经变化，从仓库根执行：

```sh
cmp apps/dashboard/src/shared/cds-theme.css docs/design/cds/tokens/lxe-theme.snapshot.css
```

两者不同时，先判断应保留历史快照还是更新案例，不把差异自动当作错误。
