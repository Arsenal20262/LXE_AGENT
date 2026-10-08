# 越南备货：独立计算接口

数据获取复用已有 `yacang-reports-export`，计算复用 `vietnam-replenishment`。AI 按任务决定调用哪一步；已有适用报表可以直接计算，计算失败后也能复用输入，不必重新导出。`calculate` 只执行本地计算，原无参数的一键导出流程不再保留。

## 输入和输出

```sh
lxeskill vietnam replenishment calculate --sales-file "/实际路径/库存动销.xlsx" --inventory-file "/实际路径/当前库存.xlsx" --products-file "/实际路径/商品资料.xlsx"
```

| 参数 | 来源 | 使用字段 |
|---|---|---|
| `--sales-file` | VN8806 库存动销 | SKU、7/15/30 天销量 |
| `--inventory-file` | VN8806 当前库存 | SKU、可用库存、在途数量 |
| `--products-file` | 全局仓库产品资料 | SKU、中文标题、创建时间（上架时间） |
| `--sku-map-file`（可选） | 用户指定的本轮映射表 | SKU、热销标记、成本、跨境价、折扣价 |

未指定映射表时读取应用数据目录的 `skill-data/vietnam-stock-recommendation/sku-map.xlsx`；全局参数始终读取同目录 `parameters.json`。命令不接受参数数值覆盖，不改变桌面保存的文件。

三份报表按现有雅仓原始表头校验，两份库存表只接受 VN8806。报表、参数和映射表固定为本轮输入，运行中替换不影响已读取的数据。SKU 关联、业务规则、模板、Office 重算及结果校验保持原行为。无效来源明确报错，不查询 ERP，不猜路径或改用历史文件。

输出仍是「越南备货清单、雅仓库存、雅仓动销、数据更改、库存商品信息」五张表。只有经过公式、来源投影、SKU 集合、重算结果及参数一致性检查，才发布最终 XLSX。

终端结果额外返回：

- `source_files`：三份报表的 `report`、原始 `path` 和本轮快照 `sha256`，便于核对本轮使用的文件内容。
- `validation`：`status=passed`、通过的检查、工作表名、SKU 数、`missing_mapping_count` 和 `in_transit_mismatch_count`。
- 继续返回 `config`、`config_source`、`sku_map_source` 和 `output_xlsx`；只有最终 XLSX 进入 `files`。

缺少映射行允许生成，但对应备货量按既有规则留空；在途差异取当前库存的值，不以动销表填补空值。来源路径和内容校验不能证明报表同批次、未筛选或平台数据新鲜度；AI 应从导出结果保留范围，已有来源不清楚时向用户确认。

## 阶段衔接

需要采集时调用现有命令：

```sh
lxeskill yacang reports export --report inventory-sales --report inventory --report products --warehouse VN8806
```

取 `data.artifacts` 中对应类型和仓库的文件，不使用创建日期筛选。导出失败遵守雅仓 Skill 的恢复约定；只要求导出就交付原始报表。完整备货任务中，AI 再调用独立计算，校验成功后通过 `send_files` 发送最终文件。计算失败只报告真实错误并保留来源；发送失败只重试发送。

两个命令均使用普通 `exec`，运行中等待同一任务，权限不足走本次执行审批，不改变整个会话权限模式。无需新建导出 Skill 或重复实现 ERP 登录。
