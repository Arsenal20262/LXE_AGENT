from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Iterable


@dataclass(frozen=True)
class Warehouse:
    code: str
    warehouse_id: int


WAREHOUSES: tuple[Warehouse, ...] = (
    Warehouse("MY8801", 26),
    Warehouse("PH8805", 46),
    Warehouse("TH8802", 47),
    Warehouse("VN8806", 80),
)
WAREHOUSE_IDS = {warehouse.code: warehouse.warehouse_id for warehouse in WAREHOUSES}


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


__all__ = ["WAREHOUSES", "WAREHOUSE_IDS", "Warehouse", "select_warehouses"]
