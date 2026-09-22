"""Shangman HTTP authentication; deliberately independent of business exports."""
from __future__ import annotations

import base64
import hashlib
import io
import json
import math
import os
import re
from dataclasses import dataclass, field
from typing import Any

import aiohttp
from PIL import Image

BASE_URL = "https://erp.shangmanet.com"
ENV_FIELDS = ("TENANT_ID", "USERNAME", "PROCESSED_PASSWORD", "BASIC_AUTH")


class AuthError(RuntimeError):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


@dataclass(frozen=True, repr=False)
class Credentials:
    tenant_id: str
    username: str
    password: str
    basic_auth: str
    revision: str = ""

    @classmethod
    def from_environment(cls) -> Credentials:
        values = [os.getenv(f"LXE_SHANGMAN_{key}", "").strip() for key in ENV_FIELDS]
        missing = [f"LXE_SHANGMAN_{key}" for key, value in zip(ENV_FIELDS, values) if not value]
        if missing:
            raise AuthError("credentials_required", "Missing runtime credentials: " + ", ".join(missing))
        return cls(*values, revision=os.getenv("LXE_SHANGMAN_CONFIG_REVISION", ""))

    @property
    def effective_password(self) -> str:
        if re.fullmatch(r"[a-fA-F0-9]{32}", self.password):
            return self.password.lower()
        return hashlib.md5(self.password.encode(), usedforsecurity=False).hexdigest()

    @property
    def account_id(self) -> str:
        return hashlib.sha256(json.dumps([BASE_URL, self.tenant_id, self.username]).encode()).hexdigest()

    @property
    def fingerprint(self) -> str:
        return hashlib.sha256(json.dumps([self.account_id, self.effective_password, self.basic_auth, self.revision]).encode()).hexdigest()

    def diagnostic(self, error: Any, *extra: str) -> str:
        message = str(error)
        # Include URL-encoded values because aiohttp exceptions can contain request URLs.
        from urllib.parse import quote, quote_plus
        for value in sorted((self.tenant_id, self.username, self.password, self.effective_password, self.basic_auth, *extra), key=len, reverse=True):
            if value:
                for form in (value, quote(value, safe=""), quote_plus(value)):
                    message = message.replace(form, "<redacted>")
        message = re.sub(r'''(?i)([\w-]*(?:token|password|authorization|blade-auth|captcha[-_](?:key|code))[\w-]*["']?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;&}]+)''', r'\1<redacted>', message)
        return message if len(message) <= 2000 else message[:2000] + " … [truncated]"


@dataclass(repr=False)
class LoginToken:
    value: str = field(repr=False)
    ttl: float = 300


class AuthClient:
    def __init__(self, credentials: Credentials):
        self.credentials = credentials

    async def _request(self, method: str, path: str, *, sensitive: tuple[str, ...] = (), **kwargs: Any) -> dict:
        c = self.credentials
        try:
            # Own short-lived session, no ambient cookies, redirects or automatic retries.
            async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=30), cookie_jar=aiohttp.DummyCookieJar()) as session:
                async with session.request(method, BASE_URL + path, allow_redirects=False, **kwargs) as response:
                    chunks = bytearray()
                    async for chunk in response.content.iter_chunked(65536):
                        chunks.extend(chunk)
                        if len(chunks) > 2 * 1024 * 1024:
                            break
                    raw = bytes(chunks)
                    if len(raw) > 2 * 1024 * 1024:
                        raise AuthError("invalid_response", f"{path}: response exceeds 2 MiB: {raw[:2000].decode(errors='replace')} [truncated]")
                    body = raw.decode("utf-8", errors="replace")
                    if not 200 <= response.status < 300:
                        raise AuthError("http_error", f"{path}: HTTP {response.status}: {body or '[empty response]'}")
                    try:
                        payload = json.loads(body)
                    except ValueError as exc:
                        raise AuthError("invalid_response", f"{path}: {exc}: {body or '[empty response]'}") from exc
                    if not isinstance(payload, dict):
                        raise AuthError("invalid_response", f"{path}: expected object, received {body}")
                    return payload
        except Exception as exc:
            raise AuthError(getattr(exc, "code", "network_error"), c.diagnostic(f"{type(exc).__name__}: {exc}", *sensitive)) from None

    async def captcha(self) -> tuple[str, bytes]:
        payload = await self._request("GET", "/api/blade-auth/oauth/captcha")
        key, image = payload.get("key"), payload.get("image")
        if not isinstance(key, str) or not key.strip() or not isinstance(image, str) or not image:
            raise AuthError("invalid_response", self.credentials.diagnostic(f"Captcha response missing key/image: {json.dumps(payload, ensure_ascii=False)}", str(key or ""), str(image or "")))
        try:
            encoded = image.split(",", 1)[1] if image.startswith("data:image/") else image
            data = base64.b64decode(encoded, validate=True)
            with Image.open(io.BytesIO(data)) as source:
                if source.width * source.height > 4_000_000:
                    raise ValueError("Captcha image exceeds 4 million pixels")
                source.load()
                target = io.BytesIO()
                source.convert("RGB").save(target, format="PNG")
            return key, target.getvalue()
        except Exception as exc:
            raise AuthError("invalid_image", self.credentials.diagnostic(f"{type(exc).__name__}: {exc}", key)) from None

    async def login(self, key: str, code: str) -> LoginToken:
        c = self.credentials
        payload = await self._request("POST", "/api/blade-auth/oauth/token", sensitive=(key, code), params={
            "tenantId": c.tenant_id, "username": c.username, "password": c.effective_password,
            "grant_type": "captcha", "scope": "all", "type": "account",
        }, headers={"Captcha-Key": key, "Captcha-Code": code, "Tenant-Id": c.tenant_id, "Authorization": c.basic_auth})
        token = payload.get("access_token")
        if not isinstance(token, str) or not token.strip():
            raise AuthError("login_failed", c.diagnostic(f"Login response missing access_token: {json.dumps(payload, ensure_ascii=False)}", key, code))
        try:
            ttl = float(payload.get("expires_in", 300))
        except (TypeError, ValueError):
            ttl = 300
        return LoginToken(token, ttl if math.isfinite(ttl) and ttl > 0 else 300)
