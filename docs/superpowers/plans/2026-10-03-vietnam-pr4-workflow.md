# Vietnam Stock Recommendation PR4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用户在聊天中说“生成越南备货清单”时，通过一个确定性命令读取已校验的 SKU 映射表 current、获取同轮 VN8806 雅仓数据、生成并只交付最终五表 XLSX。

**Architecture:** `services.vietnam_replenishment.workflow` 独占执行顺序与输入来源，复用 PR2 导出和 PR3 五表生成。`services.agent_cli.vietnam_replenishment.generate` 仅校验无参数入口并适配 JSON 结果；`vietnam-stock-recommendation` Skill 负责意图与一次附件发送。

**Tech Stack:** Python 3、openpyxl、uv、现有 `shared.office` LibreOffice Kit、Bun 运行时 Skill/catalog 契约测试。

**Spec:** `docs/superpowers/specs/2026-10-03-vietnam-pr4-workflow-design.md`。

## Global Constraints

- 从已与远端核对的 PR3 SHA `a8dd62aa325c5e09fb590f4c3283fb905519b6d4` 建独立 `codex/vietnam-stock-pr4-workflow`；PR4 以 PR3 分支为 base，不在 main 开发。
- 只有 `vietnam_sku_parameter_map/current` 可提供运营参数；没有 current 或内容无效时，在雅仓导出前失败并提示上传。不可接受上传路径、previous 或模板历史值。
- PR2 `export_vietnam_sources()` 一次获取 VN8806 动销、当前库存和全局仓库产品；PR3 `generate_vietnam_workbook()` 负责上架时间、权威在途、SKU 显式成本价格、五表公式和 Office 校验。
- 本 PR 固定 `RecommendationConfig()` 默认 0.8、0.8、0、3900；不接 Desktop 上传/长期配置，也不接受聊天临时覆盖。
- 只交付验证成功的最终 XLSX；失败不交付原始雅仓文件、映射表快照或中间工作簿，不自动重试生产雅仓调用。
- Python 只用本 worktree 的 `uv sync --frozen` / `uv run --frozen`，JS 只用 Bun；测试在仓库根运行并仅用合成数据，不调用生产雅仓。
- 每个小功能：定向测试、检查 diff，然后向用户提议独立 commit；任何 Git 状态修改、push、创建 PR、merge 均遵守已给的分别批准要求。

## File map

- `python/lxeskill_cli/services/vietnam_replenishment/workflow.py`：current 快照、预检、单轮导出与最终生成。
- `python/lxeskill_cli/services/agent_cli/vietnam_replenishment/__init__.py`、`generate.py`：无参数业务命令适配层与真实错误结构。
- `python/lxeskill_cli/lxeskill/business.py`：新 CLI 模块命名规则。
- `python/lxeskill_cli/lxeskill/catalog.json`：命令、deliverable、dataset 和现有两个资产槽的正确说明。
- `skills/vietnam-stock-recommendation/SKILL.md`：越南备货意图、一次命令、一次最终文件发送；与 CLI 在同一可验证步骤创建。
- `skills/southeast-asia-replenishment-workflow-map/SKILL.md`、`config/skill-labels.json`、`docs/harness/skill/current_skill_catalog.md`：意图路由与可见清单。
- `python/lxeskill_cli/tests/vietnam_replenishment/test_workflow.py`、`python/lxeskill_cli/tests/lxeskill/test_vietnam_recommendation_cli.py`：合成业务流和终态契约。
- `python/lxeskill_cli/tests/lxeskill/test_lxeskill_cli.py`、`python/lxeskill_cli/tests/infra/test_dataset_registry.py`、`packages/agent/runtime/test/tooling/lxeskill-command.test.ts`、`packages/agent/runtime/test/tooling/skills.test.ts`：固定数量、模块目录及 Skill 发现断言。
- `docs/harness/vietnam-stock-recommendation/handoff-pr4.md`：收口交接；PR5 范围另述。

