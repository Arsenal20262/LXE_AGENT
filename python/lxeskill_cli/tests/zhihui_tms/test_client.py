from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
import requests

from services.zhihui_tms.client import RetryPolicy, ZhihuiTmsClient
from services.zhihui_tms.errors import (
    ZhihuiTmsApiError,
    ZhihuiTmsConfigError,
    ZhihuiTmsHttpError,
    ZhihuiTmsSchemaError,
    ZhihuiTmsTransportError,
)


FIXTURES = Path(__file__).parent / "fixtures"


class FakeResponse:
    def __init__(
        self,
        status_code: int,
        payload: Any = None,
        *,
        text: str | None = None,
        headers: dict[str, str] | None = None,
        json_error: Exception | None = None,
        set_cookie: str | None = None,
    ) -> None:
        self.status_code = status_code
        self._payload = payload
        self.text = text if text is not None else json.dumps(payload, ensure_ascii=False)
        self.headers = dict(headers or {})
        self.json_error = json_error
        self.set_cookie = set_cookie

    def json(self) -> Any:
        if self.json_error is not None:
            raise self.json_error
        return self._payload


class FakeSession:
    def __init__(self, responses: list[Any]) -> None:
        self.responses = list(responses)
        self.calls: list[dict[str, Any]] = []
        self.cookies = requests.cookies.RequestsCookieJar()

    def request(self, method: str, url: str, **kwargs: Any) -> FakeResponse:
        self.calls.append({"method": method, "url": url, **kwargs})
        response = self.responses.pop(0)
        if isinstance(response, BaseException):
            raise response
        if response.set_cookie:
            self.cookies.set("JSESSIONID", response.set_cookie, domain="tms.mabangerp.com")
        return response


def _fixture(name: str) -> dict[str, Any]:
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


def _client(session: FakeSession, *, sleeps: list[float] | None = None) -> ZhihuiTmsClient:
    return ZhihuiTmsClient(
        base_url="https://tms.mabangerp.com/tmsapi",
        session=session,
        timeout=(5.0, 30.0),
        retry_policy=RetryPolicy(max_attempts=3, backoff_seconds=1.0, jitter_ratio=0.0),
        sleeper=(sleeps if sleeps is not None else []).append,
        random_fn=lambda: 0.5,
    )


def test_login_sends_documented_body_and_explicit_timeout_without_prelogin_token() -> None:
    session = FakeSession([FakeResponse(200, _fixture("login_success.json"), set_cookie="fixture-session")])
    client = _client(session)

    result = client.login("fixture-user", "fixture-password", local_time="2026-09-17 12:34:56")

    call = session.calls[0]
    assert call["method"] == "POST"
    assert call["url"] == "https://tms.mabangerp.com/tmsapi/login"
    assert call["json"] == {
        "userName": "fixture-user",
        "pwd": "fixture-password",
        "local_time": "2026-09-17 12:34:56",
    }
    assert call["timeout"] == (5.0, 30.0)
    assert call["headers"]["Content-Type"] == "application/json;charset=UTF-8"
    assert call["headers"]["menu-path"] == "#/login"
    assert "token" not in call["headers"]
    assert result.api_token == "fixture-api-token"
    assert client.api_token == "fixture-api-token"
    assert session.cookies.get("JSESSIONID") == "fixture-session"


def test_login_requires_exact_http_200() -> None:
    session = FakeSession([FakeResponse(201, _fixture("login_success.json"))])
    client = _client(session)

    with pytest.raises(ZhihuiTmsHttpError) as captured:
        client.login("fixture-user", "fixture-password", local_time="2026-09-17 12:34:56")

    assert captured.value.http_status == 201
    assert client.api_token == ""


def test_authenticated_post_reuses_session_and_sends_runtime_token() -> None:
    session = FakeSession(
        [
            FakeResponse(200, _fixture("login_success.json"), set_cookie="fixture-session"),
            FakeResponse(200, {"code": "200", "msg": "成功", "datas": []}),
        ]
    )
    client = _client(session)
    client.login("fixture-user", "fixture-password", local_time="2026-09-17 12:34:56")

    result = client.post_json("/findMyStockwarehouseList", {"page": 1}, operation="商品列表")

    assert result["code"] == "200"
    assert session.calls[1]["headers"]["token"] == "fixture-api-token"
    assert session.calls[1]["json"] == {"page": 1}
    assert "menu-path" not in session.calls[1]["headers"]


