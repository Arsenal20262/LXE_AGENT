"""The Vietnam workflow uses one validated current map and one Yacang run."""

from __future__ import annotations

from dataclasses import replace
from decimal import Decimal
import os
from pathlib import Path
import shutil

from openpyxl import Workbook, load_workbook
import pytest

from services.vietnam_replenishment import recalculation, workflow, yacang_sources
from services.vietnam_replenishment.asset_contract import load_sku_parameters
from services.vietnam_replenishment.workbook import RecommendationConfig
from services.vietnam_replenishment.yacang_sources import VietnamSourceError, VietnamSources
from services.vietnam_replenishment import sku_map_store as store
from services.yacang.validation import (
    INVENTORY_LIST_HEADERS, INVENTORY_SALES_HEADERS, WAREHOUSE_PRODUCTS_HEADERS,
)
from shared import input_assets


def _sku_map(
    path: Path, *, sku: str | None = "VN-A", cost: int | None = 10,
    price: int | None = 20, discount: int | None = 15,
) -> Path:
    book = Workbook()
    try:
        book.active.append(("SKU", "成本", "跨境价", "折扣价", "热销标记"))
        if sku is not None:
            book.active.append((sku, cost, price, discount, None))
        book.save(path)
    finally:
        book.close()
    return path


@pytest.fixture(autouse=True)
def isolated_maps(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(input_assets, "input_root", lambda: tmp_path / "inputs")
    for name in (
        "LXE_VIETNAM_WEIGHT_30D", "LXE_VIETNAM_WEIGHT_15D",
        "LXE_VIETNAM_WEIGHT_7D", "LXE_VIETNAM_EXCHANGE_RATE",
    ):
        monkeypatch.delenv(name, raising=False)


def _current(monkeypatch: pytest.MonkeyPatch, path: Path) -> Path:
    mutation = store.install_sku_map(path, None)
    assert mutation.status == "installed"
    return store.inspect_sku_map().current.path


def _no_export(monkeypatch: pytest.MonkeyPatch) -> None:
    def unexpected_export() -> None:
        raise AssertionError("Yacang export must not start before map preflight")

    monkeypatch.setattr(workflow, "export_vietnam_sources", unexpected_export)


def _sources() -> VietnamSources:
    sku = "VN-A"
    return VietnamSources(
        skus=(sku,),
        sales={sku: {
            "SKU": sku, "仓库": "VN8806", "7天销量": 0,
            "15天销量": 0, "30天销量": 0, "在途": 99,
        }},
        inventory={sku: {
            "SKU": sku, "仓库": "VN8806", "库存数量": 7,
            "占用数量": 2, "在途数量": 3, "可用库存": 5,
        }},
        products={sku: {
            "SKU": sku, "中文标题": "合成产品 A", "创建时间": "2026-09-23 10:00",
        }},
        missing_sales=(), missing_inventory=(), missing_products=(),
        in_transit={sku: Decimal("3")}, missing_in_transit=(),
        in_transit_mismatch=(sku,), artifacts={},
    )


def _report_artifacts(tmp_path: Path) -> list[dict[str, object]]:
    """Three synthetic exports with the same source values for both workflows."""
    reports = (
        ("inventory-sales", INVENTORY_SALES_HEADERS, {
            "SKU": "VN-A", "仓库": "VN8806", "7天销量": 0,
            "15天销量": 0, "30天销量": 0, "在途": 99,
        }, "VN8806"),
        ("inventory-current-snapshot", INVENTORY_LIST_HEADERS, {
            "SKU": "VN-A", "仓库": "VN8806", "库存数量": 7,
            "占用数量": 2, "在途数量": 3, "可用库存": 5,
        }, "VN8806"),
        ("warehouse-products", WAREHOUSE_PRODUCTS_HEADERS, {
            "SKU": "VN-A", "中文标题": "合成产品 A", "创建时间": "2026-09-23 10:00",
        }, None),
    )
    artifacts: list[dict[str, object]] = []
    for report, headers, row, warehouse in reports:
        path = tmp_path / f"{report}.xlsx"
        book = Workbook()
        try:
            book.active.append(headers)
            book.active.append([row.get(header) for header in headers])
            book.save(path)
        finally:
            book.close()
        artifacts.append({
            "report": report, "warehouse": warehouse, "created_date": None,
            "path": str(path),
        })
    return artifacts


def test_missing_current_prompts_upload_before_export(monkeypatch: pytest.MonkeyPatch) -> None:
    _no_export(monkeypatch)

    with pytest.raises(workflow.VietnamWorkflowError, match="上传") as error:
        workflow.generate_current_vietnam_recommendation()
    assert error.value.code == "sku_parameter_map_required"


def test_legacy_current_without_manifest_stops_before_export(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    legacy = tmp_path / "inputs" / "vietnam" / "sku_parameter_map" / "current"
    legacy.mkdir(parents=True)
    _sku_map(legacy / "untrusted.xlsx")
    _no_export(monkeypatch)
    with pytest.raises(workflow.VietnamWorkflowError, match="上传") as error:
        workflow.generate_current_vietnam_recommendation()
    assert error.value.code == "sku_parameter_map_required"


def test_broken_current_stops_before_export(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    path = tmp_path / "broken.xlsx"
    path.write_bytes(b"not an xlsx")
    version = _current(monkeypatch, _sku_map(tmp_path / "valid.xlsx"))
    version.write_bytes(path.read_bytes())
    _no_export(monkeypatch)

    with pytest.raises(workflow.VietnamWorkflowError, match="ZIP") as error:
        workflow.generate_current_vietnam_recommendation()
    assert error.value.code == "sku_parameter_map_invalid"


def test_empty_current_stops_before_export(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    invalid = _sku_map(tmp_path / "empty.xlsx", sku=None)
    version = _current(monkeypatch, _sku_map(tmp_path / "valid.xlsx"))
    version.write_bytes(invalid.read_bytes())
    _no_export(monkeypatch)

    with pytest.raises(workflow.VietnamWorkflowError, match="没有 SKU") as error:
        workflow.generate_current_vietnam_recommendation()
    assert error.value.code == "sku_parameter_map_empty"


@pytest.mark.parametrize(
    ("field", "values"),
    [
        ("cost", {"cost": None}),
        ("cross_border_price", {"price": None}),
        ("discount_price", {"discount": None}),
    ],
)
def test_blank_sku_price_reaches_export_from_trusted_current(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, field: str, values: dict[str, None]
) -> None:
    _current(monkeypatch, _sku_map(tmp_path / "incomplete.xlsx", **values))
    monkeypatch.setattr(workflow, "dataset_dir", lambda *parts: tmp_path / "artifacts" / parts[-1])
    export_calls: list[str] = []

    def fake_export() -> VietnamSources:
        export_calls.append("VN8806")
        return _sources()

    def fake_generate(map_path: Path, output_path: Path, *, sources: VietnamSources,
                      config: RecommendationConfig) -> Path:
        assert getattr(load_sku_parameters(map_path)["VN-A"], field) is None
        assert sources.skus == ("VN-A",)
        output_path.parent.mkdir(parents=True)
        output_path.write_bytes(b"synthetic final workbook")
        return output_path

    monkeypatch.setattr(workflow, "export_vietnam_sources", fake_export)
    monkeypatch.setattr(workflow, "generate_vietnam_workbook", fake_generate)
    result = workflow.generate_current_vietnam_recommendation()
    assert result.sku_count == 1
    assert export_calls == ["VN8806"]


def test_snapshot_is_private_stable_and_removed(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    current = _sku_map(tmp_path / "current.xlsx", price=20)
    _current(monkeypatch, current)

    with workflow.current_sku_map_snapshot() as snapshot:
        assert snapshot != current
        assert snapshot.is_file()
        revision = store.inspect_sku_map().revision
        store.install_sku_map(_sku_map(tmp_path / "replacement.xlsx", price=40), revision)
        assert load_sku_parameters(snapshot)["VN-A"].cross_border_price == Decimal("20")
    assert not snapshot.exists()


def test_one_export_uses_snapshot_and_default_config(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    current = _sku_map(tmp_path / "current.xlsx", price=20)
    _current(monkeypatch, current)
    monkeypatch.setattr(workflow, "dataset_dir", lambda *parts: tmp_path / "artifacts" / parts[-1])
    sources = _sources()
    calls: list[str] = []

    def fake_export() -> VietnamSources:
        calls.append("export")
        revision = store.inspect_sku_map().revision
        store.install_sku_map(_sku_map(tmp_path / "replacement.xlsx", price=40), revision)
        return sources

    def fake_generate(map_path: Path, output_path: Path, *, sources: VietnamSources, config: RecommendationConfig) -> Path:
        calls.append("generate")
        assert map_path != current
        assert load_sku_parameters(map_path)["VN-A"].cross_border_price == Decimal("20")
        assert sources is expected_sources
        assert config == RecommendationConfig()
        output_path.parent.mkdir(parents=True)
        output_path.write_bytes(b"synthetic final workbook")
        return output_path

    expected_sources = sources
    monkeypatch.setattr(workflow, "export_vietnam_sources", fake_export)
    monkeypatch.setattr(workflow, "generate_vietnam_workbook", fake_generate)

    result = workflow.generate_current_vietnam_recommendation()
    assert calls == ["export", "generate"]
    assert result.sku_count == 1
    assert result.config == RecommendationConfig()
    assert result.config_source == "default"
    assert result.output_xlsx.name == "越南备货清单.xlsx"
    assert result.output_xlsx.read_bytes() == b"synthetic final workbook"


def test_resolve_recommendation_config_defaults_only_when_all_absent() -> None:
    assert workflow.resolve_recommendation_config({}) == (RecommendationConfig(), "default")
    configured = {
        "LXE_VIETNAM_WEIGHT_30D": "0.7",
        "LXE_VIETNAM_WEIGHT_15D": "0.6",
        "LXE_VIETNAM_WEIGHT_7D": "0.1",
        "LXE_VIETNAM_EXCHANGE_RATE": "4000",
    }
    config, source = workflow.resolve_recommendation_config(configured)
    assert config == RecommendationConfig(
        weight_30d=Decimal("0.7"), weight_15d=Decimal("0.6"),
        weight_7d=Decimal("0.1"), exchange_rate=Decimal("4000"),
    )
    assert source == "environment"


def test_nondefault_config_reaches_generator_and_result(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    _current(monkeypatch, _sku_map(tmp_path / "current.xlsx"))
    monkeypatch.setattr(workflow, "dataset_dir", lambda *parts: tmp_path / "artifacts" / parts[-1])
    for name, value in {
        "LXE_VIETNAM_WEIGHT_30D": "0.7",
        "LXE_VIETNAM_WEIGHT_15D": "0.6",
        "LXE_VIETNAM_WEIGHT_7D": "0.1",
        "LXE_VIETNAM_EXCHANGE_RATE": "4000",
    }.items():
        monkeypatch.setenv(name, value)
    calls: list[str] = []

    def fake_export() -> VietnamSources:
        calls.append("export")
        return _sources()

    def fake_generate(
        _map_path: Path, output_path: Path, *, sources: VietnamSources, config: RecommendationConfig,
    ) -> Path:
        calls.append("generate")
        assert sources.skus == ("VN-A",)
        assert config == RecommendationConfig(
            weight_30d=Decimal("0.7"), weight_15d=Decimal("0.6"),
            weight_7d=Decimal("0.1"), exchange_rate=Decimal("4000"),
        )
        output_path.parent.mkdir(parents=True)
        output_path.write_bytes(b"synthetic final workbook")
        return output_path

    monkeypatch.setattr(workflow, "export_vietnam_sources", fake_export)
    monkeypatch.setattr(workflow, "generate_vietnam_workbook", fake_generate)
    result = workflow.generate_current_vietnam_recommendation()
    assert calls == ["export", "generate"]
    assert result.config.exchange_rate == Decimal("4000")
    assert result.config_source == "environment"


@pytest.mark.parametrize(
    ("change", "value"),
    [
        ("LXE_VIETNAM_WEIGHT_15D", None),
        ("LXE_VIETNAM_WEIGHT_7D", ""),
        ("LXE_VIETNAM_WEIGHT_30D", "-0.1"),
        ("LXE_VIETNAM_EXCHANGE_RATE", "0"),
        ("LXE_VIETNAM_WEIGHT_30D", "0.1234567890123456"),
        ("LXE_VIETNAM_WEIGHT_30D", "1e9999"),
        ("LXE_VIETNAM_WEIGHT_30D", "1e-9999"),
        ("LXE_VIETNAM_WEIGHT_30D", "1e9999999999"),
        ("LXE_VIETNAM_WEIGHT_30D", "1.23456789012345e-310"),
        ("LXE_VIETNAM_WEIGHT_30D", "NaN"),
        ("LXE_VIETNAM_WEIGHT_30D", "Infinity"),
        ("LXE_VIETNAM_WEIGHT_30D", "not-a-number"),
    ],
)
def test_partial_or_invalid_config_stops_before_yacang(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, change: str, value: str | None,
) -> None:
    _current(monkeypatch, _sku_map(tmp_path / "current.xlsx"))
    for name, raw in {
        "LXE_VIETNAM_WEIGHT_30D": "0.7",
        "LXE_VIETNAM_WEIGHT_15D": "0.6",
        "LXE_VIETNAM_WEIGHT_7D": "0.1",
        "LXE_VIETNAM_EXCHANGE_RATE": "4000",
    }.items():
        monkeypatch.setenv(name, raw)
    if value is None:
        monkeypatch.delenv(change)
    else:
        monkeypatch.setenv(change, value)
    _no_export(monkeypatch)
    with pytest.raises(workflow.VietnamWorkflowError) as error:
        workflow.generate_current_vietnam_recommendation()
    assert error.value.code == "recommendation_config_invalid"


def test_export_error_does_not_start_generation(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _current(monkeypatch, _sku_map(tmp_path / "current.xlsx"))
    output_root = tmp_path / "artifacts"
    monkeypatch.setattr(workflow, "dataset_dir", lambda *parts: output_root / parts[-1])

    def fail_export() -> VietnamSources:
        raise VietnamSourceError("三份来源中库存列表失败")

    monkeypatch.setattr(workflow, "export_vietnam_sources", fail_export)
    monkeypatch.setattr(
        workflow, "generate_vietnam_workbook",
        lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError("generator called")),
    )

    with pytest.raises(VietnamSourceError, match="库存列表失败"):
        workflow.generate_current_vietnam_recommendation()
    assert not output_root.exists()


def test_empty_export_sku_set_does_not_start_generation(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _current(monkeypatch, _sku_map(tmp_path / "current.xlsx"))
    output_root = tmp_path / "artifacts"
    monkeypatch.setattr(workflow, "dataset_dir", lambda *parts: output_root / parts[-1])
    monkeypatch.setattr(workflow, "export_vietnam_sources", lambda: replace(_sources(), skus=()))
    monkeypatch.setattr(
        workflow, "generate_vietnam_workbook",
        lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError("generator called")),
    )

    with pytest.raises(workflow.VietnamWorkflowError, match="没有 SKU") as error:
        workflow.generate_current_vietnam_recommendation()
    assert error.value.code == "current_skus_empty"
    assert not output_root.exists()


def test_failed_generation_removes_partial_final_output(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _current(monkeypatch, _sku_map(tmp_path / "current.xlsx"))
    output_root = tmp_path / "artifacts"
    monkeypatch.setattr(workflow, "dataset_dir", lambda *parts: output_root / parts[-1])
    monkeypatch.setattr(workflow, "export_vietnam_sources", _sources)

    def fail_generate(_map_path: Path, output_path: Path, *, sources: VietnamSources, config: RecommendationConfig) -> Path:
        output_path.parent.mkdir(parents=True)
        output_path.write_bytes(b"incomplete")
        raise RuntimeError("Office actual failure")

    monkeypatch.setattr(workflow, "generate_vietnam_workbook", fail_generate)
    with pytest.raises(RuntimeError, match="Office actual failure"):
        workflow.generate_current_vietnam_recommendation()
    assert not list(output_root.rglob("*.xlsx"))


def test_generator_without_final_file_is_not_success(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _current(monkeypatch, _sku_map(tmp_path / "current.xlsx"))
    monkeypatch.setattr(workflow, "dataset_dir", lambda *parts: tmp_path / "artifacts" / parts[-1])
    monkeypatch.setattr(workflow, "export_vietnam_sources", _sources)
    monkeypatch.setattr(workflow, "generate_vietnam_workbook", lambda _map, output, **_kw: output)

    with pytest.raises(workflow.VietnamWorkflowError, match="没有生成最终 XLSX") as error:
        workflow.generate_current_vietnam_recommendation()
    assert error.value.code == "output_missing"


def test_offline_uses_three_local_reports_and_never_starts_yacang(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    _current(monkeypatch, _sku_map(tmp_path / "current.xlsx"))
    artifacts = _report_artifacts(tmp_path)
    output_root = tmp_path / "artifacts"
    monkeypatch.setattr(workflow, "dataset_dir", lambda *parts: output_root / parts[-1])
    online_calls: list[object] = []

    def forbidden_yacang(arguments: object) -> None:
        online_calls.append(arguments)
        raise AssertionError("offline workflow called Yacang")

    monkeypatch.setattr(yacang_sources.yacang_workflow, "run", forbidden_yacang)
    generated: list[str] = []

    def fake_generate(map_path: Path, output_path: Path, *, sources: VietnamSources,
                      config: RecommendationConfig) -> Path:
        assert load_sku_parameters(map_path)["VN-A"].cost == Decimal("10")
        assert sources.skus == ("VN-A",)
        assert sources.in_transit["VN-A"] == Decimal("3")
        assert config == RecommendationConfig()
        generated.append("shared-generator")
        output_path.parent.mkdir(parents=True)
        output_path.write_bytes(b"synthetic final workbook")
        return output_path

    monkeypatch.setattr(workflow, "generate_vietnam_workbook", fake_generate)
    result = workflow.generate_offline_vietnam_recommendation(
        [entry["path"] for entry in reversed(artifacts)]
    )
    assert online_calls == []
    assert generated == ["shared-generator"]
    assert result.sku_count == 1
    assert result.output_xlsx.read_bytes() == b"synthetic final workbook"


def test_offline_missing_current_never_starts_yacang_or_publishes(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    artifacts = _report_artifacts(tmp_path)
    output_root = tmp_path / "artifacts"
    monkeypatch.setattr(workflow, "dataset_dir", lambda *parts: output_root / parts[-1])
    online_calls: list[object] = []

    def forbidden_yacang(arguments: object) -> None:
        online_calls.append(arguments)
        raise AssertionError("offline workflow called Yacang")

    monkeypatch.setattr(yacang_sources.yacang_workflow, "run", forbidden_yacang)
    with pytest.raises(workflow.VietnamWorkflowError) as error:
        workflow.generate_offline_vietnam_recommendation([entry["path"] for entry in artifacts])
    assert error.value.code == "sku_parameter_map_required"
    assert online_calls == []
    assert not output_root.exists()


@pytest.mark.parametrize("failed_stage", ("office", "validation"))
def test_offline_failed_stage_never_publishes_partial_xlsx(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, failed_stage: str,
) -> None:
    _current(monkeypatch, _sku_map(tmp_path / "current.xlsx"))
    artifacts = _report_artifacts(tmp_path)
    output_root = tmp_path / "artifacts"
    monkeypatch.setattr(workflow, "dataset_dir", lambda *parts: output_root / parts[-1])
    online_calls: list[object] = []

    def forbidden_yacang(arguments: object) -> None:
        online_calls.append(arguments)
        raise AssertionError("offline workflow called Yacang")

    monkeypatch.setattr(yacang_sources.yacang_workflow, "run", forbidden_yacang)

    def fake_office(draft: Path, recalculated: Path) -> Path:
        if failed_stage == "office":
            recalculated.write_bytes(b"partial Office output")
            raise recalculation.WorkbookGenerationError("Office synthetic failure")
        shutil.copyfile(draft, recalculated)
        return recalculated

    monkeypatch.setattr(recalculation, "recalculate_with_office", fake_office)
    if failed_stage == "validation":
        def fail_validation(*_args: object, **_kwargs: object) -> None:
            raise recalculation.WorkbookGenerationError("Validation synthetic failure")

        monkeypatch.setattr(recalculation, "validate_recalculated_workbook", fail_validation)

    with pytest.raises(recalculation.WorkbookGenerationError, match=failed_stage.title()):
        workflow.generate_offline_vietnam_recommendation([entry["path"] for entry in artifacts])
    assert online_calls == []
    assert not list(output_root.rglob("*.xlsx"))


def test_online_still_calls_yacang_once_before_shared_generator(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    _current(monkeypatch, _sku_map(tmp_path / "current.xlsx"))
    artifacts = _report_artifacts(tmp_path)
    monkeypatch.setattr(workflow, "dataset_dir", lambda *parts: tmp_path / "artifacts" / parts[-1])
    online_calls: list[object] = []
    shared_calls: list[tuple[str, ...]] = []

    def fake_yacang(arguments: object) -> dict[str, object]:
        online_calls.append(arguments)
        return {"success": True, "status": "completed", "artifacts": artifacts}

    def fake_generate(_map_path: Path, output_path: Path, *, sources: VietnamSources,
                      config: RecommendationConfig) -> Path:
        shared_calls.append(sources.skus)
        assert config == RecommendationConfig()
        output_path.parent.mkdir(parents=True)
        output_path.write_bytes(b"synthetic final workbook")
        return output_path

    monkeypatch.setattr(yacang_sources.yacang_workflow, "run", fake_yacang)
    monkeypatch.setattr(workflow, "generate_vietnam_workbook", fake_generate)
    result = workflow.generate_current_vietnam_recommendation()
    assert len(online_calls) == 1
    assert shared_calls == [("VN-A",)]
    assert result.output_xlsx.is_file()


@pytest.mark.skipif(
    not (os.environ.get("LXE_OFFICE_NODE") and os.environ.get("LXE_OFFICE_CLI")),
    reason="Host Office Kit paths are not configured",
)
def test_online_and_offline_real_office_results_match_for_identical_inputs(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    _current(monkeypatch, _sku_map(tmp_path / "current.xlsx"))
    artifacts = _report_artifacts(tmp_path)
    paths = [entry["path"] for entry in artifacts]
    monkeypatch.setattr(workflow, "dataset_dir", lambda *parts: tmp_path / "artifacts" / parts[-1])
    for name, value in {
        "LXE_VIETNAM_WEIGHT_30D": "0.7", "LXE_VIETNAM_WEIGHT_15D": "0.6",
        "LXE_VIETNAM_WEIGHT_7D": "0.1", "LXE_VIETNAM_EXCHANGE_RATE": "4000",
    }.items():
        monkeypatch.setenv(name, value)
    online_calls: list[object] = []

    def fake_yacang(arguments: object) -> dict[str, object]:
        online_calls.append(arguments)
        return {"success": True, "status": "completed", "artifacts": artifacts}

    monkeypatch.setattr(yacang_sources.yacang_workflow, "run", fake_yacang)
    online = workflow.generate_current_vietnam_recommendation()
    assert len(online_calls) == 1

    def forbidden_yacang(_arguments: object) -> None:
        raise AssertionError("offline workflow called Yacang")

    monkeypatch.setattr(yacang_sources.yacang_workflow, "run", forbidden_yacang)
    offline = workflow.generate_offline_vietnam_recommendation(list(reversed(paths)))
    assert online.config == offline.config
    assert online.config_source == offline.config_source == "environment"
    assert online.sku_count == offline.sku_count == 1
    online_book = load_workbook(online.output_xlsx, read_only=True, data_only=True)
    offline_book = load_workbook(offline.output_xlsx, read_only=True, data_only=True)
    try:
        assert online_book.sheetnames == offline_book.sheetnames
        online_main = online_book["越南备货清单"]
        offline_main = offline_book["越南备货清单"]
        assert online_main["E2"].value == offline_main["E2"].value == "VN-A"
        assert tuple(online_main.cell(2, index).value for index in range(1, 52)) == tuple(
            offline_main.cell(2, index).value for index in range(1, 52)
        )
        assert tuple(online_book["数据更改"].cell(2, index).value for index in range(1, 5)) == tuple(
            offline_book["数据更改"].cell(2, index).value for index in range(1, 5)
        )
    finally:
        online_book.close()
        offline_book.close()


@pytest.mark.skipif(
    not (os.environ.get("LXE_OFFICE_NODE") and os.environ.get("LXE_OFFICE_CLI")),
    reason="Host Office Kit paths are not configured",
)
def test_real_generator_uses_product_creation_time_and_current_transit(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _current(monkeypatch, _sku_map(tmp_path / "current.xlsx"))
    monkeypatch.setattr(workflow, "dataset_dir", lambda *parts: tmp_path / "artifacts" / parts[-1])
    monkeypatch.setattr(workflow, "export_vietnam_sources", _sources)

    result = workflow.generate_current_vietnam_recommendation()
    book = load_workbook(result.output_xlsx, read_only=True, data_only=True)
    try:
        assert book.sheetnames == [
            "越南备货清单", "雅仓库存", "雅仓动销", "数据更改", "库存商品信息"
        ]
        main = book["越南备货清单"]
        assert main["E2"].value == "VN-A"
        assert main["AA2"].value == "2026-09-23 10:00"
        assert main["AN2"].value == 3
        assert [main[f"{column}2"].value for column in ("AO", "AP", "AQ", "AR", "AS", "AT", "AU")] == [None] * 7
        assert book["数据更改"]["A2"].value == 0.8
        assert book["数据更改"]["D2"].value == 3900
    finally:
        book.close()


@pytest.mark.skipif(
    not (os.environ.get("LXE_OFFICE_NODE") and os.environ.get("LXE_OFFICE_CLI")),
    reason="Host Office Kit paths are not configured",
)
def test_nondefault_environment_reaches_recalculated_five_sheet_workbook(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    _current(monkeypatch, _sku_map(tmp_path / "current.xlsx"))
    monkeypatch.setattr(workflow, "dataset_dir", lambda *parts: tmp_path / "artifacts" / parts[-1])
    monkeypatch.setattr(workflow, "export_vietnam_sources", _sources)
    for name, value in {
        "LXE_VIETNAM_WEIGHT_30D": "0.7",
        "LXE_VIETNAM_WEIGHT_15D": "0.6",
        "LXE_VIETNAM_WEIGHT_7D": "0.1",
        "LXE_VIETNAM_EXCHANGE_RATE": "4000",
    }.items():
        monkeypatch.setenv(name, value)

    result = workflow.generate_current_vietnam_recommendation()
    assert result.config_source == "environment"
    assert result.config == RecommendationConfig(
        weight_30d=Decimal("0.7"), weight_15d=Decimal("0.6"),
        weight_7d=Decimal("0.1"), exchange_rate=Decimal("4000"),
    )
    book = load_workbook(result.output_xlsx, read_only=True, data_only=True)
    try:
        assert book.sheetnames == [
            "越南备货清单", "雅仓库存", "雅仓动销", "数据更改", "库存商品信息",
        ]
        assert [book["数据更改"].cell(2, column).value for column in range(1, 5)] == [
            0.7, 0.6, 0.1, 4000,
        ]
        assert [book["越南备货清单"].cell(2, column).value for column in range(48, 52)] == [
            0.7, 0.6, 0.1, 4000,
        ]
    finally:
        book.close()