---

### Task 1: current 快照与导出前校验

**Files:**
- Create: `python/lxeskill_cli/services/vietnam_replenishment/workflow.py`
- Create: `python/lxeskill_cli/tests/vietnam_replenishment/test_workflow.py`
- Copy approved design: `docs/superpowers/specs/2026-10-03-vietnam-pr4-workflow-design.md`

**Interfaces:**
- Consumes: `shared.input_assets.current_asset(slot_id) -> AssetVersion | None`、`asset_contract.load_sku_parameters(path) -> dict[str, SkuParameters]`。
- Produces: `current_sku_map_snapshot() -> Iterator[Path]` context manager；`VietnamWorkflowError(code, message)`。

- [x] **Step 1: 建立经批准的独立分支。** 已确认工作区干净、PR3 远端 SHA 未变化，并执行 `git switch -c codex/vietnam-stock-pr4-workflow a8dd62aa325c5e09fb590f4c3283fb905519b6d4`。已将批准的设计复制到 Spec 路径，用本 worktree 运行 `uv sync --frozen`，独立 `.venv` 已创建。
- [ ] **Step 2: 先写失败测试。** 在 `test_workflow.py` 使用 openpyxl 写表头 `SKU/成本/跨境价/折扣价/热销标记` 的合成表。覆盖 `current_asset=None`、损坏 XLSX、只有表头无 SKU、有效 current 被替换后的快照内容。每例用 spy 保证失败时未触发 `export_vietnam_sources()`；有效例在进入 context 后改写原 current，再读取快照，验证仍是原来的 SKU 和价格。

```python
from pathlib import Path
from openpyxl import Workbook
from shared.input_assets import AssetVersion
from services.vietnam_replenishment import workflow


def sku_map(path: Path, sku: str = "VN-A", price: int = 20) -> Path:
    book = Workbook()
    book.active.append(("SKU", "成本", "跨境价", "折扣价", "热销标记"))
    if sku:
        book.active.append((sku, 10, price, 15, None))
    book.save(path)
    book.close()
    return path


def test_missing_current_never_calls_export(monkeypatch):
    monkeypatch.setattr(workflow, "current_asset", lambda slot: None)
    monkeypatch.setattr(workflow, "export_vietnam_sources", lambda: (_ for _ in ()).throw(AssertionError("export called")))
    with pytest.raises(workflow.VietnamWorkflowError, match="上传"):
        with workflow.current_sku_map_snapshot():
            pass
```

- [ ] **Step 3: 从仓库根运行** `uv run --frozen --no-sync pytest -q python/lxeskill_cli/tests/vietnam_replenishment/test_workflow.py`；预期因入口尚不存在失败，且没有生产网络调用。
- [ ] **Step 4: 实现最小 preflight。** 读取槽位 current，复制到私有临时目录后对复制件调用 `load_sku_parameters()`；空表显式失败。所有失败都在导出前发生，临时副本由 context manager 清理。

```python
class VietnamWorkflowError(RuntimeError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


@contextmanager
def current_sku_map_snapshot() -> Iterator[Path]:
    version = current_asset("vietnam_sku_parameter_map")
    if version is None:
        raise VietnamWorkflowError("sku_parameter_map_required", "请先上传越南 SKU 参数映射表")
    with TemporaryDirectory(prefix="vietnam-sku-map-") as directory:
        snapshot = Path(directory) / f"current{version.path.suffix}"
        shutil.copyfile(version.path, snapshot)
        parameters = load_sku_parameters(snapshot)
        if not parameters:
            raise VietnamWorkflowError("sku_parameter_map_empty", "当前越南 SKU 参数映射表没有 SKU，请重新上传")
        yield snapshot
```

- [ ] **Step 5: 重跑该定向测试，检查 diff 和敏感数据；向用户提议独立 commit。** 提议备注 `feat: validate current Vietnam SKU map before export`。只有用户明确批准后才执行 Git 状态修改命令。

