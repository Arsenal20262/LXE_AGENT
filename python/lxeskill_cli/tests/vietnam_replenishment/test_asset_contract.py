"""Synthetic contracts for the Vietnam business template."""

from __future__ import annotations

from pathlib import Path

from openpyxl import Workbook, load_workbook
import pytest

from services.vietnam_replenishment.asset_contract import (
    AssetContractError,
    validate_template,
)


REQUIRED_SHEETS = (
    "越南备货清单",
    "雅仓库存",
    "雅仓动销",
    "数据更改",
    "库存商品信息",
)

AUXILIARY_HEADERS = {
    "雅仓库存": {"B1": "SKU", "F1": "库存数量", "H1": "在途数量", "J1": "可用库存"},
    "雅仓动销": {"A1": "SKU", "E1": "7天销量", "F1": "15天销量", "G1": "30天销量"},
    "数据更改": {"A1": "30天", "B1": "15天", "C1": "7天", "D1": "汇率"},
    "库存商品信息": {"B1": "SKU", "K1": "创建时间"},
}


def _template(path: Path, *, extra_sheet: bool = False) -> Path:
    workbook = Workbook()
    main = workbook.active
    main.title = REQUIRED_SHEETS[0]
    for name in REQUIRED_SHEETS[1:]:
        workbook.create_sheet(name)
    if extra_sheet:
        workbook.create_sheet("历史辅助表")
    for coordinate, header in {
        "B1": "判断热销",
        "E1": "SKU",
        "G1": "成本",
        "H1": "陆运",
        "AA1": "上架时间",
        "AE1": "跨境价",
        "AJ1": "折扣价",
        "AN1": "总在途",
        "AV1": "30天",
        "AW1": "15天",
        "AX1": "7天",
        "AY1": "汇率",
    }.items():
        main[coordinate] = header
    for sheet_name, headers in AUXILIARY_HEADERS.items():
        sheet = workbook[sheet_name]
        for coordinate, header in headers.items():
            sheet[coordinate] = header
    change = workbook["数据更改"]
    for coordinate, value in zip(("A2", "B2", "C2", "D2"), (0.8, 0.8, 0, 3900)):
        change[coordinate] = value
    for coordinate, source in zip(("AV2", "AW2", "AX2", "AY2"), ("A2", "B2", "C2", "D2")):
        main[coordinate] = f"=数据更改!{source}"
    main["E2"] = "VN-SKU-1"
    main["E4"] = "VN-SKU-2"
    workbook.save(path)
    workbook.close()
    return path


@pytest.mark.parametrize("extra_sheet", [False, True])
def test_full_template_accepts_required_sheets_and_optional_extra(
    tmp_path: Path, extra_sheet: bool
) -> None:
    path = _template(tmp_path / "synthetic-template.xlsx", extra_sheet=extra_sheet)

    contract = validate_template(path)

    assert set(REQUIRED_SHEETS).issubset(contract.sheet_names)
    assert len(contract.sheet_names) == 5 + int(extra_sheet)
    assert contract.main_rows == 2


def test_full_template_allows_repeated_historical_sku_rows(tmp_path: Path) -> None:
    path = _template(tmp_path / "repeated-history.xlsx")
    workbook = load_workbook(path)
    workbook[REQUIRED_SHEETS[0]]["E4"] = "VN-SKU-1"
    workbook.save(path)
    workbook.close()

    assert validate_template(path).main_rows == 2


def test_full_template_reports_missing_required_sheet(tmp_path: Path) -> None:
    path = _template(tmp_path / "missing-sheet.xlsx")
    workbook = load_workbook(path)
    del workbook["数据更改"]
    workbook.save(path)
    workbook.close()

    with pytest.raises(AssetContractError, match="缺少工作表: 数据更改"):
        validate_template(path)


def test_full_template_reports_moved_sku_header_coordinate(tmp_path: Path) -> None:
    path = _template(tmp_path / "moved-header.xlsx")
    workbook = load_workbook(path)
    main = workbook[REQUIRED_SHEETS[0]]
    main["D1"] = "SKU"
    main["E1"] = None
    workbook.save(path)
    workbook.close()

    with pytest.raises(AssetContractError, match=r"越南备货清单!E1:.*SKU"):
        validate_template(path)


@pytest.mark.parametrize("coordinate", ["AA1", "AE1", "AJ1"])
def test_full_template_requires_historical_parameter_headers(
    tmp_path: Path, coordinate: str
) -> None:
    path = _template(tmp_path / "missing-historical-header.xlsx")
    workbook = load_workbook(path)
    workbook[REQUIRED_SHEETS[0]][coordinate] = None
    workbook.save(path)
    workbook.close()

    with pytest.raises(AssetContractError) as error:
        validate_template(path)
    assert f"越南备货清单!{coordinate}" in str(error.value)


def test_full_template_reports_actual_malformed_xlsx_error(tmp_path: Path) -> None:
    path = tmp_path / "corrupted.xlsx"
    path.write_bytes(b"not an xlsx archive")

    with pytest.raises(AssetContractError, match="BadZipFile: File is not a zip file"):
        validate_template(path)


@pytest.mark.parametrize(
    ("sheet_name", "coordinate"),
    [
        (sheet_name, coordinate)
        for sheet_name, headers in AUXILIARY_HEADERS.items()
        for coordinate in headers
    ],
)
def test_full_template_reports_missing_auxiliary_header(
    tmp_path: Path, sheet_name: str, coordinate: str
) -> None:
    path = _template(tmp_path / "missing-auxiliary-header.xlsx")
    workbook = load_workbook(path)
    workbook[sheet_name][coordinate] = None
    workbook.save(path)
    workbook.close()

    with pytest.raises(AssetContractError) as error:
        validate_template(path)
    assert f"{sheet_name}!{coordinate}" in str(error.value)


@pytest.mark.parametrize(
    ("main_coordinate", "source_coordinate"),
    list(zip(("AV2", "AW2", "AX2", "AY2"), ("A2", "B2", "C2", "D2"))),
)
def test_full_template_requires_each_parameter_reference(
    tmp_path: Path, main_coordinate: str, source_coordinate: str
) -> None:
    path = _template(tmp_path / "wrong-reference.xlsx")
    workbook = load_workbook(path)
    workbook[REQUIRED_SHEETS[0]][main_coordinate] = "=1+1"
    workbook.save(path)
    workbook.close()

    with pytest.raises(AssetContractError) as error:
        validate_template(path)
    assert f"越南备货清单!{main_coordinate}" in str(error.value)
    assert source_coordinate in str(error.value)


@pytest.mark.parametrize("coordinate", ["A2", "B2", "C2", "D2"])
def test_parameter_input_area_rejects_formula(tmp_path: Path, coordinate: str) -> None:
    path = _template(tmp_path / "formula-in-input.xlsx")
    workbook = load_workbook(path)
    workbook["数据更改"][coordinate] = "=1+1"
    workbook.save(path)
    workbook.close()

    with pytest.raises(AssetContractError) as error:
        validate_template(path)
    assert f"数据更改!{coordinate}" in str(error.value)
