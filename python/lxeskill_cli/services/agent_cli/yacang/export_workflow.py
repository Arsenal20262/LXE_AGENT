from __future__ import annotations

from typing import Any

from services.agent_cli.yacang._shared import reject_unknown_arguments
from services.yacang.export_workflow import run_export_workflow
from services.yacang.export_workflow import canonical_export_result
from services.yacang.reporting import cli_failure


def run(arguments: dict[str, Any]) -> dict[str, Any]:
    """Structured AI intent entrypoint; raw text is retained for internal compatibility."""
    try:
        reject_unknown_arguments(
            arguments,
            {
                "request_text",
                "data_type_intent",
                "warehouse_intent",
                "created_date_filter",
                "inventory_snapshot_intent",
            },
        )
        raw_request_text = arguments.get("request_text")
        request_text = str(raw_request_text).strip() if raw_request_text else None
        result = run_export_workflow(
            request_text,
            data_type_intent=arguments.get("data_type_intent"),
            warehouse_intent=arguments.get("warehouse_intent"),
            created_date_filter=arguments.get("created_date_filter"),
            inventory_snapshot_intent=arguments.get("inventory_snapshot_intent"),
        )
        return {"success": result["overall_status"] == "success", **result}
    except Exception as exc:  # noqa: BLE001 - real sanitized failure is the command result
        failure = cli_failure(
            exc,
            business_type="yacang-export-workflow",
            context={"request_text_present": bool(arguments.get("request_text"))},
        )
        result = canonical_export_result(
            overall_status="failed",
            diagnostics=[
                {
                    "kind": "invalid" if failure["stage"] == "输入校验" else "error",
                    "code": str(failure["error_code"]),
                    "message": str(failure["exception"]),
                }
            ],
        )
        return {"success": False, **result}


__all__ = ["run"]
