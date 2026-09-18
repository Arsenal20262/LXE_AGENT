from __future__ import annotations

from dataclasses import dataclass


_PRODUCT_TERMS = ("商品", "库存", "销量", "入库", "上架", "菲律宾", "智汇", "tms")


@dataclass(frozen=True)
class ZhihuiTmsProductExportIntent:
    kind: str = "philippines_product_full_export"
    warehouse: str = "PH"
    historical_metrics_available: bool = False


def normalize_product_export_intent(request: str = "") -> ZhihuiTmsProductExportIntent:
    """Treat report wording as a request for the one supported product export."""
    if not isinstance(request, str):
        raise ValueError("request 必须是文本")
    wording = request.strip().lower()
    if wording and not any(term in wording for term in _PRODUCT_TERMS):
        raise ValueError("request 未表达智汇 TMS 菲律宾商品导出需求")
    return ZhihuiTmsProductExportIntent()


__all__ = ["ZhihuiTmsProductExportIntent", "normalize_product_export_intent"]
