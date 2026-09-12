from __future__ import annotations

import json
from typing import Any


_SENSITIVE_KEYS = {
    "authorization",
    "captcha",
    "cookie",
    "key",
    "password",
    "path",
    "php_sess_id",
    "phpsessid",
    "token",
    "verify_code",
    "url",
}


def safe_remote_detail(value: Any, *, limit: int = 800) -> str:
    """Keep the real remote error shape while removing credentials and huge bodies."""

    def redact(item: Any) -> Any:
        if isinstance(item, dict):
            return {
                str(name): "[REDACTED]" if str(name).lower() in _SENSITIVE_KEYS else redact(child)
                for name, child in item.items()
            }
        if isinstance(item, list):
            return [redact(child) for child in item[:20]]
        if isinstance(item, str) and item.startswith("data:image/"):
            return "[REDACTED_DATA_IMAGE]"
        return item

    if isinstance(value, (dict, list)):
        text = json.dumps(redact(value), ensure_ascii=False, separators=(",", ":"))
    else:
        text = str(value or "").strip()
    return text if len(text) <= limit else f"{text[:limit]}...[truncated]"


class YacangError(RuntimeError):
    """A factual, already-sanitized Yacang workflow failure."""

    def __init__(self, stage: str, message: str) -> None:
        self.stage = stage
        super().__init__(f"雅仓 {stage} 失败: {message}")


__all__ = ["YacangError", "safe_remote_detail"]
