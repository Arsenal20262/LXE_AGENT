from __future__ import annotations

import re
from typing import Any


_AMBIGUOUS_MARKERS = ("最近卖", "最近销量", "卖得怎么样", "销售情况")
_PLATFORM_MARKERS = ("智慧", "印尼")
_SUPPORTED_MARKERS = (
    "销量",
    "销售",
    "动销",
    "库存",
    "月末",
    "入库",
    "入仓",
    "上架",
    "创建时间",
    "智慧",
    "商品导出",
    "商品报表",
    "goods-export",
    "goods export",
)

SOURCE_NOTICE = "该文件保留平台原始商品导出字段，不包含逐日销量、14天销量或历史月末快照。"


def _normalized_text(request_text: str) -> str:
    return re.sub(r"\s+", "", request_text).casefold()


def _error(code: str, message: str, *, recoverable: bool) -> dict[str, Any]:
    return {"code": code, "message": message, "recoverable": recoverable}


def build_goods_export_plan(request_text: str) -> dict[str, Any]:
    original = str(request_text or "")
    normalized = _normalized_text(original)
    if not normalized:
        return {
            "status": "blocked",
            "request_text": original,
            "error": _error("request_text_required", "request_text is required", recoverable=True),
        }
    if not all(marker in normalized for marker in _PLATFORM_MARKERS):
        return {
            "status": "unsupported",
            "request_text": original,
            "error": _error(
                "platform_marker_required",
                "请同时明确提到“智慧”和“印尼”，以触发智慧印尼平台商品导出能力",
                recoverable=True,
            ),
        }
    if any(marker in normalized for marker in _AMBIGUOUS_MARKERS):
        return {
            "status": "needs_clarification",
            "request_text": original,
            "error": _error(
                "ambiguous_request",
                "请明确需要销量、库存、月末快照、入库时间或上架时间中的哪一种商品导出数据",
                recoverable=True,
            ),
        }
    if not any(marker in normalized for marker in _SUPPORTED_MARKERS):
        return {
            "status": "unsupported",
            "request_text": original,
            "error": _error(
                "unsupported_request",
                "request is outside the Wisdom goods export capability",
                recoverable=False,
            ),
        }
    return {
        "status": "ready",
        "request_text": original,
        "intent": {"type": "goods-export", "request_text": original},
        "plan": {
            "type": "goods-export",
            "tasks": [{"type": "goods-export"}],
            "source_notice": SOURCE_NOTICE,
        },
    }


__all__ = ["SOURCE_NOTICE", "build_goods_export_plan"]
