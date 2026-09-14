from __future__ import annotations

from dataclasses import dataclass


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


__all__ = ["WAREHOUSES", "WAREHOUSE_IDS", "Warehouse"]
