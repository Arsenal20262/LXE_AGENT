from __future__ import annotations

import asyncio
import os
import re
from typing import Any

from services.shangman.goods_export import (
    CaptchaChannelUnavailable,
    CaptchaInputExpired,
    CaptchaInputPending,
    CaptchaInputRequired,
    ShangmanClient,
    ShangmanCredentials,
)
from services.shangman.captcha_channel import (
    CHANNEL_TOKEN_ENV,
    CHANNEL_URL_ENV,
    RuntimeCaptchaCodeProvider,
)
from services.shangman.intent import build_goods_export_plan


_CREDENTIAL_ENV = (
    "LXE_SHANGMAN_TENANT_ID",
    "LXE_SHANGMAN_USERNAME",
    "LXE_SHANGMAN_PROCESSED_PASSWORD",
    "LXE_SHANGMAN_BASIC_AUTH",
)
_CHANNEL_ENV = (
    CHANNEL_URL_ENV,
    CHANNEL_TOKEN_ENV,
    "LXE_AGENT_SESSION_ID",
    "LXE_AGENT_TURN_ID",
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
    plan = build_goods_export_plan(arguments.get("params"))
    return {"success": plan["status"] == "ready", **plan}


def _blocked(
    plan: dict[str, Any],
    code: str,
    message: str,
    *,
    challenge_id: str | None = None,
) -> dict[str, Any]:
    error: dict[str, Any] = {"code": code, "message": message, "recoverable": True}
    if challenge_id:
        error["challenge_id"] = challenge_id
    return {
        "success": False,
        "status": "blocked",
        "params": plan.get("params"),
        "intent": plan.get("intent"),
        "plan": plan.get("plan"),
        "error": error,
    }


def run(arguments: dict[str, Any]) -> dict[str, Any]:
    plan = build_goods_export_plan(arguments.get("params"))
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

    missing_channel = [name for name in _CHANNEL_ENV if not str(os.environ.get(name) or "").strip()]
    if missing_channel:
        return _blocked(
            plan,
            "captcha_channel_unavailable",
            "Desktop captcha input channel is unavailable",
        )

    credentials = ShangmanCredentials(
        tenant_id=os.environ["LXE_SHANGMAN_TENANT_ID"],
        username=os.environ["LXE_SHANGMAN_USERNAME"],
        processed_password=os.environ["LXE_SHANGMAN_PROCESSED_PASSWORD"],
        basic_auth=os.environ["LXE_SHANGMAN_BASIC_AUTH"],
    )
    try:
        result = asyncio.run(
            ShangmanClient(
                credentials=credentials,
                captcha_provider=RuntimeCaptchaCodeProvider(),
            ).export_goods()
        )
    except CaptchaInputRequired as exc:
        return _blocked(
            plan,
            "captcha_input_required",
            "Captcha input is required in the Desktop panel",
            challenge_id=exc.challenge_id,
        )
    except CaptchaInputPending as exc:
        return _blocked(
            plan,
            "captcha_input_pending",
            "Captcha input is still pending in the Desktop panel",
            challenge_id=exc.challenge_id,
        )
    except CaptchaInputExpired as exc:
        return _blocked(
            plan,
            "captcha_expired",
            "Captcha input expired; rerun the export to request a new challenge",
            challenge_id=exc.challenge_id,
        )
    except CaptchaChannelUnavailable:
        return _blocked(
            plan,
            "captcha_channel_unavailable",
            "Desktop captcha input channel is unavailable",
        )
    except Exception as exc:  # noqa: BLE001 — preserve the client diagnostic in the CLI envelope.
        return {
            "success": False,
            "status": "failed",
            "params": plan["params"],
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
        "params": plan["params"],
        "intent": plan["intent"],
        "plan": plan["plan"],
        **result.to_payload(),
    }


__all__ = ["preview", "run"]
