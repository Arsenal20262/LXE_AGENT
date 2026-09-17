from __future__ import annotations

import os
from typing import Any

import aiohttp

from .goods_export import (
    CaptchaChannelUnavailable,
    CaptchaInputExpired,
    CaptchaInputPending,
    CaptchaInputRequired,
)


CHANNEL_URL_ENV = "LXE_SHANGMAN_CAPTCHA_CHANNEL_URL"
CHANNEL_TOKEN_ENV = "LXE_SHANGMAN_CAPTCHA_CHANNEL_TOKEN"
SESSION_ID_ENV = "LXE_AGENT_SESSION_ID"
TURN_ID_ENV = "LXE_AGENT_TURN_ID"
CHALLENGE_ID_ENV = "LXE_SHANGMAN_CAPTCHA_CHALLENGE_ID"


def _text(value: Any) -> str:
    return str(value or "").strip()


class RuntimeCaptchaCodeProvider:
    """Bridge ERP captcha images to the Desktop-only, one-time input channel."""

    def __init__(self, environ: dict[str, str] | None = None, *, timeout_s: float = 5.0) -> None:
        source = environ if environ is not None else os.environ
        self.channel_url = _text(source.get(CHANNEL_URL_ENV)).rstrip("/")
        self.channel_token = _text(source.get(CHANNEL_TOKEN_ENV))
        self.session_id = _text(source.get(SESSION_ID_ENV))
        self.turn_id = _text(source.get(TURN_ID_ENV))
        self.challenge_id = _text(source.get(CHALLENGE_ID_ENV))
        self.timeout = aiohttp.ClientTimeout(total=timeout_s)

    def _require_channel(self) -> None:
        if not self.channel_url or not self.channel_token or not self.session_id:
            raise CaptchaChannelUnavailable("Desktop captcha channel is not configured")

    async def _request(self, path: str, payload: dict[str, str]) -> dict[str, Any]:
        self._require_channel()
        headers = {
            "Authorization": f"Bearer {self.channel_token}",
            "Content-Type": "application/json",
        }
        try:
            async with aiohttp.ClientSession(timeout=self.timeout, trust_env=False) as session:
                async with session.post(
                    f"{self.channel_url}{path}",
                    json=payload,
                    headers=headers,
                ) as response:
                    status = int(response.status)
                    try:
                        value = await response.json(content_type=None)
                    except (TypeError, ValueError):
                        value = {}
        except (aiohttp.ClientError, TimeoutError, OSError) as exc:
            raise CaptchaChannelUnavailable("Desktop captcha channel is unavailable") from exc
        if status < 200 or status >= 300 or not isinstance(value, dict):
            raise CaptchaChannelUnavailable(
                f"Desktop captcha channel request failed (status={status})"
            )
        return value

    async def resume(self) -> tuple[str, str] | None:
        if not self.challenge_id:
            return None
        response = await self._request(
            "/v1/captcha/consume",
            {"session_id": self.session_id, "challenge_id": self.challenge_id},
        )
        status = _text(response.get("status"))
        if status == "ready":
            captcha_key = _text(response.get("captcha_key"))
            captcha_code = _text(response.get("captcha_code"))
            if not captcha_key or not captcha_code:
                raise CaptchaChannelUnavailable("Desktop captcha channel returned incomplete input")
            return captcha_key, captcha_code
        if status == "pending":
            raise CaptchaInputPending(self.challenge_id)
        if status == "expired":
            raise CaptchaInputExpired(self.challenge_id)
        raise CaptchaChannelUnavailable("Desktop captcha channel returned an unknown state")

    async def get_code(self, image: str, *, captcha_key: str = "") -> str:
        response = await self._request(
            "/v1/captcha/challenge",
            {
                "session_id": self.session_id,
                "turn_id": self.turn_id,
                "captcha_key": _text(captcha_key),
                "image": _text(image),
            },
        )
        status = _text(response.get("status"))
        challenge_id = _text(response.get("challenge_id"))
        if status == "input_required" and challenge_id:
            raise CaptchaInputRequired(challenge_id)
        if status == "pending" and challenge_id:
            raise CaptchaInputPending(challenge_id)
        if status == "expired" and challenge_id:
            raise CaptchaInputExpired(challenge_id)
        raise CaptchaChannelUnavailable("Desktop captcha channel returned an unknown state")


__all__ = [
    "CHANNEL_TOKEN_ENV",
    "CHANNEL_URL_ENV",
    "CHALLENGE_ID_ENV",
    "RuntimeCaptchaCodeProvider",
]
