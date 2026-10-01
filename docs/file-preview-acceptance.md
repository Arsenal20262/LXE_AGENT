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

完成 Windows 实测发现的修复并最终 rebase 后，`bun run verify:source` 退出码为 0：协议生成检查、生产边界、全工作区类型检查通过；JS 为 **1,877 通过 / 7 跳过 / 0 失败**，Python 为 **1,965 通过 / 4 跳过**。

随后 Windows 实际打包发现资源检查脚本漏导入 `createRequire`，仅补充这一行导入；资源及打包路线的 9 项定向回归通过，继续以实际打包验证该入口，没有重复无关的全量测试。

依赖补丁位于 `config/dependency-patches/`，符合仓库目录约束。Bun/uv 使用 frozen 锁文件。各 worktree 使用自己的 Python 环境，仅复用下载缓存。

最新生产 Dashboard / Electron 构建及资源完整性检查通过。原生 Windows 测试在 Mac 上明确跳过，不计为 Windows 验收。

## Windows x64

验收机：`PC-20240421FADR`。通过 Git bundle 同步分支，由 `wt-claim.ps1` 领取测试 worktree。已取得以下真实结果：

- 定向测试 **19 通过 / 0 失败**，覆盖文件边界、目录分页、历史图片、刷新与释放、串行转换、超时/取消、解析、原生系统应用和资源缺项拒绝。
- 实际 Electron / React 19 界面完成八组场景。使用生产 `app://` 资源处理器，阻断外部请求；PDF 实际创建独立 Worker，切换标签后终止。截图确认中文 Word 内容、公式缓存值 10、前导零 001 正常可见。
- 中文及空格路径的 DOCX、PPTX、DOC、PPT 均转换为 PDF，缓存复用，源文件哈希全部不变。DOCX 缺少 Courier 的诊断保留；损坏文档返回实际 `invalid-document`。
- Windows Shell 返回默认记事本和关联应用图标；私有测试扩展名通过指定应用及 Electron 默认打开，实际收到正确文件路径，文件定位成功。未知扩展名返回空列表，任意应用和移除后的应用均被拒绝。测试结束清理私有注册项。
- 实机发现并修复两处问题：表格 ResizeObserver 同步触发布局循环，改为下一帧合并更新；Shell 全局应用列表包含损坏的无关注册项，改用该文件类型的推荐关联应用。相关系统查询失败仍保留实际异常。

- Windows `Unpacked -Offline` 打包退出码为 0。资源检查确认两个 Worker、PDF 支持资源及许可证齐全；afterPack 使用包内独立 Python/Node 完成 22 项 Office 操作，公式缓存为 10。解包后总体积 1,039.68 MiB，runtime 677.09 MiB，均在现有预算内。
- 将预览服务打包为 Node 模块，再直接使用安装包的 `resources/runtime/node/node.exe` 执行；样本由包内 Python 的 `-I` 隔离模式生成。PATH 只保留包内 Node、Python 和 Windows System32，下载代理设为不可用。四种 Word/PPT 格式的转换、缓存、源文件哈希及损坏文件诊断再次通过。

Windows 测试包位于 `D:\projects\LXE_AGENT\.worktrees\pool-1\dist\desktop-unpacked\win-unpacked\LXE Agent.exe`。本次验证的是解包版应用，不发布安装器或更新渠道；Office 预览所需资源全部随包提供。
