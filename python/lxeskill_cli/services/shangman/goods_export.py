"""Export one original Shangman ERP workbook using the existing persisted login."""
from __future__ import annotations

import asyncio
from datetime import datetime
import json
from pathlib import Path
import re
from typing import Any
from urllib.parse import urlsplit, urlunsplit
from uuid import uuid4
from zoneinfo import ZoneInfo

import aiohttp
from openpyxl import load_workbook

from shared.datasets import dataset_dir
from .auth import BASE_URL, AuthError, Credentials
from .state import AuthStore

EXPORT_PATH = "/api/blade-goods/goods/merchant/exportNew"
DOWNLOAD_HOSTS = frozenset({"erp.shangmanet.com", "oss.erp.shangmanet.com"})
REQUIRED_HEADERS = frozenset({
    "SKU", "商品名", "总数量", "有效库存", "锁定库存", "在途库存", "预警库存",
    "7天销量", "15天销量", "30天销量", "仓库名称", "创建时间",
})
_URL_PATTERN = re.compile(r"https?://[^\s\"'<>]+")
_JSON_LIMIT = 2 * 1024 * 1024


def _safe_urls(message: str) -> str:
    def clean(match: re.Match) -> str:
        try:
            parsed = urlsplit(match.group())
            return urlunsplit((parsed.scheme, parsed.hostname or "", parsed.path,
                               "[redacted]" if parsed.query else "", ""))
        except ValueError:
            return "[redacted URL]"
    return _URL_PATTERN.sub(clean, message)


def _header(value: Any) -> str:
    compact = re.sub(r"\s+", "", str(value or ""))
    translated = re.search(r"\(([^()]*)\)$", compact)
    label = translated.group(1) if translated else compact
    return {"商品编码": "SKU", "商品名称": "商品名"}.get(label, label)


def validate_workbook(path: Path) -> dict[str, Any]:
    try:
        workbook = load_workbook(path, read_only=True, data_only=True)
    except Exception as exc:
        raise AuthError("invalid_workbook", f"下载文件不是可读取的 XLSX: {type(exc).__name__}: {exc}") from exc
    try:
        observed = []
        for sheet in workbook.worksheets:
            # Some platform exports incorrectly declare only A1 in <dimension>.
            sheet.reset_dimensions()
            found = False
            count = 0
            headers = []
            for row in sheet.iter_rows(values_only=True):
                if not found:
                    normalized = {_header(value) for value in row}
                    if REQUIRED_HEADERS.issubset(normalized):
                        found = True
                        headers = [str(value).strip() if value is not None else "" for value in row]
                    elif len(observed) < 5:
                        observed.append([str(value)[:100] for value in row[:40] if value is not None])
                elif any(value not in (None, "") for value in row):
                    count += 1
            if found:
                return {"sheet_names": workbook.sheetnames, "data_sheet": sheet.title,
                        "row_count": count, "headers": headers}
        raise AuthError("invalid_workbook", f"下载工作簿缺少必需业务表头；读取到的前几行: {observed}")
    finally:
        workbook.close()


