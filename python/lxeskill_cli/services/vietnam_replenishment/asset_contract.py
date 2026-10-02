"""Read-only validation of the full Vietnam business template."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import re

from openpyxl import load_workbook


REQUIRED_SHEETS = (
    "越南备货清单",
    "雅仓库存",
    "雅仓动销",
    "数据更改",
    "库存商品信息",
)

MAIN_HEADERS = {
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
}

AUXILIARY_HEADERS = {
    "雅仓库存": {"B1": "SKU", "F1": "库存数量", "H1": "在途数量", "J1": "可用库存"},
    "雅仓动销": {"A1": "SKU", "E1": "7天销量", "F1": "15天销量", "G1": "30天销量"},
    "数据更改": {"A1": "30天", "B1": "15天", "C1": "7天", "D1": "汇率"},
    "库存商品信息": {"B1": "SKU", "K1": "创建时间"},
}

MAIN_PARAMETER_REFERENCES = {"AV2": "A2", "AW2": "B2", "AX2": "C2", "AY2": "D2"}


class AssetContractError(ValueError):
    """A supplied workbook cannot serve as the Vietnam business template."""


@dataclass(frozen=True)
class TemplateContract:
    sheet_names: tuple[str, ...]
    main_rows: int


def validate_template(path: str | Path) -> TemplateContract:
    """Check structural prerequisites without modifying the supplied workbook."""
    try:
        workbook = load_workbook(path, read_only=True, data_only=False)
    except Exception as exc:
        raise AssetContractError(f"读取模板失败: {type(exc).__name__}: {exc}") from exc

    try:
        sheet_names = tuple(workbook.sheetnames)
        for name in REQUIRED_SHEETS:
            if name not in sheet_names:
                raise AssetContractError(f"缺少工作表: {name}")

        for sheet_name, headers in {
            REQUIRED_SHEETS[0]: MAIN_HEADERS,
            **AUXILIARY_HEADERS,
        }.items():
            sheet = workbook[sheet_name]
            for coordinate, expected in headers.items():
                actual = sheet[coordinate].value
                if actual != expected:
                    raise AssetContractError(
                        f"{sheet_name}!{coordinate}: "
                        f"期望表头 {expected!r}，实际为 {actual!r}"
                    )

        main = workbook[REQUIRED_SHEETS[0]]
        change = workbook["数据更改"]
        for main_coordinate, source_coordinate in MAIN_PARAMETER_REFERENCES.items():
            input_cell = change[source_coordinate]
            if input_cell.data_type == "f":
                raise AssetContractError(
                    f"数据更改!{source_coordinate}: 参数输入格不能是公式，"
                    f"实际为 {input_cell.value!r}"
                )

            formula_cell = main[main_coordinate]
            source_column = source_coordinate[0]
            source_row = source_coordinate[1:]
            reference = (
                rf"(?:'数据更改'|数据更改)!\$?{source_column}\$?{source_row}(?![0-9])"
            )
            formula = formula_cell.value
            if formula_cell.data_type != "f" or not re.search(reference, str(formula)):
                raise AssetContractError(
                    f"越南备货清单!{main_coordinate}: 公式必须引用 "
                    f"数据更改!{source_coordinate}，实际为 {formula!r}"
                )

        main_rows = sum(
            1
            for (sku,) in main.iter_rows(min_row=2, min_col=5, max_col=5, values_only=True)
            if sku is not None and str(sku).strip()
        )
        return TemplateContract(sheet_names=sheet_names, main_rows=main_rows)
    except AssetContractError:
        raise
    except Exception as exc:
        raise AssetContractError(f"读取模板失败: {type(exc).__name__}: {exc}") from exc
    finally:
        workbook.close()


__all__ = ["AssetContractError", "TemplateContract", "validate_template"]
