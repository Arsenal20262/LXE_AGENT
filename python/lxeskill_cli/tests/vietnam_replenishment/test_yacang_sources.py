from pathlib import Path

from openpyxl import Workbook
import pytest

from services.yacang.validation import (
    INVENTORY_LIST_HEADERS,
    INVENTORY_SALES_HEADERS,
    WAREHOUSE_PRODUCTS_HEADERS,
)
from services.vietnam_replenishment import source_parser, yacang_sources


def _workbook(path: Path, headers: tuple[str, ...], rows: list[dict[str, object]]) -> None:
    workbook = Workbook()
    sheet = workbook.active
    sheet.append(headers)
    for values in rows:
        sheet.append([values.get(header) for header in headers])
    workbook.save(path)
    workbook.close()


def _artifacts(tmp_path: Path, *, sales=None, inventory=None, products=None):
    reports = (
        ("inventory-sales", INVENTORY_SALES_HEADERS, sales or [], "VN8806"),
        ("inventory-current-snapshot", INVENTORY_LIST_HEADERS, inventory or [], "VN8806"),
        ("warehouse-products", WAREHOUSE_PRODUCTS_HEADERS, products or [], None),
    )
    artifacts = []
    for report, headers, rows, warehouse in reports:
        path = tmp_path / f"{report}.xlsx"
        _workbook(path, headers, rows)
        artifacts.append({"report": report, "warehouse": warehouse, "created_date": None, "path": str(path)})
    return artifacts


def test_union_and_global_product_filter_keep_missing_source_diagnostics(tmp_path):
    artifacts = _artifacts(
        tmp_path,
        sales=[
            {"SKU": " VN-A ", "仓库": "VN8806", "7天销量": 7, "在途": 3},
            {"SKU": "VN-C", "仓库": "VN8806", "7天销量": 4},
        ],
        inventory=[
            {"SKU": "VN-A", "仓库": "VN8806", "库存数量": 10, "在途数量": 2},
            {"SKU": "VN-B", "仓库": "VN8806", "库存数量": 5},
        ],
        products=[
            {"SKU": "VN-A", "创建时间": "2026-09-23 10:00"},
            {"SKU": "VN-B", "创建时间": "2026-09-23 11:00"},
            {"SKU": "OTHER-COUNTRY", "创建时间": "2026-09-23 12:00"},
        ],
    )

    sources = yacang_sources.load_vietnam_sources(artifacts)

    assert sources.skus == ("VN-A", "VN-B", "VN-C")
    assert sources.missing_sales == ("VN-B",)
    assert sources.missing_inventory == ("VN-C",)
    assert sources.missing_products == ("VN-C",)
    assert sources.sales["VN-A"]["7天销量"] == 7
    assert sources.inventory["VN-A"]["在途数量"] == 2
    assert sources.in_transit == {"VN-A": 2, "VN-B": None, "VN-C": None}
    assert sources.missing_in_transit == ("VN-B", "VN-C")
    assert sources.in_transit_mismatch == ("VN-A",)
    assert set(sources.products) == {"VN-A", "VN-B"}
    assert sources.products["VN-A"]["创建时间"] == "2026-09-23 10:00"
    assert "上架时间" not in sources.products["VN-A"]
    assert sources.artifacts["warehouse-products"] == Path(artifacts[2]["path"])


def test_inventory_row_with_blank_transit_is_reported_missing(tmp_path):
    artifacts = _artifacts(
        tmp_path,
        sales=[{"SKU": "VN-A", "仓库": "VN8806", "在途": 8}],
        inventory=[{"SKU": "VN-A", "仓库": "VN8806", "在途数量": None}],
    )
    sources = yacang_sources.load_vietnam_sources(artifacts)
    assert sources.missing_inventory == ()
    assert sources.in_transit == {"VN-A": None}
    assert sources.missing_in_transit == ("VN-A",)
    assert sources.in_transit_mismatch == ()


def test_invalid_authoritative_in_transit_is_rejected(tmp_path):
    artifacts = _artifacts(
        tmp_path,
        sales=[{"SKU": "VN-A", "仓库": "VN8806", "在途": 4}],
        inventory=[{"SKU": "VN-A", "仓库": "VN8806", "在途数量": "invalid"}],
    )
    with pytest.raises(yacang_sources.VietnamSourceError, match="在途数量"):
        yacang_sources.load_vietnam_sources(artifacts)


def test_invalid_sales_transit_is_not_silently_ignored(tmp_path):
    artifacts = _artifacts(
        tmp_path,
        sales=[{"SKU": "VN-A", "仓库": "VN8806", "在途": "invalid"}],
        inventory=[{"SKU": "VN-A", "仓库": "VN8806", "在途数量": 3}],
    )
    with pytest.raises(yacang_sources.VietnamSourceError, match="inventory-sales SKU VN-A 的 在途"):
        yacang_sources.load_vietnam_sources(artifacts)