def test_post_requires_authenticated_session() -> None:
    client = _client(FakeSession([]))

    with pytest.raises(ZhihuiTmsConfigError, match="先完成智汇 TMS 登录"):
        client.post_json("/private", {}, operation="认证请求")


def test_retryable_status_uses_bounded_exponential_delay_then_returns_success() -> None:
    sleeps: list[float] = []
    session = FakeSession(
        [
            FakeResponse(503, {"code": "TEMP", "msg": "服务暂时不可用"}),
            FakeResponse(200, {"code": "200", "msg": "成功", "data": {}}),
        ]
    )
    client = _client(session, sleeps=sleeps)
    client._api_token = "fixture-api-token"

    result = client.post_json("/temporary", {}, operation="临时请求")

    assert result["code"] == "200"
    assert len(session.calls) == 2
    assert sleeps == [1.0]


def test_retry_after_is_honored_for_429_and_transport_failures_are_retryable() -> None:
    sleeps: list[float] = []
    session = FakeSession(
        [
            FakeResponse(429, {"code": "RATE_LIMIT", "msg": "请求过于频繁"}, headers={"Retry-After": "3"}),
            requests.ConnectionError("connection reset token=fixture-api-token"),
            FakeResponse(200, {"code": "200", "msg": "成功", "data": {}}),
        ]
    )
    client = _client(session, sleeps=sleeps)
    client._api_token = "fixture-api-token"

    result = client.post_json("/temporary", {}, operation="限流请求")

    assert result["code"] == "200"
    assert len(session.calls) == 3
    assert sleeps == [3.0, 2.0]


def test_authentication_http_error_stops_without_retry_and_redacts_token() -> None:
    session = FakeSession(
        [
            FakeResponse(
                401,
                {"code": "401", "msg": "token=fixture-api-token 已失效"},
            ),
            FakeResponse(200, {"code": "200"}),
        ]
    )
    client = _client(session)
    client._api_token = "fixture-api-token"

    with pytest.raises(ZhihuiTmsHttpError) as captured:
        client.post_json("/private", {}, operation="认证请求")

    assert len(session.calls) == 1
    assert captured.value.http_status == 401
    assert "fixture-api-token" not in str(captured.value)
    assert "[REDACTED]" in str(captured.value)


def test_business_error_preserves_observed_message_and_redacts_payload_secrets() -> None:
    session = FakeSession([FakeResponse(200, _fixture("business_error.json"))])
    client = _client(session)
    client._api_token = "fixture-api-token"

    with pytest.raises(ZhihuiTmsApiError) as captured:
        client.post_json("/private", {}, operation="业务请求")

    assert "账号授权失败" in str(captured.value)
    serialized = str(captured.value) + repr(captured.value.payload)
    assert "fixture-token-echo" not in serialized
    assert "fixture-password" not in serialized


def test_invalid_json_preserves_redacted_observed_body_and_truncates_it() -> None:
    session = FakeSession(
        [
            FakeResponse(
                200,
                text="invalid apiToken=fixture-api-token " + ("x" * 5_000),
                json_error=ValueError("not json"),
            )
        ]
    )
    client = _client(session)
    client._api_token = "fixture-api-token"

    with pytest.raises(ZhihuiTmsSchemaError) as captured:
        client.post_json("/private", {}, operation="结构请求")

    assert "fixture-api-token" not in str(captured.value)
    assert "[REDACTED]" in str(captured.value)
    assert "[truncated " in str(captured.value)


def test_transport_failure_after_retries_maps_to_truthful_redacted_error() -> None:
    sleeps: list[float] = []
    session = FakeSession(
        [
            requests.Timeout("read timed out password=fixture-password"),
            requests.Timeout("read timed out password=fixture-password"),
            requests.Timeout("read timed out password=fixture-password"),
        ]
    )
    client = _client(session, sleeps=sleeps)

    with pytest.raises(ZhihuiTmsTransportError) as captured:
        client.login("fixture-user", "fixture-password", local_time="2026-09-17 12:34:56")

    assert len(session.calls) == 3
    assert sleeps == [1.0, 2.0]
    assert "fixture-password" not in str(captured.value)
    assert "[REDACTED]" in str(captured.value)
