from __future__ import annotations

import asyncio
import os
import re
from typing import Any

from services.shangman.goods_export import (
    CaptchaChannelUnavailable,
    CaptchaInputExpired,
    ShangmanClient,
    ShangmanCredentials,
    ShangmanAuthError,
)
from services.shangman.captcha_channel import (
    CHANNEL_TOKEN_ENV,
    CHANNEL_URL_ENV,
    RuntimeCaptchaCodeProvider,
)
from services.shangman.intent import COUNTRY, OPERATION, PLATFORM, build_goods_export_plan


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


def _terminal_data(*, recoverable: bool | None = None, row_count: Any = None) -> dict[str, Any]:
    data: dict[str, Any] = {
        "platform": PLATFORM,
        "country": COUNTRY,
        "business_type": OPERATION,
    }
    if recoverable is not None:
        data["recoverable"] = recoverable
    if isinstance(row_count, int) and not isinstance(row_count, bool):
        data["row_count"] = row_count
    return data


def _terminal_projection(
    *,
    recoverable: bool | None = None,
    row_count: Any = None,
    code: str | None = None,
    message: str | None = None,
) -> dict[str, Any]:
    projection: dict[str, Any] = {
        "data": _terminal_data(recoverable=recoverable, row_count=row_count),
    }
    if code is not None and message is not None:
        projection["error"] = {"code": code, "message": message}
    return {"terminal_projection": projection}


def _blocked(
    plan: dict[str, Any],
    code: str,
    message: str,
) -> dict[str, Any]:
    error: dict[str, Any] = {"code": code, "message": message, "recoverable": True}
    return {
        "success": False,
        "status": "blocked",
        "params": plan.get("params"),
        "intent": plan.get("intent"),
        "plan": plan.get("plan"),
        "error": error,
        **_terminal_projection(recoverable=True, code=code, message=message),
    }


def _failed(plan: dict[str, Any], code: str, message: str, *, recoverable: bool) -> dict[str, Any]:
    return {
        "success": False,
        "status": "failed",
        "params": plan["params"],
        "intent": plan["intent"],
        "plan": plan["plan"],
        "error": {
            "code": code,
            "message": message,
            "recoverable": recoverable,
        },
        **_terminal_projection(
            recoverable=recoverable,
            code=code,
            message=message,
        ),
    }


def run(arguments: dict[str, Any]) -> dict[str, Any]:
    plan = build_goods_export_plan(arguments.get("params"))
    if plan["status"] != "ready":
        error = dict(plan.get("error") or {})
        code = str(error.get("code") or "params_invalid")
        message = str(error.get("message") or "invalid Shangman export parameters")
        recoverable = bool(error.get("recoverable", True))
        return {
            "success": False,
            **plan,
            **_terminal_projection(
                recoverable=recoverable,
                code=code,
                message=message,
            ),
        }

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
    except asyncio.CancelledError:
        return _blocked(
            plan,
            "captcha_cancelled",
            "Captcha input was cancelled",
        )
    except CaptchaInputExpired:
        return _blocked(
            plan,
            "captcha_expired",
            "Captcha input timed out or the challenge expired",
        )
    except CaptchaChannelUnavailable:
        return _blocked(
            plan,
            "captcha_channel_unavailable",
            "Desktop captcha input channel is unavailable",
        )
    except ShangmanAuthError as exc:
        return _failed(
            plan,
            "shangman_auth_failed",
            _safe_error_message(exc),
            recoverable=False,
        )
    except Exception as exc:  # noqa: BLE001 — preserve the client diagnostic in the CLI envelope.
        return _failed(
            plan,
            "erp_execution_failed",
            _safe_error_message(exc),
            recoverable=True,
        )

    payload = result.to_payload()
    return {
        "success": True,
        "status": "completed",
        "params": plan["params"],
        "intent": plan["intent"],
        "plan": plan["plan"],
        **payload,
        **_terminal_projection(row_count=payload.get("row_count")),
    }


__all__ = ["preview", "run"]