def test_formula_in_retained_source_row_is_rejected(tmp_path):
    artifacts = _artifacts(
        tmp_path,
        sales=[{"SKU": "VN-A", "仓库": "VN8806", "7天销量": "=2+2"}],
        inventory=[{"SKU": "VN-A", "仓库": "VN8806"}],
    )
    with pytest.raises(yacang_sources.VietnamSourceError, match="公式"):
        yacang_sources.load_vietnam_sources(artifacts)


@pytest.mark.parametrize("report,rows", [
    ("inventory-sales", [{"SKU": "", "仓库": "VN8806"}]),
    ("inventory-current-snapshot", [{"SKU": 123, "仓库": "VN8806"}]),
    ("warehouse-products", [{"SKU": None, "创建时间": "2026-09-23 10:00"}]),
])
def test_reject_blank_or_nontext_sku(tmp_path, report, rows):
    data = {
        "sales": [{"SKU": "VN-A", "仓库": "VN8806"}],
        "inventory": [{"SKU": "VN-A", "仓库": "VN8806"}],
        "products": [{"SKU": "VN-A", "创建时间": "2026-09-23 10:00"}],
    }
    data[{"inventory-sales": "sales", "inventory-current-snapshot": "inventory", "warehouse-products": "products"}[report]] = rows
    with pytest.raises(yacang_sources.VietnamSourceError, match="SKU"):
        yacang_sources.load_vietnam_sources(_artifacts(tmp_path, **data))


def test_reject_duplicate_sku_and_wrong_warehouse(tmp_path):
    artifacts = _artifacts(
        tmp_path,
        sales=[{"SKU": "VN-A", "仓库": "VN8806"}, {"SKU": " VN-A ", "仓库": "VN8806"}],
        inventory=[{"SKU": "VN-A", "仓库": "VN8806"}],
    )
    with pytest.raises(yacang_sources.VietnamSourceError, match="重复 SKU"):
        yacang_sources.load_vietnam_sources(artifacts)

    artifacts[0]["warehouse"] = "MY8801"
    with pytest.raises(yacang_sources.VietnamSourceError, match="VN8806"):
        yacang_sources.load_vietnam_sources(artifacts)


def test_reject_incomplete_or_filtered_artifact_set(tmp_path):
    artifacts = _artifacts(tmp_path, sales=[{"SKU": "VN-A", "仓库": "VN8806"}])
    with pytest.raises(yacang_sources.VietnamSourceError, match="三份"):
        yacang_sources.load_vietnam_sources(artifacts[:2])
    artifacts[0]["created_date"] = {"start_date": "2026-09-01", "end_date": "2026-09-30"}
    with pytest.raises(yacang_sources.VietnamSourceError, match="创建日期"):
        yacang_sources.load_vietnam_sources(artifacts)


def test_empty_current_vietnam_reports_do_not_produce_an_operator_sku_set(tmp_path):
    artifacts = _artifacts(
        tmp_path,
        products=[{"SKU": "GLOBAL-ONLY", "创建时间": "2026-09-23 10:00"}],
    )

    with pytest.raises(yacang_sources.VietnamSourceError, match="均无 SKU"):
        yacang_sources.load_vietnam_sources(artifacts)


def test_export_calls_existing_workflow_once_and_keeps_real_failure(tmp_path, monkeypatch):
    artifacts = _artifacts(
        tmp_path,
        sales=[{"SKU": "VN-A", "仓库": "VN8806"}],
        inventory=[{"SKU": "VN-A", "仓库": "VN8806"}],
        products=[{"SKU": "VN-A", "创建时间": "2026-09-23 10:00"}],
    )
    calls = []

    def export(arguments):
        calls.append(arguments)
        return {"success": True, "status": "completed", "artifacts": artifacts}

    monkeypatch.setattr(yacang_sources.yacang_workflow, "run", export)
    assert yacang_sources.export_vietnam_sources().skus == ("VN-A",)
    assert calls == [{"params": {"reports": [
        "inventory-sales", "inventory-current-snapshot", "warehouse-products",
    ], "warehouses": ["VN8806"]}}]

    def failed(arguments):
        return {"success": False, "status": "partial_success", "artifacts": artifacts[:1],
                "error": {"code": "rate_limited", "message": "雅仓实际返回 429，已脱敏"}}

    monkeypatch.setattr(yacang_sources.yacang_workflow, "run", failed)
    with pytest.raises(yacang_sources.VietnamSourceError, match="雅仓实际返回 429，已脱敏"):
        yacang_sources.export_vietnam_sources()


