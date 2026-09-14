---
name: yacang-export-workflow-map
description: 雅仓数据导出路由。用户要求销量 7/15/30、日度 90 天销量、月末库存快照或入库/上架时间导出，但尚未明确具体类型时使用；这是路由 Skill，不直接执行 CLI。
type: yacang_operations
---

# 雅仓数据导出路由

本 Skill 只负责辨别业务类型。执行请求必须读取已注册的具体业务 Skill，不自行拼接雅仓 API、参数、Token 或下载地址。

## 路由

| 用户需求 | 处理方式 |
| --- | --- |
| 库存动销 7/15/30、最近 7/15/30 天销量 | `yacang-sales-monthly-export` |
| 日度 90 天、90 天销量、近 90 天销量 | `yacang-sales-90d-export` |
| 库存列表、当前库存快照、月末库存 | `yacang-inventory-month-end-export`；接口只导出执行时的当前库存，不支持补导历史月末 |
| 入库/上架时间、仓库产品、产品资料导出 | `yacang-inbound-listing-time-export`；业务字段使用雅仓原生“创建时间”，整体输出一份文件 |
| 明确要求按任意创建日期范围导出旧版库存动销原表 | `yacang-inventory-sales-export`，仅作为第一版兼容入口 |

所有具体业务都必须使用已注册命令；禁止自行尝试相似 endpoint、参数组合或生产探测，也不得改走其他雅仓命令冒充成功。

真实调用默认关闭。只有运行环境显式设置 `LXE_YACANG_PROD_ENABLED=true` 且凭据完整时，底层命令才允许获取验证码、登录、提交、轮询或下载；Agent 不得根据“检测到凭据”自行开启生产访问。遇到 403、429、认证异常、导出状态未知或提交结果不明确时，遵从命令返回的停止/跳过结果，不得自行重跑。
