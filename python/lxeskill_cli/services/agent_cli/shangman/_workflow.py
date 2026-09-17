from __future__ import annotations

import asyncio
import os
import re
from typing import Any

from services.shangman.goods_export import (
    ShangmanClient,
    ShangmanCredentials,
    StaticCaptchaCodeProvider,
)
from services.shangman.intent import build_goods_export_plan


_CREDENTIAL_ENV = (
    "LXE_SHANGMAN_TENANT_ID",
    "LXE_SHANGMAN_USERNAME",
    "LXE_SHANGMAN_PASSWORD",
    "LXE_SHANGMAN_BASIC_USERNAME",
    "LXE_SHANGMAN_BASIC_PASSWORD",
)


def _safe_error_message(exc: Exception) -> str:
    """Preserve the real client diagnostic while removing runtime secrets."""
    message = str(exc or "")
    for name in _CREDENTIAL_ENV:
        value = str(os.environ.get(name) or "")
        if value:
            message = message.replace(value, "<redacted>")
    message = re.sub(
        r"(?i)(authorization|blade-auth|password|access_token|token|captcha[-_](?:key|code))"
        r"\s*[:=]\s*[\"']?[^,\s\"'}]+",
        r"\1=<redacted>",
        message,
    )
    return message[:300]


def preview(arguments: dict[str, Any]) -> dict[str, Any]:
    plan = build_goods_export_plan(str(arguments.get("request_text") or ""))
    return {"success": plan["status"] == "ready", **plan}


def _blocked(plan: dict[str, Any], code: str, message: str) -> dict[str, Any]:
    return {
        "success": False,
        "status": "blocked",
        "request_text": plan.get("request_text", ""),
        "intent": plan.get("intent"),
        "plan": plan.get("plan"),
        "error": {"code": code, "message": message, "recoverable": True},
    }


def run(arguments: dict[str, Any]) -> dict[str, Any]:
    plan = build_goods_export_plan(str(arguments.get("request_text") or ""))
    if plan["status"] != "ready":
        return {"success": False, **plan}

    if str(os.environ.get("LXE_SHANGMAN_PROD_ENABLED") or "").strip().lower() != "true":
        return _blocked(
            plan,
            "production_gate_required",
            "LXE_SHANGMAN_PROD_ENABLED must be true before ERP execution",
        )

    missing = [name for name in _CREDENTIAL_ENV if not str(os.environ.get(name) or "").strip()]
    if missing:
        return _blocked(
            plan,
            "credentials_required",
            "missing runtime credentials: " + ", ".join(missing),
        )

    captcha_code = str(arguments.get("captcha_code") or "").strip()
    if not captcha_code:
        return _blocked(
            plan,
            "captcha_input_required",
            "captcha_code must be supplied after the caller receives the captcha image",
        )

    credentials = ShangmanCredentials(
        tenant_id=os.environ["LXE_SHANGMAN_TENANT_ID"],
        username=os.environ["LXE_SHANGMAN_USERNAME"],
        password=os.environ["LXE_SHANGMAN_PASSWORD"],
        basic_username=os.environ["LXE_SHANGMAN_BASIC_USERNAME"],
        basic_password=os.environ["LXE_SHANGMAN_BASIC_PASSWORD"],
    )
    try:
        result = asyncio.run(
            ShangmanClient(
                credentials=credentials,
                captcha_provider=StaticCaptchaCodeProvider(captcha_code),
            ).export_goods()
        )
    except Exception as exc:  # noqa: BLE001 — preserve the client diagnostic in the CLI envelope.
        return {
            "success": False,
            "status": "failed",
            "request_text": plan["request_text"],
            "intent": plan["intent"],
            "plan": plan["plan"],
            "error": {
                "code": "erp_execution_failed",
                "message": _safe_error_message(exc),
                "recoverable": True,
            },
        }

    return {
        "success": True,
        "status": "completed",
        "request_text": plan["request_text"],
        "intent": plan["intent"],
        "plan": plan["plan"],
        **result.to_payload(),
    }


__all__ = ["preview", "run"]
