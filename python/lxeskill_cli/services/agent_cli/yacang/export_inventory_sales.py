from __future__ import annotations

from typing import Any

from services.agent_cli._shared.json_cli import exception_text
from services.yacang.inventory_sales_export import export_inventory_sales


def run(arguments: dict[str, Any]) -> dict[str, Any]:
    """lxeskill entrypoint — credentials come only from the desktop environment."""
    try:
        return export_inventory_sales(
            start_date=arguments.get("start_date"),
            end_date=arguments.get("end_date"),
            timeout_seconds=float(arguments.get("timeout_seconds", 180)),
            poll_interval_seconds=float(arguments.get("poll_interval_seconds", 5)),
            cache_max_age_seconds=float(arguments.get("cache_max_age_seconds", 300)),
        )
    except Exception as exc:  # noqa: BLE001 - real sanitized failure is the command result
        return {
            "success": False,
            "start_date": str(arguments.get("start_date") or ""),
            "end_date": str(arguments.get("end_date") or ""),
            "exception": exception_text(exc),
        }


__all__ = ["run"]