### Task 2: 确定性导出与最终工作簿生成

**Files:**
- Modify: `python/lxeskill_cli/services/vietnam_replenishment/workflow.py`
- Modify: `python/lxeskill_cli/tests/vietnam_replenishment/test_workflow.py`
- Modify: `python/lxeskill_cli/lxeskill/catalog.json`（只添加 dataset，命令在 Task 3 添加）

**Interfaces:**
- Consumes: Task 1 `current_sku_map_snapshot()`；PR2 `export_vietnam_sources() -> VietnamSources`；PR3 `generate_vietnam_workbook(map_path, output_path, *, sources, config) -> Path`。
- Produces: `generate_current_vietnam_recommendation() -> VietnamRecommendationRun`，其中 `output_xlsx: Path`、`sku_count: int`。

- [ ] **Step 1: 写失败测试。** fake exporter 记录调用次数并返回合成 `VietnamSources`；fake generator 检查 map 路径是快照、`config == RecommendationConfig()`，只写本次 `output_path`。另在 exporter 中替换 current，确认生成器看到旧快照。对 exporter 抛错、generator 抛错断言无最终 XLSX。增加一条 fake exporter + 真实 PR3 generator/Office Kit 的合成端到端测试，核对恰好五表、仓库产品创建时间和当前库存在途。

```python
calls = []
def fake_export():
    calls.append("export")
    return synthetic_vietnam_sources()

def fake_generate(map_path, output_path, *, sources, config):
    calls.append("generate")
    assert load_sku_parameters(map_path)["VN-A"].cross_border_price == Decimal("20")
    assert config == RecommendationConfig()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_bytes(b"synthetic output for orchestration test")
    return output_path

assert calls == ["export", "generate"]
```

- [ ] **Step 2: 运行** `uv run --frozen --no-sync pytest -q python/lxeskill_cli/tests/vietnam_replenishment/test_workflow.py`，确认新测试先失败。
- [ ] **Step 3: 注册 `vietnam_recommendations`，实现组合函数。** 路径须通过 `dataset_dir("vietnam_recommendations", uuid4().hex)` 落在受管 artifact root；`generate_vietnam_workbook` 自己拒绝覆盖并原子发布最终文件。

```python
@dataclass(frozen=True)
class VietnamRecommendationRun:
    output_xlsx: Path
    sku_count: int


def generate_current_vietnam_recommendation() -> VietnamRecommendationRun:
    with current_sku_map_snapshot() as map_path:
        sources = export_vietnam_sources()
        output = dataset_dir("vietnam_recommendations", uuid4().hex) / "越南备货清单.xlsx"
        completed = generate_vietnam_workbook(
            map_path, output, sources=sources, config=RecommendationConfig()
        )
        return VietnamRecommendationRun(output_xlsx=completed, sku_count=len(sources.skus))
```

- [ ] **Step 4: 运行本任务定向测试。** Office Kit 实测只用合成数据；若 Kit 环境缺失，报告真实环境错误，不把 mock 测试冒充端到端通过。检查 diff，向用户提议 `feat: compose Vietnam sources into validated workbook`，获批准后再提交。

### Task 3: 注册 CLI 与单文件交付契约

**Files:**
- Create: `python/lxeskill_cli/services/agent_cli/vietnam_replenishment/__init__.py`
- Create: `python/lxeskill_cli/services/agent_cli/vietnam_replenishment/generate.py`
- Modify: `python/lxeskill_cli/lxeskill/business.py`
- Modify: `python/lxeskill_cli/lxeskill/catalog.json`
- Create: `python/lxeskill_cli/tests/lxeskill/test_vietnam_recommendation_cli.py`
- Create: `skills/vietnam-stock-recommendation/SKILL.md`
- Modify: `python/lxeskill_cli/tests/lxeskill/test_lxeskill_cli.py`
- Modify: `python/lxeskill_cli/tests/infra/test_dataset_registry.py`
- Modify: `packages/agent/runtime/test/tooling/lxeskill-command.test.ts`
- Modify: `packages/agent/runtime/test/tooling/skills.test.ts`

