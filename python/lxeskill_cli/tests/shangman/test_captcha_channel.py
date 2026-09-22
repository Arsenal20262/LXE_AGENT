from __future__ import annotations

import asyncio

from services.shangman.captcha_channel import CAPTCHA_WAIT_TIMEOUT_S, RuntimeCaptchaCodeProvider
from services.shangman.goods_export import CaptchaChannelUnavailable, CaptchaInputExpired


def provider(*, wait_timeout_s: float = 1.0) -> RuntimeCaptchaCodeProvider:
    return RuntimeCaptchaCodeProvider(
        {
            "LXE_SHANGMAN_CAPTCHA_CHANNEL_URL": "http://127.0.0.1:45678",
            "LXE_SHANGMAN_CAPTCHA_CHANNEL_TOKEN": "opaque-channel-token",
            "LXE_AGENT_SESSION_ID": "session-1",
            "LXE_AGENT_TURN_ID": "turn-1",
        },
        wait_timeout_s=wait_timeout_s,
        poll_interval_s=0,
    )


def test_default_wait_is_bounded_to_four_minutes() -> None:
    bridge = RuntimeCaptchaCodeProvider({})

    assert CAPTCHA_WAIT_TIMEOUT_S == 240.0
    assert bridge.wait_timeout_s == CAPTCHA_WAIT_TIMEOUT_S


def test_get_code_waits_for_desktop_input_and_returns_it_in_the_same_run(monkeypatch) -> None:
    bridge = provider()
    calls: list[tuple[str, dict[str, str]]] = []
    responses = iter(
        [
            {"status": "input_required", "challenge_id": "opaque-challenge"},
            {"status": "pending"},
            {"status": "ready", "captcha_key": "erp-key", "captcha_code": "A7x9"},
        ]
    )

    async def request(path: str, payload: dict[str, str]) -> dict[str, str]:
        calls.append((path, payload))
        return next(responses)

    monkeypatch.setattr(bridge, "_request", request)

    code = asyncio.run(
        bridge.get_code("data:image/png;base64,Y2FwdGNoYQ==", captcha_key="erp-key")
    )

    assert code == "A7x9"
    assert calls == [
        (
            "/v1/captcha/challenge",
            {
                "session_id": "session-1",
                "turn_id": "turn-1",
                "captcha_key": "erp-key",
                "image": "data:image/png;base64,Y2FwdGNoYQ==",
            },
        ),
        (
            "/v1/captcha/consume",
            {"session_id": "session-1", "challenge_id": "opaque-challenge"},
        ),
        (
            "/v1/captcha/consume",
            {"session_id": "session-1", "challenge_id": "opaque-challenge"},
        ),
    ]


def test_get_code_stops_after_a_bounded_wait(monkeypatch) -> None:
    bridge = provider(wait_timeout_s=0)

    async def request(path: str, payload: dict[str, str]) -> dict[str, str]:
        if path == "/v1/captcha/challenge":
            return {"status": "input_required", "challenge_id": "opaque-challenge"}
        assert payload == {"session_id": "session-1", "challenge_id": "opaque-challenge"}
        return {"status": "pending"}

    monkeypatch.setattr(bridge, "_request", request)

    try:
        asyncio.run(
            bridge.get_code("data:image/png;base64,Y2FwdGNoYQ==", captcha_key="erp-key")
        )
    except CaptchaInputExpired as error:
        assert error.challenge_id == "opaque-challenge"
    else:
        raise AssertionError("bounded captcha wait must expire")


def test_get_code_propagates_task_cancellation(monkeypatch) -> None:
    bridge = provider(wait_timeout_s=60)
    waiting = asyncio.Event()

    async def request(path: str, payload: dict[str, str]) -> dict[str, str]:
        if path == "/v1/captcha/challenge":
            return {"status": "input_required", "challenge_id": "opaque-challenge"}
        waiting.set()
        await asyncio.sleep(60)
        return {"status": "pending"}

    monkeypatch.setattr(bridge, "_request", request)

    async def scenario() -> None:
        task = asyncio.create_task(
            bridge.get_code("data:image/png;base64,Y2FwdGNoYQ==", captcha_key="erp-key")
        )
        await waiting.wait()
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            return
        raise AssertionError("captcha wait must honor cancellation")

    asyncio.run(scenario())


def test_missing_channel_is_a_recoverable_local_error() -> None:
    bridge = RuntimeCaptchaCodeProvider({})
    try:
        asyncio.run(bridge.get_code("data:image/png;base64,Y2FwdGNoYQ==", captcha_key="key"))
    except CaptchaChannelUnavailable as error:
        assert "not configured" in str(error)
    else:
        raise AssertionError("missing captcha channel must fail")
