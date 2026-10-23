# PR1：最终备货公式交接

## 职责与依赖

- 分支 `codex/final-restock-formulas`，pool-3，确认HEAD `979c33e8`；上游为原main，PR2继承本层。PR #101。
- 本层仅有公式模块、公式测试和本交接；取数、配置、工作簿、CLI及Skill由后续层负责。
- 唯一入口：`services/mabang/amazon/fba/final_restock_recommendation.final_restock_formulas(row_number, *, peak_boost_enabled=True, peak_boost_days=None)`。
- 返回I/J/R/S/U/V/W/X/Y/Z/AA/AB/AC/AI共14个带`=`的公式，供PR2写表。V1旧算法独立保留。

## 有效决策

- 行号为2～1048576的整数。AI为`(R+T+Y+AB)/J`；J为空或0留空，Y/AB空字符串按0。
- U按已确认IF顺序：S≤40急发，40<S≤70空运；S>70且J>5分支判断海运或空运＋海运。
- AA在V或W为空时留空；AC在AB或AD为空时留空，否则相乘并保留真实0。非法非空输入仍暴露错误。
- 旺季天数0～120，空值按30；备注优先级及120天上限保留。底层函数保留旧默认值，正式生成器每轮显式传False；历史保存开关不能启用本轮。
- 不另写一套Python数值算法。源值合法性和文件生命周期由调用方负责；空海运公式未增加AG扣减。
- 规则来源：`YHQUS转换规则.md` SHA256 `69082a327d4395ac6ef7afa50b7e40b485affc13a0b554d47706dc5f3d518165`及2026-10-13用户确认的AA/AC规则；公式更正归位PR1。

## 关键验证证据（历史，不是本轮重跑）

| 对应版本／范围 | 实际证据 |
|---|---|
| 14字段归位修复 `2ee6fb19`，后续包含于979c33e8 | pool-3自身uv环境，公式测试159 passed、无skip，含真实LibreOffice重算及AI边界。 |
| AA/AC空值修复阶段 | 新用例在旧公式失败，修复后136 passed；原34列／13公式样本26039个公式文本差异0，仅证明当时文本一致，不能替代现行35列验收。 |
| 原V1算法 | 旧公式表及计算服务定向69 passed；本层没有修改V1业务模块。 |

命令从仓库根运行：`uv run --frozen --no-sync pytest python/lxeskill_cli/tests/mabang/test_final_restock_recommendation.py -q -rs`。
环境须为当前checkout独立`.venv`；缓存变量只用于测试。LibreOffice缺失时重算项会skip，必须标记NOT VERIFIED。

## 当前边界与追溯

- Microsoft Excel原生计算、Windows、生产ERP、真实模型与附件发送仍NOT VERIFIED；本层无交付命令。
- PR2复用本函数及既有Office执行能力；公开公式契约变化应先修复归位本层，再复核下游。
- 早期13公式／34列和逐轮Git操作记录已压缩；完整原文可用`git show b892ea8f:docs/harness/final-restock-recommendation/handoff-pr1.md`追溯。
- 2026-10-24仅在PR4工作区整理本文，未修改PR1分支／提交或公式测试；本轮实际验证统一记录于[PR4交接](handoff-pr4.md)。
