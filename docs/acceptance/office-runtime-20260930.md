# Office 运行能力验收（2026-09-30）

实现提交：`58349599`。Kit 固定 `0.1.3`，macOS ARM64 与 Windows x64 原生引擎也为 `0.1.3`。范围为三个独立 Office skill、共享 Python 入口和内置运行资源。

## 文档实测

| 环境 | 运行方式 | 结果 |
| --- | --- | --- |
| macOS ARM64 开发环境 | worktree 自有 `.venv`、准备脚本生成的独立 Node 和 Kit | 22 项操作通过 |
| Windows x64 候选资源 | 独立 Node 和 Kit 0.1.3 | 22 项操作通过，人工查看三种格式的预览 |
| Windows x64 实际应用包 | 包内 Python/Node/Kit，清除开发机 PATH、Python 和 Node 模块路径 | 22 项操作通过 |

`scripts/verify-office-runtime.py` 实际创建并定向修改 XLSX、DOCX、PPTX，覆盖中文和空格路径。三种文件都完成结构检查、图片渲染与 PDF 导出；Excel 保留其他工作表和公式，重算缓存为 `10`；Word 保留粗体、表格、页眉和图片；PPT 保留两页、粗体和图片，修改后的图表数据为 `42, 20`。

损坏文件、已有输出、输入输出同路径、缺少引擎、超时和取消均产生失败结果；原文件散列保持不变。预览检查要求有实际内容，防止透明图片或仅有一个异常像素的图片误通过。人工检查确认中文、表格和图表可见。

原方案的 Kit 0.1.2 在 Mac 原生引擎 0.1.1 上产生透明预览，Windows 原生引擎 0.1.2 的 XLSX 预览也异常。隔离验证 0.1.3 后，经用户确认升级固定版本；不保留系统 LibreOffice 兜底。

## Windows 打包与安装前置依赖

正式 `build-desktop-windows.ps1 -PackageTarget Unpacked` 已成功。包内验收记录的解释器为 `dist/desktop-unpacked/win-unpacked/resources/runtime/python/python.exe`，不是开发环境 Python。完整包为 **1029.65 MiB**，其中运行资源 **677.09 MiB**，Office 单独占 **209.55 MiB**，未提高现有体积限制。

基于已验收应用包，真实 electron-builder/NSIS 编译成功生成 `build/office-installer/LXE-Agent-0.1.0-windows-x64.exe`，大小 **420,921,759 字节**。安装器未发布，也未覆盖该机已有 LXE 应用；VC++ 场景使用从正式安装脚本直接包含的同一前置函数测试。

打包校验覆盖原生引擎全部 731 项上游清单文件，包括许可证、来源材料和字体资源。Office 的 `node_modules` 使用独立资源来源复制，避免 electron-builder 默认过滤根级依赖目录造成漏包。

经用户授权，在 Windows 验收机实际卸载了 VC++ v14 x64 14.44。卸载退出码为 `0`，注册状态消失，Kit 转换失败并返回真实错误 `LibreOffice helper returned an invalid response (exit 3221225781)`。随包离线安装器成功安装 VC++ 14.51.36247，返回 `3010`（需要重启）。其他架构和旧版 VC++ 未卸载。

该测试发现当前 NSIS 的 `ExecShellWait` 不返回子进程退出码，导致安装已成功却被误判失败。实现改用 `ShellExecuteEx` 和 `GetExitCodeProcess`。真实编译运行 `apps/desktop/test/fixtures/office-prerequisite-exit-codes.nsi`，确认成功 `0`、失败 `42`、重启 `3010` 及缺少程序的 Win32 错误 `2` 均正确保留。

修复后完整缺失场景的第二轮测试被 Windows 安装服务的待重启状态阻止：卸载日志为 `0x8007015e`、退出码 `3010`，VC++ 仍为已安装状态。已请求用户确认重启，不能把这一轮记为通过。

## 源码验证

最终 rebase 无基线变化，执行一次 `bun run verify:source`，协议生成、TypeScript 边界和八个工作区的类型检查通过。Bun 全量为 1858 通过、5 跳过、1 失败；失败是旧测试要求整个安装脚本以卸载守卫开头，新增安装分支后该假设失效。修正为分别检查安装与卸载守卫，定向 5 项通过。

继续执行此前被短路的 Python 全量阶段：1964 通过、4 跳过、1 失败。失败是 doctor 测试仍断言 34 个 skill，实际已为 36 个；更新数量断言后定向复测通过。两处均只调整测试预期，生产实现未变，因此没有重复整套测试。测试修正提交为 `f42e04db`。

另外，三个 skill 均通过 frontmatter 校验，实际加载器在 `default` 权限下发现全部三个且未增加业务命令；项目 wheel 包含共享检查器和许可证；NSIS 真实退出码回归通过。

## 证据位置

- Mac：`build/office-smoke/正式 0.1.3/` 内的 `report.json`、`diagnostics.json` 和文档产物。
- Windows worktree：`build/office-smoke/candidate-0.1.3/`、`build/office-vc-acceptance/`、`build/office-vc-acceptance-v2/`。
- Windows 包内验收产物：`C:\Users\Administrator\AppData\Local\Temp\lxe-office-验收 3ez2zoaa`。
- Windows 应用包与体积报告：`dist/desktop-unpacked/`。
- 全量源码验证日志：Mac `/tmp/lxe-office-verify-source.log`、`/tmp/lxe-office-verify-python.log`；Python 定向复测为 `/tmp/lxe-office-doctor-targeted.log`。

这些目录保留真实输出；失败日志没有被成功结果覆盖。