def test_offline_classifies_three_reports_by_headers_not_filenames(tmp_path):
    artifacts = _artifacts(
        tmp_path,
        sales=[{"SKU": "VN-A", "仓库": "VN8806"}],
        inventory=[{"SKU": "VN-A", "仓库": "VN8806"}],
    )
    paths = [str(entry["path"]) for entry in reversed(artifacts)]
    classified = source_parser.classify_vietnam_report_paths(paths)
    assert [entry["report"] for entry in classified] == [
        "warehouse-products", "inventory-current-snapshot", "inventory-sales",
    ]
    assert source_parser.load_vietnam_sources(classified).skus == ("VN-A",)


@pytest.mark.parametrize("count", [0, 1, 2, 4])
def test_offline_classification_requires_exactly_three_files(tmp_path, count):
    artifacts = _artifacts(tmp_path)
    paths = [str(entry["path"]) for entry in artifacts]
    if count == 4:
        paths.append(paths[0])
    with pytest.raises(yacang_sources.VietnamSourceError, match="三份"):
        source_parser.classify_vietnam_report_paths(paths[:count])


def test_offline_classification_rejects_duplicate_path_and_report_type(tmp_path):
    artifacts = _artifacts(tmp_path)
    paths = [str(entry["path"]) for entry in artifacts]
    with pytest.raises(yacang_sources.VietnamSourceError, match="重复"):
        source_parser.classify_vietnam_report_paths([paths[0], paths[0], paths[2]])
    duplicate_type = tmp_path / "different-name.xlsx"
    _workbook(duplicate_type, INVENTORY_SALES_HEADERS, [])
    with pytest.raises(yacang_sources.VietnamSourceError, match="重复"):
        source_parser.classify_vietnam_report_paths([paths[0], str(duplicate_type), paths[2]])


def test_offline_classification_rejects_symlink_and_hardlink_aliases(tmp_path):
    paths = [str(entry["path"]) for entry in _artifacts(tmp_path)]
    symlink = tmp_path / "same-via-symlink.xlsx"
    symlink.symlink_to(paths[0])
    hardlink = tmp_path / "same-via-hardlink.xlsx"
    hardlink.hardlink_to(paths[0])
    for alias in (symlink, hardlink):
        with pytest.raises(source_parser.VietnamSourceError, match="重复"):
            source_parser.classify_vietnam_report_paths([paths[0], str(alias), paths[2]])


def test_offline_classification_rejects_non_xlsx_and_unknown_headers(tmp_path):
    artifacts = _artifacts(tmp_path)
    paths = [str(entry["path"]) for entry in artifacts]
    non_xlsx = tmp_path / "source.csv"
    non_xlsx.write_text("synthetic", encoding="utf-8")
    with pytest.raises(yacang_sources.VietnamSourceError, match=".xlsx"):
        source_parser.classify_vietnam_report_paths([paths[0], paths[1], str(non_xlsx)])
    unknown = tmp_path / "unknown.xlsx"
    _workbook(unknown, ("SKU", "unknown"), [])
    with pytest.raises(yacang_sources.VietnamSourceError, match="表头"):
        source_parser.classify_vietnam_report_paths([paths[0], paths[1], str(unknown)])


def test_offline_classification_rejects_missing_and_corrupt_workbooks(tmp_path):
    paths = [str(entry["path"]) for entry in _artifacts(tmp_path)]
    with pytest.raises(source_parser.VietnamSourceError, match="不存在或不可读"):
        source_parser.classify_vietnam_report_paths([paths[0], paths[1], str(tmp_path / "missing.xlsx")])
    corrupt = tmp_path / "corrupt.xlsx"
    corrupt.write_bytes(b"not a ZIP workbook")
    with pytest.raises(source_parser.VietnamSourceError, match="无法读取或结构无效"):
        source_parser.classify_vietnam_report_paths([paths[0], paths[1], str(corrupt)])


def test_offline_full_parse_rejects_wrong_warehouse_and_invalid_sku(tmp_path):
    artifacts = _artifacts(
        tmp_path,
        sales=[{"SKU": "VN-A", "仓库": "MY8801"}],
        inventory=[{"SKU": "VN-A", "仓库": "VN8806"}],
    )
    paths = [str(entry["path"]) for entry in artifacts]
    with pytest.raises(source_parser.VietnamSourceError, match="VN8806"):
        source_parser.load_vietnam_sources(source_parser.classify_vietnam_report_paths(paths))
    _workbook(Path(paths[0]), INVENTORY_SALES_HEADERS, [{"SKU": "=1+1", "仓库": "VN8806"}])
    with pytest.raises(source_parser.VietnamSourceError, match="SKU"):
        source_parser.load_vietnam_sources(source_parser.classify_vietnam_report_paths(paths))