class GoodsExporter:
    def __init__(self, credentials: Credentials, store: AuthStore):
        self.credentials = credentials
        self.store = store

    def _validate_download_url(self, value: Any) -> str:
        url = value.strip() if isinstance(value, str) else ""
        try:
            parsed = urlsplit(url)
            valid = (parsed.scheme == "https" and parsed.hostname in DOWNLOAD_HOSTS
                     and parsed.port in (None, 443) and not parsed.username and not parsed.password
                     and not parsed.fragment and not any(ord(c) < 33 for c in url))
        except ValueError:
            valid = False
        if not valid:
            raise AuthError("invalid_download_url", f"导出返回的下载地址不符合 HTTPS 域名约束: {_safe_urls(str(value))}")
        return url

    def _reject_token(self, token: str, detail: str) -> None:
        self.store.invalidate(token)
        raise AuthError("login_required", detail)

    async def _body(self, response: aiohttp.ClientResponse) -> str:
        chunks = bytearray()
        async for chunk in response.content.iter_chunked(65536):
            chunks.extend(chunk)
            if len(chunks) > _JSON_LIMIT:
                raise AuthError("invalid_response", "ERP 响应超过 2 MiB: "
                                + bytes(chunks[:2000]).decode(errors="replace") + " [truncated]")
        return bytes(chunks).decode("utf-8", errors="replace")

    async def export(self) -> dict[str, Any]:
        # Read before creating a session: missing/expired login causes no ERP request.
        token = self.store.read_token()
        headers = {"Authorization": self.credentials.basic_auth,
                   "Blade-Auth": f"bearer {token}", "Tenant-Id": self.credentials.tenant_id}
        temporary: Path | None = None
        download_url = ""
        try:
            async with aiohttp.ClientSession(
                timeout=aiohttp.ClientTimeout(total=180), cookie_jar=aiohttp.DummyCookieJar(),
                trust_env=False,
            ) as session:
                async with session.post(BASE_URL + EXPORT_PATH, headers=headers, allow_redirects=False) as response:
                    raw = await self._body(response)
                    detail = f"商品导出 HTTP {response.status}: {raw or '[empty response]'}"
                    if response.status == 401:
                        self._reject_token(token, detail)
                    if not 200 <= response.status < 300:
                        raise AuthError("export_http_failed", detail)
                    try:
                        payload = json.loads(raw)
                    except ValueError as exc:
                        raise AuthError("invalid_response", f"商品导出 JSON 解析失败: {exc}: {raw or '[empty response]'}") from exc
                    if not isinstance(payload, dict):
                        raise AuthError("invalid_response", f"商品导出应返回对象: {raw}")
                    if str(payload.get("code")) == "401":
                        self._reject_token(token, detail)
                    if str(payload.get("code")) != "200" or payload.get("success") is not True:
                        raise AuthError("export_business_failed", detail)
                    download_url = self._validate_download_url(payload.get("data"))

                download_host = urlsplit(download_url).hostname
                authenticated_download = download_host == urlsplit(BASE_URL).hostname
                async with session.get(download_url, headers=headers if authenticated_download else {},
                                       allow_redirects=False) as response:
                    if not 200 <= response.status < 300:
                        raw = await self._body(response)
                        detail = f"商品文件下载 HTTP {response.status}: {raw or '[empty response]'}"
                        if response.status == 401 and authenticated_download:
                            self._reject_token(token, detail)
                        raise AuthError("download_failed", detail)
                    directory = dataset_dir("shangman_goods_export", uuid4().hex)
                    directory.mkdir(parents=True, exist_ok=False)
                    filename = f"上马-商品-{datetime.now(ZoneInfo('Asia/Shanghai')):%Y%m%d-%H%M%S}.xlsx"
                    target = directory / filename
                    temporary = directory / ".download.xlsx"
                    with temporary.open("wb") as output:
                        async for chunk in response.content.iter_chunked(65536):
                            output.write(chunk)
            metadata = validate_workbook(temporary)
            temporary.replace(target)
            return {"success": True, "status": "completed", "artifact_path": str(target.resolve()),
                    "filename": filename, "source": "shangman_goods_export", **metadata,
                    "notice": "原始报表包含完整表头，但没有商品数据行。" if metadata["row_count"] == 0 else ""}
        except Exception as exc:
            if temporary is not None:
                temporary.unlink(missing_ok=True)
            message = str(exc) if isinstance(exc, AuthError) else f"{type(exc).__name__}: {exc}"
            # Signed download queries and runtime tokens must not enter terminal output.
            message = _safe_urls(message)
            message = self.credentials.diagnostic(message, token, download_url)
            raise AuthError(getattr(exc, "code", "export_execution_failed"), message) from None


def run(arguments: dict[str, Any]) -> dict[str, Any]:
    credentials = None
    try:
        if arguments:
            raise AuthError("invalid_arguments", "上马 ERP 商品全量导出不接受筛选或凭据参数")
        credentials = Credentials.from_environment()
        return asyncio.run(GoodsExporter(credentials, AuthStore(credentials)).export())
    except Exception as exc:
        message = str(exc) if isinstance(exc, AuthError) else f"{type(exc).__name__}: {exc}"
        return {"success": False, "status": "failed", "error": {
            "code": getattr(exc, "code", "export_execution_failed"),
            "message": credentials.diagnostic(_safe_urls(message)) if credentials else _safe_urls(message),
        }}