**Interfaces:**
- Consumes: Task 2 `generate_current_vietnam_recommendation()`。
- Produces: `run(arguments: dict) -> dict`；catalog command `lxeskill vietnam stock recommend`，`output_xlsx` 是唯一 deliverable。

- [ ] **Step 1: 写失败契约测试。** 检查 catalog 中新命令的模块、owner、空 schema、无 `x-lxe-asset-slot`、唯一 `output_xlsx` deliverable、失败不交付。对 `run({"map_path":"synthetic-map.xlsx"})` 断言 `invalid_arguments` 且未调用业务层；对空参数 mock 业务结果断言成功字段与一条最终 `files`。更新 Python 命令数 45→46、module 数 39→40、Skill 数 36→37、owner 数 29→30；更新 Bun dataset 模块集合增加 `vietnam`、Skill 发现数量 15→16。`doctor` 统计以实际注册结果校准，不猜计数。

```python
def test_cli_rejects_supplied_map_path_before_business(monkeypatch):
    monkeypatch.setattr(generate, "generate_current_vietnam_recommendation", lambda: (_ for _ in ()).throw(AssertionError("called")))
    result = generate.run({"map_path": "synthetic-map.xlsx"})
    assert result["success"] is False
    assert result["error"]["code"] == "invalid_arguments"
```

- [ ] **Step 2: 运行** `uv run --frozen --no-sync pytest -q python/lxeskill_cli/tests/lxeskill/test_vietnam_recommendation_cli.py python/lxeskill_cli/tests/lxeskill/test_lxeskill_cli.py python/lxeskill_cli/tests/infra/test_dataset_registry.py` 以及 `bun test packages/agent/runtime/test/tooling/lxeskill-command.test.ts packages/agent/runtime/test/tooling/skills.test.ts`，确认相关新增断言先失败。
- [ ] **Step 3: 实现适配层。** 非空参数立即失败；业务异常保留异常类型与真实脱敏、截断诊断，`data.error.code` 保留 `VietnamWorkflowError.code`，`data.output_xlsx` 只在成功时出现；不得返回原始雅仓 paths。使用既有 `safe_remote_detail` 及环境中实际雅仓凭据值进行必要脱敏，不记录映射表内容。

```python
def run(arguments: dict) -> dict:
    if arguments:
        return {"success": False, "status": "failed", "error": {
            "code": "invalid_arguments", "message": "越南备货命令不接受参数或文件路径"
        }}
    try:
        result = generate_current_vietnam_recommendation()
    except Exception as exc:
        detail = safe_remote_detail(
            f"{type(exc).__name__}: {exc}",
            secrets=tuple(os.getenv(name, "") for name in ("LXE_YACANG_MOBILE", "LXE_YACANG_PASSWORD")),
        )
        return {"success": False, "status": "failed", "error": {
            "code": str(getattr(exc, "code", type(exc).__name__)), "message": detail
        }}
    return {"success": True, "status": "completed", "warehouse": "VN8806",
            "sku_count": result.sku_count, "output_xlsx": str(display_path(result.output_xlsx.resolve()))}
```

