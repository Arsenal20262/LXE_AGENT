"""Deterministic natural-language normalization for Brazil exports."""

from dataclasses import dataclass

from .contracts import BrazilExportKind, BrazilExportPlan


_BRAZIL_WAREHOUSE_TERMS = ("巴西海外仓", "海外巴西仓", "巴西海外", "巴西仓")
_SIGNED_TERMS = ("已签收", "签收完成")
_PENDING_TERMS = ("待签收", "未签收")
_SALES_TERMS = ("销量", "日销", "动销")
_INVENTORY_TERMS = ("库存", "库存快照", "月末快照")
_ALLOCATION_TERMS = ("入库", "上架", "调拨", "签收", "单据")


@dataclass(frozen=True)
class BrazilIntentClarification:
    code: str
    message: str


def _normalized_text(value: str) -> str:
    return "".join(str(value or "").split()).lower()


def _has_any(text: str, terms: tuple[str, ...]) -> bool:
    return any(term in text for term in terms)


def normalize_brazil_export_intent(request_text: str) -> BrazilExportPlan | BrazilIntentClarification:
    """Resolve only the fixed reports that the current platform can actually export."""
    text = _normalized_text(request_text)
    if not _has_any(text, _BRAZIL_WAREHOUSE_TERMS):
        return BrazilIntentClarification(
            code="brazil_warehouse_required",
            message="请明确指定巴西海外仓。",
        )

    if _has_any(text, _PENDING_TERMS):
        return BrazilExportPlan(BrazilExportKind.ALLOCATION_PENDING_DEFAULT_3M)
    if _has_any(text, _SIGNED_TERMS):
        return BrazilExportPlan(BrazilExportKind.ALLOCATION_SIGNED_ALL)
    if _has_any(text, _SALES_TERMS) or _has_any(text, _INVENTORY_TERMS):
        return BrazilExportPlan(BrazilExportKind.INVENTORY_SALES_SNAPSHOT)
    if _has_any(text, _ALLOCATION_TERMS):
        return BrazilIntentClarification(
            code="allocation_status_required",
            message="请说明要查询已签收单据，还是默认三个月内待签收单据。",
        )
    return BrazilIntentClarification(
        code="brazil_export_kind_required",
        message="请说明查询巴西海外仓库存/销量、已签收单据或待签收单据。",
    )


__all__ = ["BrazilIntentClarification", "normalize_brazil_export_intent"]
