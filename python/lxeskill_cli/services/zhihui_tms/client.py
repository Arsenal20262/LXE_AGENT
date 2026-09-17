from __future__ import annotations

import random
import time
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

import requests

from .errors import (
    ZhihuiTmsApiError,
    ZhihuiTmsConfigError,
    ZhihuiTmsHttpError,
    ZhihuiTmsSchemaError,
    ZhihuiTmsTransportError,
)
from .schemas import LoginResult, parse_login_response


DEFAULT_BASE_URL = "https://tms.mabangerp.com/tmsapi"
DEFAULT_TIMEOUT: tuple[float, float] = (5.0, 30.0)
RETRYABLE_STATUS_CODES = frozenset({408, 429, 500, 502, 503, 504})


@dataclass(frozen=True)
class RetryPolicy:
    max_attempts: int = 3
    backoff_seconds: float = 1.0
    jitter_ratio: float = 0.25
    retryable_status_codes: frozenset[int] = field(default_factory=lambda: RETRYABLE_STATUS_CODES)

    def __post_init__(self) -> None:
        if self.max_attempts < 1 or self.max_attempts > 10:
            raise ValueError("max_attempts must be between 1 and 10")
        if self.backoff_seconds < 0:
            raise ValueError("backoff_seconds must not be negative")
        if not 0 <= self.jitter_ratio <= 1:
            raise ValueError("jitter_ratio must be between 0 and 1")

    def delay(self, attempt: int, *, random_fn: Callable[[], float]) -> float:
        base = self.backoff_seconds * (2 ** max(0, attempt - 1))
        if self.jitter_ratio == 0:
            return base
        jitter = (random_fn() * 2 - 1) * self.jitter_ratio
        return max(0.0, base * (1 + jitter))


