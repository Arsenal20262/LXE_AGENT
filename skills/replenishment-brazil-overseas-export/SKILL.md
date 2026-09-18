---
name: replenishment-brazil-overseas-export
description: 导出马帮巴西海外仓的原始库存/销量 XLSX，或三个月前已签收、默认三个月待签收调拨单 XLS。用户明确查询巴西海外仓这些数据时使用；不用于 Amazon 店铺补货计算或其他仓库。
type: amazon_replenish
commands:
  - lxeskill replenish brazil-overseas export
---

# 巴西海外仓数据导出

## 使用

当用户明确说明巴西海外仓并请求下列任一数据时，执行一次：

~~~text
lxeskill replenish brazil-overseas export --request-text "<用户完整请求>"
~~~

成功后发送 terminal files 中唯一的原始工作簿。库存/销量是 XLSX；已签收和待签收调拨单是马帮返回的 XLS。不要改名、合并或加工原始文件。

## 请求路由与数据边界

- 库存、库存快照和任意销量表述（包括最近一个月、三个月、7/15/30 天或日度 90 天）都导出同一份马帮原始库存 XLSX：马帮系统-库存-巴西海外仓-北京时间.xlsx。
- 平台源文件仅包含累计 7/28/42 天销量；不得把它描述成 7/15/30 天或日度 90 天数据。
- 已签收请求导出 ERP 页面“三个月前”快捷筛选中的已签收调拨单：马帮系统-已签收-巴西海外仓-北京时间.xls。
- 待签收请求导出 ERP 页面默认三个月范围：马帮系统-3个月待签收-巴西海外仓-北京时间.xls。
- 只说入库、上架、调拨或签收而未说明已签收/待签收时，保留 CLI 的澄清问题；不要猜测状态。

## 安全与失败

- 不手工拼接口、仓库 ID、Cookie、memcacheKey 或下载地址；只调用上面的 CLI。
- CLI 对 401、403、429、风控、无效 XLSX 或导出不确定性会停止。不得刷新登录态或重试该导出。
- 失败时保留 terminal 的实际 error.message；不要把失败说成已导出，也不要猜测文件路径。
