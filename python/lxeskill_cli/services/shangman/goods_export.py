from __future__ import annotations

import json
import asyncio
import hashlib
import re
import tempfile
import threading
import time
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Protocol
from urllib.parse import urlsplit

import aiohttp
from openpyxl import load_workbook

from shared.infra.net import erp_http_session
from shared.workspace import artifact_root


BASE_URL = "https://erp.shangmanet.com"
CAPTCHA_PATH = "/api/blade-auth/oauth/captcha"
TOKEN_PATH = "/api/blade-auth/oauth/token"
GOODS_EXPORT_PATH = "/api/blade-goods/goods/merchant/exportNew"
DEFAULT_OUTPUT_DIR = artifact_root() / "shangman" / "indonesia"
SOURCE = "shangman_goods_export"
PLATFORM = "上马印尼"
_DEFAULT_ACCESS_TOKEN_TTL_SECONDS = 300.0

REQUIRED_BUSINESS_HEADERS = (
    "SKU",
    "商品名",
    "总数量",
    "有效库存",
    "锁定库存",
    "在途库存",
    "预警库存",
    "7天销量",
    "15天销量",
    "30天销量",
    "仓库名称",
    "创建时间",
)


class CaptchaCodeProvider(Protocol):
    async def get_code(self, image: str, *, captcha_key: str = "") -> str:
        """Return captcha text supplied by the caller for the displayed image."""


@dataclass(frozen=True)
class StaticCaptchaCodeProvider:
    code: str

    async def get_code(self, image: str, *, captcha_key: str = "") -> str:
        del image
        del captcha_key
        return self.code


@dataclass(frozen=True)
class ShangmanCredentials:
    """Processed values supplied by the runtime; this client never persists them."""

    tenant_id: str
    username: str
    processed_password: str
    basic_auth: str


class ShangmanError(RuntimeError):
    pass


class ShangmanHttpError(ShangmanError):
    pass


class ShangmanAuthError(ShangmanError):
    pass


class ShangmanCaptchaError(ShangmanAuthError):
    """A recoverable captcha interaction state, not an ERP failure."""


class CaptchaInputRequired(ShangmanCaptchaError):
    def __init__(self, challenge_id: str) -> None:
        super().__init__("captcha input is required")
        self.challenge_id = challenge_id


class CaptchaInputPending(ShangmanCaptchaError):
    def __init__(self, challenge_id: str) -> None:
        super().__init__("captcha input is still pending")
        self.challenge_id = challenge_id


class CaptchaInputExpired(ShangmanCaptchaError):
    def __init__(self, challenge_id: str) -> None:
        super().__init__("captcha input expired")
        self.challenge_id = challenge_id


class CaptchaChannelUnavailable(ShangmanCaptchaError):
    pass


class ShangmanBusinessError(ShangmanError):
    pass


class ShangmanDownloadUrlError(ShangmanBusinessError):
    pass


class GoodsExportWorkbookError(ShangmanBusinessError):
    pass


@dataclass(frozen=True)
class ShangmanExportResult:
    artifact_path: str
    filename: str
    sheet_names: list[str]
    row_count: int
    headers: list[str]
    download_host: str
    platform: str = PLATFORM
    source: str = SOURCE

    def to_payload(self) -> dict[str, Any]:
        return {
            "platform": self.platform,
            "source": self.source,
            "artifact_path": self.artifact_path,
            "filename": self.filename,
            "sheet_names": list(self.sheet_names),
            "row_count": self.row_count,
            "headers": list(self.headers),
            "download_host": self.download_host,
        }


@dataclass(frozen=True)
class _CachedAccessToken:
    value: str
    expires_at: float
    session: object


class _ShangmanAuthCache:
    """Process-local auth cache; tokens never enter settings, files, or logs."""

    def __init__(self) -> None:
        self._entries: dict[str, _CachedAccessToken] = {}
        self._lock = threading.Lock()

    def get(self, key: str, session: object) -> str | None:
        now = time.monotonic()
        with self._lock:
            entry = self._entries.get(key)
            if entry is None or entry.session is not session:
                if entry is not None:
                    self._entries.pop(key, None)
                return None
            if entry.expires_at <= now:
                self._entries.pop(key, None)
                return None
            return entry.value

    def put(self, key: str, value: str, ttl_seconds: float, session: object) -> None:
        with self._lock:
            self._entries[key] = _CachedAccessToken(
                value=value,
                expires_at=time.monotonic() + max(1.0, ttl_seconds),
                session=session,
            )

    def invalidate(self, key: str, value: str) -> None:
        with self._lock:
            entry = self._entries.get(key)
            if entry is not None and entry.value == value:
                self._entries.pop(key, None)