class ZhihuiTmsClient:
    def __init__(
        self,
        *,
        base_url: str = DEFAULT_BASE_URL,
        session: requests.Session | Any | None = None,
        timeout: tuple[float, float] = DEFAULT_TIMEOUT,
        retry_policy: RetryPolicy | None = None,
        sleeper: Callable[[float], None] = time.sleep,
        random_fn: Callable[[], float] = random.random,
    ) -> None:
        normalized_base_url = str(base_url or "").strip().rstrip("/")
        if not normalized_base_url.startswith(("https://", "http://")):
            raise ZhihuiTmsConfigError(
                "tms_base_url_invalid",
                "智汇 TMS base URL 必须使用 HTTP(S) 协议",
            )
        if len(timeout) != 2 or any(float(value) <= 0 for value in timeout):
            raise ZhihuiTmsConfigError(
                "tms_timeout_invalid",
                "智汇 TMS timeout 必须包含正数 connect/read 值",
            )
        self.base_url = normalized_base_url
        self.session = session or requests.Session()
        self.timeout = (float(timeout[0]), float(timeout[1]))
        self.retry_policy = retry_policy or RetryPolicy()
        self._sleeper = sleeper
        self._random_fn = random_fn
        self._api_token = ""

    @property
    def api_token(self) -> str:
        """Return the in-memory token for authenticated follow-up requests."""

        return self._api_token

    def login(
        self,
        username: str,
        password: str,
        *,
        local_time: str | None = None,
    ) -> LoginResult:
        safe_username = str(username or "").strip()
        if not safe_username or not str(password):
            raise ZhihuiTmsConfigError(
                "tms_credentials_missing",
                "智汇 TMS 登录账号和密码不能为空",
            )
        payload = {
            "userName": safe_username,
            "pwd": str(password),
            "local_time": local_time or datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        }
        response_payload = self._post_json(
            "/login",
            payload,
            operation="智汇 TMS 登录",
            login=True,
            secrets=(safe_username, str(password)),
        )
        result = parse_login_response(
            response_payload,
            http_status=200,
            secrets=(safe_username, str(password)),
        )
        self._api_token = result.api_token
        return result

    def post_json(
        self,
        path: str,
        payload: Mapping[str, Any],
        *,
        operation: str,
    ) -> dict[str, Any]:
        if not self._api_token:
            raise ZhihuiTmsConfigError(
                "tms_not_authenticated",
                f"{operation} 需要先完成智汇 TMS 登录",
            )
        return self._post_json(
            path,
            payload,
            operation=operation,
            login=False,
            secrets=(self._api_token,),
        )

    def find_my_stockwarehouse_list(self, *, page: int) -> dict[str, Any]:
        if isinstance(page, bool) or not isinstance(page, int) or page < 1:
            raise ValueError("智汇 TMS 商品列表页码必须是正整数")
        return self.post_json(
            "/findMyStockwarehouseList",
            {
                "page": page,
                "pageSize": 1000,
                "isConfirm": 1,
                "classId": None,
                "orderBys": "2",
                "status": 1,
                "gridproperty": -1,
                "if_produce": "-1",
                "providerId": "",
                "stockQuantity": -1,
            },
            operation="智汇 TMS 商品列表",
        )

    def export_stockwarehouse(self, product_ids: Sequence[Any]) -> dict[str, Any]:
        if isinstance(product_ids, (str, bytes, bytearray)) or not product_ids:
            raise ValueError("智汇 TMS 商品导出至少需要一个商品 ID")
        return self.post_json(
            "/exportStockwarehouse",
            {
                "startNum": None,
                "pageSize": 1000,
                "classId": None,
                "gridproperty": -1,
                "idsList": list(product_ids),
                "isCombo": 1,
                "ischecked": False,
                "orderBys": "2",
                "status": 1,
                "stockValueArr": [
                    "stockSku",
                    "sale3",
                    "sale1",
                    "availableinventory",
                    "sale2",
                    "warehouse",
                    "stockQuantity",
                    "allotShippingQuantity",
                    "stockCost",
                    "purchasePrice",
                    "lastInTime",
                    "sale5",
                ],
            },
            operation="智汇 TMS 商品分页导出",
        )

    def _post_json(
        self,
        path: str,
        payload: Mapping[str, Any],
        *,
        operation: str,
        login: bool,
        secrets: tuple[str, ...],
    ) -> dict[str, Any]:
        if not isinstance(payload, Mapping):
            raise ZhihuiTmsConfigError(
                "tms_payload_invalid",
                f"{operation} 请求体必须是 JSON object",
            )
        url = f"{self.base_url}/{str(path or '').lstrip('/')}"
        headers = {
            "Accept": "application/json, text/plain, */*",
            "Content-Type": "application/json;charset=UTF-8",
            "lang": "zh_CN",
        }
        if login:
            headers["menu-path"] = "#/login"
        elif self._api_token:
            headers["token"] = self._api_token

        for attempt in range(1, self.retry_policy.max_attempts + 1):
            try:
                response = self.session.request(
                    "POST",
                    url,
                    headers=headers,
                    json=dict(payload),
                    timeout=self.timeout,
                    allow_redirects=False,
                )
            except (requests.Timeout, requests.ConnectionError) as exc:
                if attempt < self.retry_policy.max_attempts:
                    self._sleep_for_retry(attempt)
                    continue
                raise ZhihuiTmsTransportError(
                    "tms_transport_error",
                    f"{operation} 网络请求失败: {exc}",
                    secrets=secrets,
                ) from exc
            except requests.RequestException as exc:
                raise ZhihuiTmsTransportError(
                    "tms_transport_error",
                    f"{operation} HTTP 客户端失败: {exc}",
                    secrets=secrets,
                ) from exc

            status_code = int(response.status_code)
            if status_code in self.retry_policy.retryable_status_codes and attempt < self.retry_policy.max_attempts:
                self._sleep_for_retry(attempt, retry_after=response.headers.get("Retry-After"))
                continue
            return self._decode_response(
                response,
                operation=operation,
                secrets=secrets,
                require_http_200=login,
            )

        raise AssertionError("unreachable")

    def _sleep_for_retry(self, attempt: int, *, retry_after: str | None = None) -> None:
        delay = self._parse_retry_after(retry_after)
        if delay is None:
            delay = self.retry_policy.delay(attempt, random_fn=self._random_fn)
        self._sleeper(delay)

    @staticmethod
    def _parse_retry_after(value: str | None) -> float | None:
        if value is None:
            return None
        try:
            delay = float(value)
        except (TypeError, ValueError):
            return None
        return delay if delay >= 0 else None

    @staticmethod
    def _decode_response(
        response: Any,
        *,
        operation: str,
        secrets: tuple[str, ...],
        require_http_200: bool,
    ) -> dict[str, Any]:
        status_code = int(response.status_code)
        try:
            payload = response.json()
        except Exception as exc:
            body = str(getattr(response, "text", "") or "")
            raise ZhihuiTmsSchemaError(
                "tms_response_invalid_json",
                f"{operation} 返回了无法解析的 JSON: HTTP {status_code}, body={body}",
                http_status=status_code,
                payload=body,
                secrets=secrets,
            ) from exc

        if not isinstance(payload, Mapping):
            raise ZhihuiTmsSchemaError(
                "tms_response_schema_invalid",
                f"{operation} 返回 JSON 不是 object: HTTP {status_code}",
                http_status=status_code,
                payload=payload,
                secrets=secrets,
            )

        if not 200 <= status_code < 300 or (require_http_200 and status_code != 200):
            observed_message = str(payload.get("msg") or payload.get("message") or response.text)
            raise ZhihuiTmsHttpError(
                f"tms_http_{status_code}",
                f"{operation} HTTP {status_code}: {observed_message}",
                http_status=status_code,
                payload=payload,
                secrets=secrets,
            )

        if payload.get("code") != "200":
            observed_message = str(payload.get("msg") or payload.get("message") or payload.get("code"))
            raise ZhihuiTmsApiError(
                "tms_business_error",
                f"{operation} 业务响应失败: {observed_message}",
                http_status=status_code,
                payload=payload,
                secrets=secrets,
            )
        return dict(payload)


__all__ = ["DEFAULT_BASE_URL", "DEFAULT_TIMEOUT", "RetryPolicy", "ZhihuiTmsClient"]
