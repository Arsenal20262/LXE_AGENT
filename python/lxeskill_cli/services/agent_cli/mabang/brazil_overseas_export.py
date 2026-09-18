from __future__ import annotations

import asyncio
from typing import Any

from services.agent_cli._shared.json_cli import exception_text as _exception_text
from services.mabang.brazil_overseas.workflow import export_brazil_overseas_from_request


def run(arguments: dict[str, Any]) -> dict[str, Any]:
    """lxeskill entrypoint for the fixed Brazil overseas source workbook exports."""
    request_text = str(arguments.get("request_text") or "").strip()
    if not request_text:
        return {
            "success": False,
            "request_text": "",
            "exception": "request_text 不能为空",
            "auth_refresh_required": False,
        }
    try:
        result = asyncio.run(export_brazil_overseas_from_request(request_text))
        return result.to_payload()
    except Exception as exc:  # noqa: BLE001 — failure context belongs in the payload
        return {
            "success": False,
            "request_text": request_text,
            "exception": _exception_text(exc),
            "auth_refresh_required": False,
        }