_AUTH_CACHE = _ShangmanAuthCache()
_AUTH_LOGIN_LOCK = threading.Lock()


def _normalize_header(value: Any) -> str:
    compact = re.sub(r"\s+", "", str(value or "")).strip()
    translated = re.search(r"\(([^()]*)\)$", compact)
    if translated:
        chinese_label = translated.group(1)
        return {"商品编码": "SKU", "商品名称": "商品名"}.get(chinese_label, chinese_label)
    return compact


def _redact(text: str, sensitive_values: tuple[str, ...]) -> str:
    result = str(text or "")
    for value in sensitive_values:
        if value:
            result = result.replace(value, "<redacted>")
    result = re.sub(
        r"(?i)(authorization|blade-auth|password|access_token|token|captcha[-_](?:key|code))"
        r"\s*[:=]\s*[\"']?[^,\s\"'}]+",
        r"\1=<redacted>",
        result,
    )
    return result[:300]


def _response_message(payload: dict[str, Any], fallback: str) -> str:
    for field in ("message", "msg", "error", "error_description"):
        value = payload.get(field)
        if value:
            return str(value)
    return fallback


class ShangmanClient:
    def __init__(
        self,
        *,
        credentials: ShangmanCredentials,
        captcha_provider: CaptchaCodeProvider,
        session: Any | None = None,
        base_url: str = BASE_URL,
        output_dir: str | Path | None = None,
        trusted_download_hosts: set[str] | frozenset[str] | None = None,
    ) -> None:
        self.credentials = credentials
        self.captcha_provider = captcha_provider
        self.session = session or erp_http_session
        self.base_url = base_url.rstrip("/")
        self.output_dir = Path(output_dir) if output_dir is not None else DEFAULT_OUTPUT_DIR
        default_host = str(urlsplit(self.base_url).hostname or "").lower()
        self.trusted_download_hosts = {
            str(host).strip().lower()
            for host in (trusted_download_hosts or {default_host, "oss.erp.shangmanet.com"})
            if str(host).strip()
        }

    @property
    def _effective_password(self) -> str:
        password = str(self.credentials.processed_password or "").strip()
        if re.fullmatch(r"[0-9a-f]{32}", password, flags=re.IGNORECASE):
            return password.lower()
        return hashlib.md5(password.encode("utf-8"), usedforsecurity=False).hexdigest()

    @property
    def _sensitive_values(self) -> tuple[str, ...]:
        credentials = self.credentials
        return (
            credentials.tenant_id,
            credentials.username,
            credentials.processed_password,
            self._effective_password,
            credentials.basic_auth,
            credentials.basic_auth,
        )

    def _url(self, path: str) -> str:
        return f"{self.base_url}{path}"

    async def _json_response(self, response: Any, *, action: str) -> dict[str, Any]:
        status = int(getattr(response, "status", 0) or 0)
        text = await response.text()
        if status < 200 or status >= 300:
            message = _redact(text, self._sensitive_values) or "empty response"
            error_type = ShangmanAuthError if status in {401, 403} else ShangmanHttpError
            raise error_type(f"{action} request failed (status={status}): {message}")
        try:
            payload = json.loads(text) if text else {}
        except json.JSONDecodeError as exc:
            message = _redact(text, self._sensitive_values) or "empty response"
            raise ShangmanBusinessError(f"{action} returned invalid JSON: {message}") from exc
        if not isinstance(payload, dict):
            raise ShangmanBusinessError(f"{action} returned a non-object JSON value")
        return payload

    def _auth_cache_key(self) -> str:
        credentials = self.credentials
        material = "\x00".join((
            str(id(self.session)),
            self.base_url,
            credentials.tenant_id,
            credentials.username,
            self._effective_password,
            credentials.basic_auth,
        ))
        return hashlib.sha256(material.encode("utf-8")).hexdigest()

    async def _login(self, *, force: bool = False) -> str:
        cache_key = self._auth_cache_key()
        if not force:
            cached = _AUTH_CACHE.get(cache_key, self.session)
            if cached:
                return cached

        # asyncio.run creates a new event loop for each CLI invocation. A
        # process-level threading lock keeps the single-flight guarantee
        # across those loops without binding an asyncio.Lock to one loop.
        await asyncio.to_thread(_AUTH_LOGIN_LOCK.acquire)
        try:
            if not force:
                cached = _AUTH_CACHE.get(cache_key, self.session)
                if cached:
                    return cached
            access_token, ttl_seconds = await self._login_uncached()
            _AUTH_CACHE.put(cache_key, access_token, ttl_seconds, self.session)
            return access_token
        finally:
            _AUTH_LOGIN_LOCK.release()

    async def _login_uncached(self) -> tuple[str, float]:
        captcha_key = ""
        captcha_code = ""
        resume = getattr(self.captcha_provider, "resume", None)
        try:
            resumed = await resume() if callable(resume) else None
            if resumed:
                captcha_key, captcha_code = resumed
            else:
                captcha_url = self._url(CAPTCHA_PATH)
                async with self.session.get(captcha_url) as response:
                    captcha = await self._json_response(response, action="captcha")
                captcha_key = str(captcha.get("key") or "").strip()
                captcha_image = str(captcha.get("image") or "").strip()
                if not captcha_key or not captcha_image:
                    message = _redact(_response_message(captcha, "missing captcha key or image"), self._sensitive_values)
                    raise ShangmanAuthError(f"captcha response incomplete: {message}")
                captcha_code = str(await self.captcha_provider.get_code(captcha_image, captcha_key=captcha_key) or "").strip()
        except ShangmanCaptchaError:
            raise
        except Exception as exc:
            message = _redact(str(exc), self._sensitive_values)
            raise ShangmanAuthError(f"captcha provider failed: {message}") from exc
        if not captcha_code:
            raise ShangmanAuthError("captcha provider returned empty code")

        credentials = self.credentials
        params = {
            "tenantId": credentials.tenant_id,
            "username": credentials.username,
            "password": self._effective_password,
            "grant_type": "captcha",
            "scope": "all",
            "type": "account",
        }
        headers = {
            "Captcha-Key": captcha_key,
            "Captcha-Code": captcha_code,
            "Tenant-Id": credentials.tenant_id,
            "Authorization": credentials.basic_auth,
        }
        async with self.session.post(
            self._url(TOKEN_PATH),
            params=params,
            headers=headers,
        ) as response:
            token_payload = await self._json_response(response, action="login")
        access_token = str(token_payload.get("access_token") or "").strip()
        if not access_token:
            message = _redact(_response_message(token_payload, "missing access_token"), self._sensitive_values)
            raise ShangmanAuthError(f"login response incomplete: {message}")
        try:
            ttl_seconds = float(token_payload.get("expires_in", _DEFAULT_ACCESS_TOKEN_TTL_SECONDS))
        except (TypeError, ValueError):
            ttl_seconds = _DEFAULT_ACCESS_TOKEN_TTL_SECONDS
        if ttl_seconds <= 0:
            ttl_seconds = _DEFAULT_ACCESS_TOKEN_TTL_SECONDS
        return access_token, ttl_seconds

    def _validate_download_url(self, raw_url: Any) -> tuple[str, str]:
        url = str(raw_url or "").strip()
        parsed = urlsplit(url)
        host = str(parsed.hostname or "").lower()
        if parsed.scheme.lower() != "https" or not host or host not in self.trusted_download_hosts:
            raise ShangmanDownloadUrlError(
                "export download URL must use trusted https"
            )
        if parsed.username or parsed.password:
            raise ShangmanDownloadUrlError("export returned a download URL containing credentials")
        return url, host

    @staticmethod
    def _row_values(row: tuple[Any, ...]) -> list[Any]:
        return list(row)

    def _validate_workbook(self, path: Path) -> tuple[list[str], int, list[str]]:
        try:
            workbook = load_workbook(path, read_only=True, data_only=True)
        except Exception as exc:
            message = _redact(str(exc), self._sensitive_values)
            raise GoodsExportWorkbookError(f"downloaded file is not a readable XLSX: {message}") from exc

        try:
            for worksheet in workbook.worksheets:
                # The source ERP may write an incorrect <dimension>. Force a
                # scan of worksheet XML before iterating rows so validation is
                # based on actual cells rather than max_row/max_column alone.
                worksheet.reset_dimensions()
                worksheet.calculate_dimension(force=True)
                header_row_index: int | None = None
                headers: list[str] = []
                row_count = 0
                for row_index, raw_row in enumerate(worksheet.iter_rows(values_only=True), start=1):
                    row = self._row_values(raw_row)
                    normalized = {_normalize_header(value) for value in row}
                    if header_row_index is None:
                        if set(REQUIRED_BUSINESS_HEADERS).issubset(normalized):
                            header_row_index = row_index
                            headers = [str(value).strip() if value is not None else "" for value in row]
                        continue
                    if any(value not in (None, "") for value in row):
                        row_count += 1
                if header_row_index is not None:
                    return list(worksheet.parent.sheetnames), row_count, headers
        finally:
            workbook.close()

        raise GoodsExportWorkbookError(
            "downloaded workbook is readable but has no required business headers"
        )

    async def _request_goods_export(self, access_token: str) -> dict[str, Any]:
        credentials = self.credentials
        headers = {
            "Blade-Auth": f"bearer {access_token}",
            "Tenant-Id": credentials.tenant_id,
            "Authorization": credentials.basic_auth,
        }
        async with self.session.post(
            self._url(GOODS_EXPORT_PATH),
            headers=headers,
        ) as response:
            return await self._json_response(response, action="goods export")

    async def export_goods(self) -> ShangmanExportResult:
        access_token = await self._login()
        credentials = self.credentials
        try:
            export_payload = await self._request_goods_export(access_token)
        except ShangmanAuthError:
            # A server-side token rejection is the only point where a cached
            # token is discarded. Retry login once; never loop indefinitely.
            _AUTH_CACHE.invalidate(self._auth_cache_key(), access_token)
            access_token = await self._login(force=True)
            export_payload = await self._request_goods_export(access_token)
        headers = {
            "Blade-Auth": f"bearer {access_token}",
            "Tenant-Id": credentials.tenant_id,
            "Authorization": credentials.basic_auth,
        }
        try:
            response_code = int(export_payload.get("code"))
        except (TypeError, ValueError):
            response_code = 0
        if response_code != 200 or export_payload.get("success") is not True:
            message = _redact(_response_message(export_payload, "export response was not successful"), self._sensitive_values)
            raise ShangmanBusinessError(f"goods export failed (code={response_code}): {message}")
        download_url, download_host = self._validate_download_url(export_payload.get("data"))

        download_options: dict[str, Any] = {"allow_redirects": False}
        if download_host == urlsplit(self.base_url).hostname:
            download_options.update(headers=headers)
        async with self.session.get(download_url, **download_options) as response:
            status = int(getattr(response, "status", 0) or 0)
            body = await response.read()
            if status < 200 or status >= 300:
                message = _redact(body.decode("utf-8", errors="replace"), self._sensitive_values)
                raise ShangmanHttpError(
                    f"goods download request failed (status={status}): {message or 'empty response'}"
                )

        self.output_dir.mkdir(parents=True, exist_ok=True)
        filename = f"上马印尼-商品-{datetime.now().strftime('%Y%m%d-%H%M%S')}.xlsx"
        artifact_path = self.output_dir / filename
        temporary_path: Path | None = None
        try:
            with tempfile.NamedTemporaryFile(
                mode="wb",
                dir=self.output_dir,
                prefix=f".{filename}.",
                suffix=".xlsx",
                delete=False,
            ) as temporary:
                temporary.write(body)
                temporary_path = Path(temporary.name)
            sheet_names, row_count, workbook_headers = self._validate_workbook(temporary_path)
            temporary_path.replace(artifact_path)
        except GoodsExportWorkbookError:
            if temporary_path is not None:
                temporary_path.unlink(missing_ok=True)
            raise
        except Exception as exc:
            if temporary_path is not None:
                temporary_path.unlink(missing_ok=True)
            message = _redact(str(exc), self._sensitive_values)
            raise GoodsExportWorkbookError(f"failed to store validated XLSX: {message}") from exc

        return ShangmanExportResult(
            artifact_path=str(artifact_path.resolve()),
            filename=filename,
            sheet_names=sheet_names,
            row_count=row_count,
            headers=workbook_headers,
            download_host=download_host,
        )


__all__ = [
    "CaptchaCodeProvider",
    "CaptchaChannelUnavailable",
    "CaptchaInputExpired",
    "CaptchaInputPending",
    "CaptchaInputRequired",
    "GoodsExportWorkbookError",
    "ShangmanAuthError",
    "ShangmanBusinessError",
    "ShangmanCaptchaError",
    "ShangmanClient",
    "ShangmanCredentials",
    "ShangmanDownloadUrlError",
    "ShangmanError",
    "ShangmanExportResult",
    "ShangmanHttpError",
    "StaticCaptchaCodeProvider",
]
