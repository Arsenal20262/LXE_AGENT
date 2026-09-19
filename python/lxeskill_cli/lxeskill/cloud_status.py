"""Read-only native cloud diagnostics, independent of desktop credentials."""
from __future__ import annotations

import json
import os
import re
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener

MAX_RESPONSE_BYTES = 1024 * 1024
MAX_DIAGNOSTIC_CHARS = 4000
TIMEOUT_SECONDS = 15
CONTEXT_PATH = "/api/v1/device-context"
MABANG_PATH = "/api/v1/data-sources/mabang/apis"
SENSITIVE = re.compile(r"authorization|cookie|password|secret|token|api.?key", re.I)


class NoRedirects(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def _redact(value):
    if isinstance(value, dict):
        return {key: "[REDACTED]" if SENSITIVE.search(str(key)) else _redact(item)
                for key, item in value.items()}
    if isinstance(value, list):
        return [_redact(item) for item in value]
    if not isinstance(value, str):
        return value
    for name, secret in os.environ.items():
        if SENSITIVE.search(name) and len(secret) >= 6:
            value = value.replace(secret, "[REDACTED]")
    value = re.sub(r"(?i)\bBearer\s+[A-Za-z0-9._~+/=-]+", "Bearer [REDACTED]", value)
    value = re.sub(r"\blxe_(?:client|identity|dev|run|erp_run|session|erp_session|handoff|erp_handoff)_[A-Za-z0-9._-]+", "[REDACTED]", value)
    return re.sub(r'''(?i)((?:authorization|cookie|password|secret|token|api[_-]?key)["']?\s*[:=]\s*)["']?[^\s,;}"']+''', r"\1[REDACTED]", value)


def _diagnostic(value, truncated=False):
    safe = _redact(value)
    text = safe if isinstance(safe, str) else json.dumps(safe, ensure_ascii=False)
    if len(text) > MAX_DIAGNOSTIC_CHARS:
        text = text[:MAX_DIAGNOSTIC_CHARS]
        truncated = True
    if truncated:
        text += " ... [truncated]"
    return text


def _server_url(arguments):
    if not arguments:
        value = os.getenv("LXE_DATA_SERVER_URL", "").strip()
    elif len(arguments) == 2 and arguments[0] == "--server":
        value = arguments[1].strip()
    else:
        raise ValueError("Usage: lxeskill cloud-status [--server <http(s)://host:port>]")
    if not value:
        raise ValueError("Set LXE_DATA_SERVER_URL or pass --server")
    url = urlsplit(value)
    if (url.scheme not in {"http", "https"} or not url.hostname or url.username is not None
            or url.password is not None or url.path not in {"", "/"} or url.query or url.fragment
            or any(c.isspace() for c in value)):
        raise ValueError("Server must be an HTTP(S) origin without credentials, path, query or fragment")
    try:
        url.port
    except ValueError:
        raise ValueError("Server port is invalid") from None
    return value.rstrip("/")


def run_cloud_status(arguments):
    """Return the regular CLI result and exit code; never read desktop state."""
    result = {"type": "result", "command": "cloud-status", "ok": False, "data": {}, "files": []}
    if arguments in (["--help"], ["-h"]):
        result.update(ok=True, data={
            "usage": "lxeskill cloud-status [--server <http(s)://host:port>]",
            "description": "Query this device and verify Mabang access without business tokens or upstream calls.",
            "server_default": "LXE_DATA_SERVER_URL", "checks": [CONTEXT_PATH, MABANG_PATH],
        })
        return result, 0
    try:
        server = _server_url(arguments)
    except ValueError as exc:
        result["error"] = {"code": "invalid_arguments", "message": _diagnostic(str(exc))}
        return result, 2
    result["data"] = {"server_url": server, "checks": [], "upstream_queried": False}
    # No cookies, credential handlers, system/environment proxies, redirects or retries.
    opener = build_opener(ProxyHandler({}), NoRedirects())
    for name, path in (("device_context", CONTEXT_PATH), ("mabang_access", MABANG_PATH)):
        check = {"name": name, "path": path, "ok": False}
        result["data"]["checks"].append(check)
        started = time.monotonic()
        request = Request(server + path, headers={"X-LXE-Client": "cli", "Accept": "application/json"}, method="GET")
        try:
            try:
                response = opener.open(request, timeout=TIMEOUT_SECONDS)
            except HTTPError as exc:
                response = exc
            with response:
                check["http_status"] = response.code
                raw = response.read(MAX_RESPONSE_BYTES + 1)
            check["elapsed_ms"] = round((time.monotonic() - started) * 1000)
        except (URLError, OSError, ValueError) as exc:
            check["elapsed_ms"] = round((time.monotonic() - started) * 1000)
            result["error"] = {"code": "cloud_connection_failed", "stage": name,
                               "message": _diagnostic(f"{type(exc).__name__}: {exc}")}
            return result, 3
        truncated = len(raw) > MAX_RESPONSE_BYTES
        text = raw[:MAX_RESPONSE_BYTES].decode("utf-8", errors="replace")
        try:
            payload = json.loads(text)
        except ValueError:
            payload = text
        if not 200 <= check["http_status"] < 300:
            detail = payload.get("detail") if isinstance(payload, dict) else None
            code = detail.get("code") if isinstance(detail, dict) else None
            result["error"] = {"code": _diagnostic(code) if isinstance(code, str) else "cloud_http_error",
                               "stage": name, "http_status": check["http_status"],
                               "message": _diagnostic(payload, truncated)}
            return result, 4
        valid = isinstance(payload, dict) and not truncated
        if name == "device_context":
            valid = (valid and payload.get("response_schema") == "lxe.device-context.v1"
                     and isinstance(payload.get("device"), dict) and bool(payload["device"].get("id"))
                     and isinstance(payload.get("permission"), dict))
        else:
            valid = valid and payload.get("data_source") == "mabang" and isinstance(payload.get("apis"), list)
        if not valid:
            result["error"] = {"code": "cloud_invalid_response", "stage": name,
                               "message": "Unexpected response: " + _diagnostic(payload, truncated)}
            return result, 4
        check["ok"] = True
        if name == "device_context":
            result["data"]["device_context"] = _redact(payload)
        else:
            result["data"]["mabang_api_count"] = len(payload["apis"])
    result["ok"] = True
    return result, 0
