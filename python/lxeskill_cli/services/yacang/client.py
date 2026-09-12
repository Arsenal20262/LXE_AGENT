from __future__ import annotations

import base64
import hashlib
import json
from pathlib import Path
from typing import Any, Mapping
from urllib.parse import urlparse

import requests

from services.yacang.errors import YacangError, safe_remote_detail
from shared.infra.net.requests_client import external_requests_session


API_ORIGIN = "https://api-oms.seaya.cn"
WEB_ORIGIN = "http://m.seaya.cn"
DOWNLOAD_HOST = "oss-accelerate.seaya.cn"
XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
MAX_XLSX_BYTES = 50 * 1024 * 1024


class YacangClient:
    def __init__(self, session: requests.Session | Any = external_requests_session) -> None:
        self._session = session
        self._token = ""

    @property
    def _json_headers(self) -> dict[str, str]:
        headers = {
            "Accept": "application/json, text/plain, */*",
            "Origin": WEB_ORIGIN,
            "Referer": f"{WEB_ORIGIN}/",
        }
        if self._token:
            headers["token"] = self._token
        return headers

    def _json_request(
        self,
        method: str,
        path: str,
        *,
        stage: str,
        params: Mapping[str, Any] | None = None,
        json_body: Mapping[str, Any] | None = None,
    ) -> dict[str, Any]:
        url = f"{API_ORIGIN}{path}"
        try:
            response = self._session.request(
                method,
                url,
                headers=self._json_headers,
                params=dict(params or {}),
                json=dict(json_body) if json_body is not None else None,
            )
        except requests.RequestException as exc:
            raise YacangError(stage, f"{type(exc).__name__}: {exc}") from exc

        try:
            payload = response.json()
        except (requests.JSONDecodeError, json.JSONDecodeError, ValueError) as exc:
            detail = safe_remote_detail(response.text)
            raise YacangError(stage, f"HTTP {response.status_code}, 非 JSON 响应: {detail}") from exc
        if not isinstance(payload, dict):
            raise YacangError(stage, f"HTTP {response.status_code}, 响应结构无效: {safe_remote_detail(payload)}")
        if response.status_code != 200 or payload.get("status") != 1:
            raise YacangError(stage, f"HTTP {response.status_code}, 响应: {safe_remote_detail(payload)}")
        return payload

    def login(self, mobile: str, password: str) -> None:
        verify = self._json_request("GET", "/sys/customer/verify", stage="获取登录验证码")
        verify_data = verify.get("data")
        if not isinstance(verify_data, dict):
            raise YacangError("获取登录验证码", f"缺少 data: {safe_remote_detail(verify)}")
        key = str(verify_data.get("key") or "").strip()
        code = str(verify_data.get("code") or "").strip()
        if not key or not code:
            raise YacangError("获取登录验证码", f"缺少 key/code: {safe_remote_detail(verify)}")

        login = self._json_request(
            "POST",
            "/sys/customer/loginV3",
            stage="登录",
            json_body={
                "mobile": mobile,
                "password": password,
                "verify_code": code,
                "lang": "zh-cn",
                "key": key,
            },
        )
        login_data = login.get("data")
        token = str(login_data.get("token") or "").strip() if isinstance(login_data, dict) else ""
        if not token:
            raise YacangError("登录", f"成功响应缺少 token: {safe_remote_detail(login)}")
        self._token = token

    def list_downloads(self, *, limit: int = 50) -> list[dict[str, Any]]:
        payload = self._json_request(
            "GET",
            "/sys/customer/downPath/list",
            stage="读取导出队列",
            params={"page": 1, "limit": limit},
        )
        data = payload.get("data")
        rows = data.get("list") if isinstance(data, dict) else None
        if not isinstance(rows, list):
            raise YacangError("读取导出队列", f"缺少 data.list: {safe_remote_detail(payload)}")
        return [dict(row) for row in rows if isinstance(row, dict)]

    def create_inventory_sales_export(
        self,
        *,
        warehouse_id: int,
        start_date: str,
        end_date: str,
    ) -> str:
        payload = self._json_request(
            "GET",
            "/sys/customer/mrpPrepare/export",
            stage="提交库存动销导出",
            params={
                "page": 1,
                "limit": 10,
                "create_time": f"{start_date} - {end_date}",
                "sku_condition": 1,
                "warehouse_id": warehouse_id,
            },
        )
        return str(payload.get("request_id") or "")

    def download_xlsx(self, url: str, destination: Path) -> None:
        parsed = urlparse(str(url or "").strip())
        if parsed.scheme != "https" or parsed.hostname != DOWNLOAD_HOST or not parsed.path.lower().endswith(".xlsx"):
            raise YacangError("下载 XLSX", f"导出队列返回了不受信任的文件地址: scheme={parsed.scheme}, host={parsed.hostname or '[missing]'}")
        try:
            response = self._session.get(
                url,
                headers={"Accept": "*/*", "Origin": WEB_ORIGIN, "Referer": f"{WEB_ORIGIN}/"},
                allow_redirects=False,
                stream=True,
            )
        except requests.RequestException as exc:
            raise YacangError("下载 XLSX", f"{type(exc).__name__}: {exc}") from exc
        if response.status_code != 200:
            raise YacangError("下载 XLSX", f"HTTP {response.status_code}, 响应: {safe_remote_detail(response.text)}")
        content_type = str(response.headers.get("Content-Type") or "").split(";", 1)[0].strip().lower()
        if content_type != XLSX_CONTENT_TYPE:
            raise YacangError("下载 XLSX", f"Content-Type 无效: {content_type or '[missing]'}")
        declared_length = int(response.headers.get("Content-Length") or 0)
        if declared_length > MAX_XLSX_BYTES:
            raise YacangError("下载 XLSX", f"Content-Length 超过 {MAX_XLSX_BYTES} 字节: {declared_length}")

        temporary = destination.with_suffix(destination.suffix + ".part")
        size = 0
        md5 = hashlib.md5(usedforsecurity=False)
        try:
            with temporary.open("wb") as handle:
                for chunk in response.iter_content(chunk_size=64 * 1024):
                    if not chunk:
                        continue
                    size += len(chunk)
                    if size > MAX_XLSX_BYTES:
                        raise YacangError("下载 XLSX", f"文件超过 {MAX_XLSX_BYTES} 字节")
                    md5.update(chunk)
                    handle.write(chunk)
            with temporary.open("rb") as handle:
                magic = handle.read(4)
            if size < 4 or magic != b"PK\x03\x04":
                raise YacangError("下载 XLSX", "文件不是有效的 XLSX/ZIP 数据")
            expected_md5 = str(response.headers.get("Content-MD5") or "").strip()
            actual_md5 = base64.b64encode(md5.digest()).decode("ascii")
            if expected_md5 and expected_md5 != actual_md5:
                raise YacangError("下载 XLSX", f"Content-MD5 校验失败: expected={expected_md5}, actual={actual_md5}")
            temporary.replace(destination)
        except Exception:
            temporary.unlink(missing_ok=True)
            raise


__all__ = ["YacangClient"]
