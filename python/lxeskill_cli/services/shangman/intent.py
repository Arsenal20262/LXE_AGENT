from __future__ import annotations

from typing import Any


PLATFORM = "智慧"
COUNTRY = "印尼"
OPERATION = "goods_export"
SUPPORTED_METRICS = frozenset({"sales", "inventory", "inbound_time", "listing_time"})
SUPPORTED_SALES_WINDOWS = frozenset({7, 14, 30, 90})

SOURCE_NOTICE = "该文件保留平台原始商品导出字段，不包含逐日销量、14天销量或历史月末快照。"


def _error(code: str, message: str, *, recoverable: bool) -> dict[str, Any]:
    return {"code": code, "message": message, "recoverable": recoverable}


def _invalid(message: str) -> dict[str, Any]:
    return {"status": "blocked", "error": _error("params_invalid", message, recoverable=True)}


def _string(value: Any) -> str:
    return str(value or "").strip()


def _normalize_params(raw_params: Any) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
    if not isinstance(raw_params, dict):
        return None, _invalid("params must be an object")

    platform = _string(raw_params.get("platform"))
    country = _string(raw_params.get("country"))
    operation = _string(raw_params.get("operation"))
    if platform != PLATFORM:
        return None, _invalid(f"params.platform must be {PLATFORM}")
    if country != COUNTRY:
        return None, _invalid(f"params.country must be {COUNTRY}")
    if operation != OPERATION:
        return None, _invalid(f"params.operation must be {OPERATION}")

    raw_metrics = raw_params.get("requested_metrics")
    if not isinstance(raw_metrics, list) or not raw_metrics:
        return None, _invalid("params.requested_metrics must be a non-empty array")
    metrics = [_string(value) for value in raw_metrics]
    if any(not value or value not in SUPPORTED_METRICS for value in metrics):
        return None, _invalid("params.requested_metrics contains an unsupported metric")
    if len(set(metrics)) != len(metrics):
        return None, _invalid("params.requested_metrics must not contain duplicates")

    raw_windows = raw_params.get("sales_windows_days", [])
    if not isinstance(raw_windows, list):
        return None, _invalid("params.sales_windows_days must be an array")
    windows: list[int] = []
    for value in raw_windows:
        if isinstance(value, bool) or not isinstance(value, int) or value not in SUPPORTED_SALES_WINDOWS:
            return None, _invalid("params.sales_windows_days contains an unsupported window")
        windows.append(value)
    if len(set(windows)) != len(windows):
        return None, _invalid("params.sales_windows_days must not contain duplicates")

    return {
        "platform": platform,
        "country": country,
        "operation": operation,
        "requested_metrics": metrics,
        "sales_windows_days": windows,
    }, None


def build_goods_export_plan(params: Any) -> dict[str, Any]:
    normalized_params, error = _normalize_params(params)
    if error is not None:
        return error
    assert normalized_params is not None
    return {
        "status": "ready",
        "params": normalized_params,
        "intent": {
            "type": "goods-export",
            "platform": PLATFORM,
            "country": COUNTRY,
            "operation": OPERATION,
            "params": normalized_params,
        },
        "plan": {
            "type": "goods-export",
            "tasks": [{"type": "goods-export", "params": normalized_params}],
            "source_notice": SOURCE_NOTICE,
        },
    }


__all__ = [
    "COUNTRY",
    "OPERATION",
    "PLATFORM",
    "SOURCE_NOTICE",
    "SUPPORTED_METRICS",
    "SUPPORTED_SALES_WINDOWS",
    "build_goods_export_plan",
]
