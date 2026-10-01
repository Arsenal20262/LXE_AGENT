# 文件预览验收记录

日期：2026-10-01。Kit 固定 0.1.3；React 保持 LXE 原有的 19，未引入第二份 React。

## macOS ARM64

已取得真实结果：

- 文件引用、跨会话产物、目录分页、中文/空格路径、越界符号链接、历史图片、文件修改及删除、文件大小限制。
- Electron 43 / Chromium 实测八组交互：Markdown 本地图片、多标签去重，FortuneSheet 挂载/选择/复制/缩放尺寸，PDF Worker/文字层/实际像素，图片和 HTML 边界，应用菜单，隐藏文件和会话隔离，版本刷新释放，窄窗口和重启恢复。界面截图确认保存缓存值 10、字符串 001 和中文 Word 画面可见。
- XLSX 保存的公式与缓存、多工作表、合并单元格、冻结列；CSV 前导零、公式样字符串及异常输入。
- 真实 DOCX、PPTX、DOC、PPT 转为 PDF，缓存复用；四个源文件哈希保持不变。损坏文件保留 Kit 的 `invalid-document` 诊断。测试文件使用本地生成的中文文档与 DeepSeek Harness 的旧版样本。
- 真实子进程取消、超时、缺失可执行文件；转换串行、共享消费者释放。
- AppKit 返回真实默认应用 TextEdit、15 个关联应用及图标；指定 TextEdit、Electron shell 默认打开及文件定位成功，未知扩展名返回零个关联应用，伪造的失效应用被拒绝。
- 生产 Dashboard 和桌面主进程构建通过；检查两个独立 Worker、PDF 字体/CMap/WASM 和原生 Shell 代码均已进入构建输出。

## 仓库验证

最终 rebase 后执行 `bun run verify:source`：协议生成检查、生产边界、全工作区类型检查通过；JS 为 1,877 通过 / 6 跳过。Python 为 1,964 通过 / 4 跳过，唯一失败是禁止新增根目录 `patches/`。

已将补丁移到 `config/dependency-patches/`，锁文件仅修改三个补丁路径，依赖版本与补丁内容均未变化。修复后 frozen 安装成功，目录约束 8 项、解析 5 项及真实 Chromium 的 8 组界面场景复测通过。依据仓库测试流程，此处做定向复测，没有无变化地重复全量运行。

最新生产 Dashboard / Electron 构建及资源完整性检查通过。原生 Windows 测试在 Mac 上明确跳过，不计为 Windows 验收。

## Windows x64

尚未完成验收。已连接目标 `PC-20240421FADR`（100.87.60.88），通过 Git bundle 同步分支至 `D:\projects\LXE_AGENT`，并由 `wt-claim.ps1` 领取 `file-preview-sidebar`。Bun frozen 依赖同步成功；Python 同步在获取 `hatchling==1.31.0` 的构建依赖时遇到 PyPI `tls handshake eof`，离线缓存则缺少 `editables~=0.3`。

用户开启 VPN TUN 后再次重试，但 SSH 连接超时，Tailscale 将该节点标为离线，未能取得新的 PyPI 同步结果。Windows 定向测试已发起，网络中断后尚未读到完整结果，不计为通过。连接恢复后继续依赖准备、定向测试、内置运行环境真实转换、原生应用关联与离线打包验收。

本记录不将本机测试或静态资源检查等同于 Windows 实机结果。
