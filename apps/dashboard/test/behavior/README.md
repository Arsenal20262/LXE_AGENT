# Renderer 行为回归

从仓库根运行：

```sh
bun test apps/dashboard/test/behavior/renderer.test.ts
bun run --cwd apps/dashboard typecheck
```

测试已纳入根目录的 `bun test` / `bun run verify`。使用仓库锁定的 Vite、React
和 Electron，无新增依赖。需要本机 Electron 能启动；Linux 无桌面环境时需提供
虚拟显示，例如通过 `xvfb-run` 运行。缺少运行条件会明确失败，不会跳过后报通过。

每次先构建测试入口，再用随机本机端口提供静态页面。Electron 使用临时用户目录，
页面中的 RPC 与桌面桥接由内存 fixture 提供，其他网络请求会使测试失败。
测试 runner 使用软件离屏渲染，避免远程 Windows 会话的 GPU 初始化和隐藏窗口降帧影响测试；
仍通过真实的 `requestAnimationFrame` 等待页面更新，并使用原生键盘输入验证交互。
不改变正式应用的硬件加速设置。启动参数中的页面 URL 放在最后，兼容 Electron 的 Windows 参数检查。
结束时清理进程、服务器、构建产物与临时用户目录。

四个测试组共 18 个场景：

- **弹窗（3）**：首次聚焦跳过隐藏及禁用控件，Tab 双向循环；嵌套弹窗只关闭最上层，
  并逐层恢复焦点；没有控件时焦点留在弹窗内。
- **输入框（5）**：中文合成期间 Enter 不发送，Shift+Enter 换行，Enter 正常发送；
  请求未完成时防止重复提交；运行中的按钮执行停止，Enter 仍可排队；模型及思考设置
  保存期间禁止发送；离线时保留草稿、阻止发送及附件操作，恢复后可继续使用。
- **启动与集成（5）**：首页、统计页、会话页分别覆盖两个进程的未就绪组合与恢复；
  实际设置弹窗关闭后恢复侧栏焦点；跳过引导并新建会话时不发统计请求，恢复后显示统计。
- **工作区（5）**：全量目录分组与组内分页；从目录新建草稿；选择器取消、打开目录及真实发送错误；首次发送锁定目录与异步响应隔离；跨目录搜索与已有会话目录只读。支持设置 `LXE_WORKSPACE_SCREENSHOT` 保存界面验收截图。

Tab、Enter、Shift+Enter 通过 Electron 原生输入进入 Chromium；中文合成用 DOM
CompositionEvent 和带 `isComposing` 的 KeyboardEvent，覆盖 React 事件处理分支。
这不替代操作系统输入法的人工验收。拖放使用浏览器 DataTransfer/File 和 DragEvent。

生产的焦点 hook、ConversationComposer、完整 App 及 Query hooks 都直接执行。
断言检查焦点、输入内容、回调参数、请求记录与可见结果。测试 runner 只在完整执行预期
场景后报告成功；构建、加载、断言、超时、Renderer 退出或页面错误均以失败退出。

重写时已验证五个反例会失败：恢复隐藏按钮首次聚焦、去掉最上层弹窗限制、去掉
`isComposing`、绕过当前模型查询的运行时开关、去掉欢迎页的 `enabled` 传递。
这些临时变更已还原。
