# 项目验收记录

这里集中保存 LXE 项目已经执行的验证、环境、证据和未完成事项。每篇记录只代表其注明的提交或日期，不代表当前版本已经通过验收；当前行为以对应手册、代码和测试为准。设计归档和外部 API 参考中的原始核验资料保持原位。

## 桌面交互与文件

- [输入框引用](composer-references-acceptance.md)：文件与 Skill 引用、候选菜单及两平台验证。
- [文件预览](file-preview-acceptance.md)：HTML、文档查看器及文件失效状态。
- [工作区用应用打开](20261002-workspace-applications.md)：应用检测、原生启动、图标及两平台验证。
- [Office 运行能力](office-runtime-20260930.md)：文档实测、Windows 前置依赖和证据位置。
- [Office 接口简化与 Kit 0.1.5](office-integration-20261020.md)：Node API、CLI、业务适配及 macOS / Windows 实测。

## 运行环境、数据与更新

- [Bun 1.4.2 升级](bun-1.4.2-validation.md)：源码、实际运行、隔离升级和回退。
- [数据目录分离](data-location-validation.md)：源码和 Windows 隔离安装验证。
- [Windows 更新，2026-10-06](desktop-updates-validation-20261006.md)：更新重构、真实差分及发布校验。
- [Windows 更新，2026-09-21](desktop-updates-validation-20260921.md)：旧实现的验证结果与当时未完成事项。
- [统计与独立飞书网关迁移](native-statistics-acceptance-2026-09-21.md)：历史归属、验证和发布边界。
- [赛狐设备鉴权](saihu-device-access-20260921.md)：本地验证、真实服务器读取和部署范围。

## 业务导出

- [马帮巴西海外仓](mabang-brazil-export-validation.md)：真实接口、文件校验和兼容处理。
- [马帮 TMS](mabang-tms-export-validation.md)：自动化验证、真实验收和未确认事项。
- [雅仓](yacang-export-validation.md)：真实文件与网页对照、字段口径和未完成事项。
- [上马启用商品](shangman-enabled-export-validation.md)：筛选样本、XLSX 范围修复及生产失败记录。
- [越南备货九表](vietnam-nine-sheet-validation.md)：工作簿保真、模板换版、日期系统及跨平台验证。
