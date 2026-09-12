# 雅仓库存动销导出域（2026-09-13）

本次新增 `services/yacang`、`services/agent_cli/yacang` 与 `yacang/inventory_sales` 产物分区，用于四个固定雅仓仓库的库存动销 XLSX 自动导出。

## 边界

- Python 仍是无状态执行器，不读写 Bun Agent 会话数据库；本地产物缓存可随时删除。
- 登录凭据由 Desktop 安全存储管理，通过 `LXE_YACANG_MOBILE`、`LXE_YACANG_PASSWORD` 注入单次进程。Token、验证码和远端文件地址不落盘、不进入结果或日志。
- HTTP 调用使用现有外部请求运行时，不引入页面自动化，也不依赖紫鸟浏览器状态。
- 导出只允许四个已确认仓库，串行提交且不自动重试；队列结果按新任务和 `param_where` 中的仓库过滤条件关联。
- 文件下载只接受雅仓 OSS HTTPS 白名单，并校验大小、MD5（存在时）、XLSX 文件头、固定表头和单仓数据。

`test_dataset_registry.py` 的模块白名单同步加入 `yacang`，使新增产物分区成为显式架构决策。
