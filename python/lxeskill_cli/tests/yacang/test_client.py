from __future__ import annotations

from typing import Any

import pytest

from services.yacang.client import YacangClient
from services.yacang.errors import YacangError


class FakeResponse:
    def __init__(self, payload: Any, *, status_code: int = 200) -> None:
        self._payload = payload
        self.status_code = status_code
        self.text = str(payload)
        self.headers: dict[str, str] = {}

    def json(self) -> Any:
        return self._payload


class FakeSession:
    def __init__(self, responses: list[FakeResponse]) -> None:
        self.responses = list(responses)
        self.calls: list[tuple[str, str, dict[str, Any]]] = []

    def request(self, method: str, url: str, **kwargs: Any) -> FakeResponse:
        self.calls.append((method, url, kwargs))
        return self.responses.pop(0)


def test_login_uses_server_returned_code_and_keeps_token_in_client_only() -> None:
    session = FakeSession([
        FakeResponse({
            "status": 1,
            "message": "success",
            "data": {
                "key": "fake-key",
                "captcha": "data:image/jpeg;base64,not-used",
                "code": "2468",
            },
        }),
        FakeResponse({
            "status": 1,
            "message": "success",
            "data": {"token": "fake-token", "exp": 604800},
        }),
        FakeResponse({"status": 1, "message": "success", "data": {"list": []}}),
    ])
    client = YacangClient(session)  # type: ignore[arg-type]

    assert client.login("mobile", "password") is None
    method, url, kwargs = session.calls[1]
    assert method == "POST"
    assert url.endswith("/sys/customer/loginV3")
    assert kwargs["json"] == {
        "mobile": "mobile",
        "password": "password",
        "verify_code": "2468",
        "lang": "zh-cn",
        "key": "fake-key",
    }

    assert client.list_downloads() == []
    assert session.calls[2][2]["headers"]["token"] == "fake-token"


def test_business_error_preserves_remote_message_but_redacts_token() -> None:
    session = FakeSession([
        FakeResponse({"status": 0, "message": "token expired", "token": "private-value"}, status_code=401),
    ])
    client = YacangClient(session)  # type: ignore[arg-type]

    with pytest.raises(YacangError) as caught:
        client.list_downloads()

    message = str(caught.value)
    assert "HTTP 401" in message
    assert "token expired" in message
    assert "private-value" not in message
