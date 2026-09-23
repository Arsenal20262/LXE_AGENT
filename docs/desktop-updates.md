# Windows 更新与发布

正式版：Windows x64；自动检查间隔 30 分钟，加最多 1 分钟错峰。连接公司网络后检查；自动后台下载，用户确认才重启安装。普通退出不安装。有运行或排队任务时，等待用户结束任务后再次点击。

## 准备和构建

编辑 `config/desktop-release.json` 的版本和说明，并提交源码。首版从 0.2.17 开始，不补录 0.2.16。版本号由发布者决定；开发构建不自动推进正式版本。

在 Windows 仓库根目录运行：

```powershell
bun run desktop:dist:win
```

生成的 `dist/desktop-candidates/<build-id>/candidate.json` 记录源码提交、独立构建编号、大小和 SHA-512，旁边保存固定安装包。构建失败、测试不通过后，可以修改源码、提交并重打同一未发布版本。每次构建获得新编号。候选构建要求干净工作区，构建期间源码提交也不能变化。

## 发布与暂停

测试通过后，指定已经验证的候选包：

```powershell
.\scripts\publish-desktop-windows.ps1 -Candidate 'D:\projects\LXE_AGENT\dist\desktop-candidates\<build-id>\candidate.json'
```

凭据从当前 Windows 用户的 `%LOCALAPPDATA%\LXE\release\cos-credential.xml` 解密，只经标准输入传给发布工具，不进入命令行、源码或安装包。不要在其他电脑复用此加密文件。

上传顺序：安装包 → 按构建编号保存的不可变版本记录 → 正式渠道指针。客户端只认渠道指针。渠道切换前失败的文件是未发布候选；可重试同一包，也可换候选包。发布成功后，同版本不能替换构建；修复需要新版本。

本期只使用一台 Windows 发布机。发布锁位于凭据目录的 `publish.lock`；如果进程意外退出，确认没有发布进程后再手工删除该锁。不同机器并发发布不在本期支持范围内。

```powershell
.\scripts\publish-desktop-windows.ps1 -Action pause
```

暂停保留最后发布版本作为版本下限，不降级。重新发布同一个候选可恢复；发布更高版本也可恢复。已发放的临时链接在到期前仍有效。不要手工编辑 COS 渠道文件绕过发布规则。

COS 布局：

- `artifacts/<version>/<build-id>/LXE-Agent-<version>-windows-x64.exe`
- `releases/<version>/<build-id>/release.json`
- `channels/stable/windows-x64.json`

## 客户端行为

设置卡片右侧：下载中显示圆环和箭头；悬停显示百分比；校验中显示转动圆环；就绪后显示蓝色圆形按钮，悬停或键盘聚焦展开“更新”。点击展示说明和重启确认，设置卡片本身独立响应。

安装前重新在线检查设备身份、正式版本和文件校验值。因此离线时可以继续使用 LXE，但不能启动安装。任务拦截由调度器执行，覆盖全部会话和新任务进入的竞争情况。后台清理失败不安装；可能需要用户手动关闭并重新启动原版应用。

安装尝试及错误保存在安装目录的 `var/updates/last-attempt.json`，不保存签名 URL。下次启动根据实际版本展示上次结果；不会无限自动重试安装。

首版需要手动覆盖安装 0.2.17。现有 0.2.16 不包含更新逻辑。自动更新需在发布下一版本后验证。首次真实覆盖升级应先备份整个 var；数据库有写入时不要直接复制 SQLite 文件作为完整备份。

## 验证边界

独立小程序已经验证了 COS 签名链接与 Electron/NSIS 的兼容性。正式 NSIS 打包和更新器依赖核对已通过；隔离更新器已验证下载、缓存和校验。仍需验证正式 LXE 覆盖升级中的 Agent 子进程退出、数据保留和 WireGuard 连接。详见 [本次验证记录](desktop-updates-validation-20260921.md)。当前实现不承诺安装失败自动回滚，不自动降级，也不绕过系统签名或安装限制。

发布者曾在聊天中提供的密钥应在正式开放更新前更换。服务器只读账户与发布账户分离。
