from __future__ import annotations

import asyncio
from typing import Any
from .auth import AuthClient, AuthError, Credentials
from .state import AuthStore


def run_action(action: str, arguments: dict[str, Any]) -> dict:
    credentials = None
    key = code = ""
    try:
        credentials = Credentials.from_environment()
        store = AuthStore(credentials)
        if action == "status":
            return {"success": True, **store.status()}
        if action == "clear":
            store.clear()
            return {"success": True, "status": "cleared", "remote_logout": False}
        store.assert_current()
        client = AuthClient(credentials)
        if action == "prepare":
            key, image = asyncio.run(client.captcha())
            return {"success": True, "status": "ready", **store.prepare(key, image)}
        if action != "submit":
            raise AuthError("invalid_action", f"Unsupported action: {action}")
        code = str(arguments.get("captcha_code") or "").strip()
        if not code or len(code) > 128 or any(ord(ch) < 32 or ord(ch) == 127 for ch in code):
            raise AuthError("invalid_code", "验证码必须是 1–128 个非控制字符")
        key, epoch = store.consume(str(arguments.get("challenge_id") or ""))
        token = asyncio.run(client.login(key, code))
        try:
            saved = store.save(token, epoch=epoch)
        except Exception as exc:
            return {"success": False, "status": "save_failed", "login_succeeded": True, "persisted": False,
                    "error": {"code": "state_save_failed", "message": credentials.diagnostic(f"{type(exc).__name__}: {exc}", token.value, key, code)}}
        return {"success": True, "status": "authenticated", "login_succeeded": True, "persisted": True, **saved}
    except Exception as exc:
        message = f"{type(exc).__name__}: {exc}"
        return {"success": False, "status": "failed", "error": {"code": getattr(exc, "code", "login_execution_failed"), "message": credentials.diagnostic(message, key, code) if credentials else message}}
