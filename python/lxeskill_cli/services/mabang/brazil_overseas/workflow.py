"""Business workflow that routes a Brazil overseas warehouse request to one export."""

from __future__ import annotations

from dataclasses import dataclass
from typing import NoReturn

from services.mabang.errors import MabangBusinessError

from .allocation import export_brazil_overseas_allocation
from .contracts import (
    BRAZIL_OVERSEAS_WAREHOUSE_ID,
    BRAZIL_OVERSEAS_WAREHOUSE_LABEL,
    INVENTORY_SALES_SOURCE_NOTE,
    BrazilExportKind,
)
from .intent import BrazilIntentClarification, normalize_brazil_export_intent
from .inventory import export_brazil_overseas_inventory_sales_snapshot


ALLOCATION_SOURCE_NOTE = "马帮分仓调拨原始导出"


class BrazilOverseasRequestClarificationError(MabangBusinessError):
    def __init__(self, clarification: BrazilIntentClarification) -> None:
        super().__init__(clarification.message)
        self.code = clarification.code


@dataclass(frozen=True)
class BrazilOverseasWorkflowResult:
    kind: BrazilExportKind
    xlsx_path: str
    warehouse_id: str = BRAZIL_OVERSEAS_WAREHOUSE_ID
    warehouse_label: str = BRAZIL_OVERSEAS_WAREHOUSE_LABEL
    source_data_note: str = ""

    def to_payload(self) -> dict[str, str | bool]:
        return {
            "success": True,
            "kind": self.kind.value,
            "xlsx_path": self.xlsx_path,
            "warehouse_id": self.warehouse_id,
            "warehouse_label": self.warehouse_label,
            "source_data_note": self.source_data_note,
        }


def _raise_clarification(clarification: BrazilIntentClarification) -> NoReturn:
    raise BrazilOverseasRequestClarificationError(clarification)


async def export_brazil_overseas_from_request(request_text: str) -> BrazilOverseasWorkflowResult:
    """Run exactly one approved Brazil source-data export for a natural-language request."""
    resolved = normalize_brazil_export_intent(request_text)
    if isinstance(resolved, BrazilIntentClarification):
        _raise_clarification(resolved)

    if resolved.kind is BrazilExportKind.INVENTORY_SALES_SNAPSHOT:
        result = await export_brazil_overseas_inventory_sales_snapshot()
        return BrazilOverseasWorkflowResult(
            kind=resolved.kind,
            xlsx_path=result.xlsx_path,
            source_data_note=INVENTORY_SALES_SOURCE_NOTE,
        )

    result = await export_brazil_overseas_allocation(resolved.kind)
    return BrazilOverseasWorkflowResult(
        kind=resolved.kind,
        xlsx_path=result.xlsx_path,
        source_data_note=ALLOCATION_SOURCE_NOTE,
    )


__all__ = [
    "BrazilOverseasRequestClarificationError",
    "BrazilOverseasWorkflowResult",
    "export_brazil_overseas_from_request",
]
