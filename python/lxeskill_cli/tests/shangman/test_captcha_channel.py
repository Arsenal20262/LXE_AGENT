from __future__ import annotations

import asyncio

import pytest

from services.shangman.captcha_channel import RuntimeCaptchaCodeProvider
from services.shangman.goods_export import (
    CaptchaChannelUnavailable,
    CaptchaInputExpired,
    CaptchaInputPending,
    CaptchaInputRequired,
)


def provider() -> RuntimeCaptchaCodeProvider:
    return RuntimeCaptchaCodeProvider({
        "LXE_SHANGMAN_CAPTCHA_CHANNEL_URL": "http://127.0.0.1:45678",
        "LXE_SHANGMAN_CAPTCHA_CHANNEL_TOKEN": "opaque-channel-token",
        "LXE_AGENT_SESSION_ID": "session-1",
        "LXE_AGENT_TURN_ID": "turn-1",
    })


def test_get_code_creates_a_challenge_without_returning_the_captcha(monkeypatch) -> None:
    bridge = provider()
    calls: list[tuple[str, dict[str, str]]] = []

    async def request(path: str, payload: dict[str, str]) -> dict[str, str]:
        calls.append((path, payload))
        return {"status": "input_required", "challenge_id": "opaque-challenge"}

    monkeypatch.setattr(bridge, "_request", request)

    with pytest.raises(CaptchaInputRequired) as error:
        asyncio.run(bridge.get_code("data:image/png;base64,Y2FwdGNoYQ==", captcha_key="erp-key"))

    assert error.value.challenge_id == "opaque-challenge"
    assert calls == [(
        "/v1/captcha/challenge",
        {
            "session_id": "session-1",
            "turn_id": "turn-1",
            "captcha_key": "erp-key",
            "image": "data:image/png;base64,Y2FwdGNoYQ==",
        },
    )]
    assert "captcha_code" not in str(error.value)


@pytest.mark.parametrize(
    ("status", "error_type"),
    [("pending", CaptchaInputPending), ("expired", CaptchaInputExpired)],
)
def test_resume_reports_only_the_opaque_challenge_state(monkeypatch, status, error_type) -> None:
    bridge = provider()
    bridge.challenge_id = "opaque-challenge"

    async def request(path: str, payload: dict[str, str]) -> dict[str, str]:
        assert path == "/v1/captcha/consume"
        assert payload == {"session_id": "session-1", "challenge_id": "opaque-challenge"}
        return {"status": status}

    monkeypatch.setattr(bridge, "_request", request)

    with pytest.raises(error_type) as error:
        asyncio.run(bridge.resume())
    assert error.value.challenge_id == "opaque-challenge"


def test_missing_channel_is_a_recoverable_local_error() -> None:
    bridge = RuntimeCaptchaCodeProvider({})
    with pytest.raises(CaptchaChannelUnavailable, match="not configured"):
        asyncio.run(bridge.get_code("data:image/png;base64,Y2FwdGNoYQ==", captcha_key="key"))
