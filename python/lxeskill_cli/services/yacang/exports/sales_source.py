from __future__ import annotations

from datetime import date, timedelta
from pathlib import Path
from typing import Any, Callable

from services.yacang.client import YacangClient
from services.yacang.exports.inventory_sales import (
    DEFAULT_CACHE_MAX_AGE_SECONDS,
    DEFAULT_POLL_INTERVAL_SECONDS,
    DEFAULT_TIMEOUT_SECONDS,
    ExportRequest,
    export_inventory_sales_requests,
)
from services.yacang.warehouses import WAREHOUSES


DEFAULT_SOURCE_RANGE_DAYS = 7


def resolve_source_date_range(
    *,
    start_date: Any = None,
    end_date: Any = None,
    as_of_date: Any = None,
    today: Callable[[], date] = date.today,
) -> tuple[date, date]:
    explicit_start = str(start_date or "").strip()
    explicit_end = str(end_date or "").strip()
    if bool(explicit_start) != bool(explicit_end):
        raise ValueError("start_date 和 end_date 必须同时提供")
    if as_of_date is not None and (explicit_start or explicit_end):
        raise ValueError("as_of_date 不能与 start_date/end_date 同时提供")
    if explicit_start:
        start = date.fromisoformat(explicit_start)
        end = date.fromisoformat(explicit_end)
        if start > end:
            raise ValueError("start_date 不能晚于 end_date")
        return start, end
    end = date.fromisoformat(str(as_of_date or today().isoformat()).strip())
    return end - timedelta(days=DEFAULT_SOURCE_RANGE_DAYS), end


def download_inventory_sales_sources(
    *,
    as_of_date: Any = None,
    mobile: str | None = None,
    password: str | None = None,
    output_dir: str | Path,
    timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS,
    poll_interval_seconds: float = DEFAULT_POLL_INTERVAL_SECONDS,
    cache_max_age_seconds: float = DEFAULT_CACHE_MAX_AGE_SECONDS,
    client: YacangClient | None = None,
    sleep: Callable[[float], None] | None = None,
    today: Callable[[], date] = date.today,
) -> tuple[date, list[dict[str, Any]]]:
    end = date.fromisoformat(str(as_of_date or today().isoformat()).strip())
    start = end - timedelta(days=DEFAULT_SOURCE_RANGE_DAYS)
    cache_dir = Path(output_dir) / ".source-cache"
    requests = [
        ExportRequest(
            warehouse_code=warehouse.code,
            warehouse_id=warehouse.warehouse_id,
            start_date=start.isoformat(),
            end_date=end.isoformat(),
            output_filename=(
                f"yacang_inventory_sales_source_{warehouse.code}_{start.isoformat()}_{end.isoformat()}.xlsx"
            ),
            business_key="inventory-sales-source",
        )
        for warehouse in WAREHOUSES
    ]
    kwargs: dict[str, Any] = {}
    if sleep is not None:
        kwargs["sleep"] = sleep
    results = export_inventory_sales_requests(
        requests,
        dataset_id="yacang_exports",
        mobile=mobile,
        password=password,
        output_dir=cache_dir,
        timeout_seconds=timeout_seconds,
        poll_interval_seconds=poll_interval_seconds,
        cache_max_age_seconds=cache_max_age_seconds,
        client=client,
        **kwargs,
    )
    return end, results


__all__ = [
    "DEFAULT_SOURCE_RANGE_DAYS",
    "download_inventory_sales_sources",
    "resolve_source_date_range",
]
