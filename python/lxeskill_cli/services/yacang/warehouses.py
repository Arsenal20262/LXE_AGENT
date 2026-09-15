from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Iterable


@dataclass(frozen=True)
class Warehouse:
    code: str
    warehouse_id: int
    aliases: tuple[str, ...] = ()


WAREHOUSES: tuple[Warehouse, ...] = (
    Warehouse("MY8801", 26, ("马来西亚仓", "马来西亚", "马来仓", "马来")),
    Warehouse("PH8805", 46, ("菲律宾仓", "菲律宾", "菲仓")),
    Warehouse("TH8802", 47, ("泰国仓", "泰国", "泰仓")),
    Warehouse("VN8806", 80, ("越南仓", "越南", "越仓")),
)
WAREHOUSE_IDS = {warehouse.code: warehouse.warehouse_id for warehouse in WAREHOUSES}


def match_warehouse_aliases(text: str) -> tuple[str, ...]:
    """Return canonical codes for warehouse aliases mentioned in user text."""

    return tuple(
        warehouse.code
        for warehouse in WAREHOUSES
        if any(alias in text for alias in warehouse.aliases)
    )


def select_warehouses(value: Any = None) -> tuple[Warehouse, ...]:
    if value is None or value == "":
        return WAREHOUSES
    raw_values: Iterable[Any]
    if isinstance(value, str):
        raw_values = (value,)
    elif isinstance(value, (list, tuple, set, frozenset)):
        raw_values = value
    else:
        raise ValueError("warehouses 必须是仓库代码或仓库代码列表")
    requested = [str(item).strip().upper() for item in raw_values]
    if not requested:
        return WAREHOUSES
    unknown = sorted(set(requested).difference(WAREHOUSE_IDS))
    if unknown:
        raise ValueError(
            "warehouse 必须是以下仓库之一: "
            + ", ".join(WAREHOUSE_IDS)
            + "；收到 "
            + ", ".join(unknown)
        )
    requested_set = set(requested)
    return tuple(warehouse for warehouse in WAREHOUSES if warehouse.code in requested_set)


__all__ = [
    "WAREHOUSES",
    "WAREHOUSE_IDS",
    "Warehouse",
    "match_warehouse_aliases",
    "select_warehouses",
]