- [ ] **Step 4: 在 `business.py` 加 `services.agent_cli.vietnam_replenishment.` 对应 `vietnam_replenishment_<module>` 命名校验；注册 catalog entry。** `input_schema` 仅 `{type:object, properties:{}, additionalProperties:false}`；`session_mode=none`；`owner_skills=["vietnam-stock-recommendation"]`；`artifact_paths=[{"field":"output_xlsx","role":"deliverable"}]`；不启用失败交付。更正两个越南资产槽的过期 `holds` 文案。创建完整 `vietnam-stock-recommendation/SKILL.md`：精确触发“生成越南备货清单”，只运行一次新命令，成功且 terminal `files` 恰好一份最终 XLSX 时一次 `send_files`；缺 current 提示上传，其他失败保留真实诊断，发送失败只重试发送，明确不传任意映射路径或默默忽略非默认四参数。
- [ ] **Step 5: 从仓库根运行 AGENTS.md 规定的两端契约测试** `uv run --frozen --no-sync pytest -q python/lxeskill_cli/tests/lxeskill python/lxeskill_cli/tests/infra` 与 `bun test packages/agent/runtime/test/tooling/lxeskill-command.test.ts packages/agent/runtime/test/tooling/skills.test.ts`。确认扫描/测试数量非零和真实退出码；检查 diff 并向用户提议 `feat: expose Vietnam stock recommendation command`，获批准后再提交。

### Task 4: 东南亚入口路由、收口文档与回归

**Files:**
- Modify: `skills/southeast-asia-replenishment-workflow-map/SKILL.md`
- Modify: `config/skill-labels.json`
- Modify: `docs/harness/skill/current_skill_catalog.md`
- Create: `docs/harness/vietnam-stock-recommendation/handoff-pr4.md`

**Interfaces:**
- Consumes: Task 3 已注册的 `vietnam-stock-recommendation` Skill 与 `lxeskill vietnam stock recommend`。
- Produces: 东南亚入口的越南生成路由、中文标签、更新后的技能清单和 PR4 交接。

- [ ] **Step 1: 定点更新路由与清单。** 在东南亚流程入口中，用户要生成越南备货清单时明确转给 `vietnam-stock-recommendation`；其他东南亚来源仍按现有数据采集规则处理。给新 Skill 增加中文标签；把 inventory 更新为总数 37、`replenishment` 16，并说明越南已接完整五表生成、其他来源仍未接计算。此步只改说明与路由文本，不新增与实现重复的测试。
- [ ] **Step 2: 从仓库根运行** `bun test packages/agent/runtime/test/tooling/skills.test.ts` 和 `uv run --frozen --no-sync python -m lxeskill doctor`，确认已注册 Skill 可被发现、命令归属一致。对 Task 3 后未改动的测试不重复运行。
- [ ] **Step 3: 检查实际消息边界。** 阅读新 Skill 和东南亚入口，逐句核对“无 current 零雅仓调用”“成功只发送最终 XLSX 一次”“明确非默认参数不忽略”“独立雅仓导出仍走 yacang-export”；发现偏差时修改文本并重跑受影响的 Skill/doctor 定向检查。
- [ ] **Step 4: 记录此模块真实验证结果。** 只记录已实际运行且退出码、测试数可确认的定向测试；若代码在上次测试后改变，仅重跑受影响部分。
- [ ] **Step 5: 更新 `handoff-pr4.md`。** 记录分支/worktree、依赖 PR3 的 base、入口与调用链、修改文件、默认四参数、`LXE_OFFICE_NODE`/`LXE_OFFICE_CLI` 和雅仓既有凭据来源、合成测试真实结果、已知 PR5 缺口、最终 Git 状态。检查 `git diff --check`、`git status` 和敏感信息/无关改动，向用户汇报范围、结果、风险后提议独立 commit。用户批准后才提交；push、创建 PR、merge 分别另行确认。PR4 收口后不在本任务进入 PR5。

## Verification and handoff gate

完成后记录每条实际命令和结果，尤其 `uv`/Bun 测试的退出码、测试数、Office Kit 是否真实运行。最终至少检查 `git diff --check`、`git status --short --branch`、新 Skill 与 catalog 的 `doctor` 契约、只有最终 XLSX 的 CLI `files`、敏感信息及无关改动。PR4 分支以后以 PR3 分支为 base 创建 PR；未经单独批准不 push 或创建 PR。若合并前更新 base，按项目规范在最终 rebase 后只做一次完整验证。
