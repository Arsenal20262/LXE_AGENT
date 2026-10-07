"""Bind a chat-attached Vietnam SKU workbook to the trusted current version."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from services.vietnam_replenishment.sku_map_store import (
    SkuMapStoreError,
    inspect_sku_map,
    install_sku_map,
)
from services.yacang.errors import safe_remote_detail


def _failure(code: str, message: str) -> dict[str, Any]:
    return {"success": False, "error": {"code": code, "message": message}}


def _detail(exc: BaseException) -> str:
    secrets = tuple(os.getenv(name, "") for name in ("LXE_YACANG_MOBILE", "LXE_YACANG_PASSWORD"))
    return safe_remote_detail(f"{type(exc).__name__}: {exc}", secrets=secrets, limit=2000)


def run(arguments: dict[str, Any]) -> dict[str, Any]:
    """Install exactly one local XLSX without exporting Yacang data or generating a report."""
    if set(arguments) != {"source_path"}:
        return _failure("invalid_arguments", "只接受 source_path")
    raw_path = arguments["source_path"]
    if not isinstance(raw_path, str) or not raw_path or not Path(raw_path).is_absolute():
        return _failure("invalid_arguments", "source_path 必须是绝对文件路径")
    source = Path(raw_path)
    if source.suffix.lower() != ".xlsx":
        return _failure("invalid_arguments", "source_path 必须是 .xlsx 文件")

    try:
        status = inspect_sku_map()
        if status.manifest_error:
            raise SkuMapStoreError(status.manifest_error)
        mutation = install_sku_map(source, status.revision)
    except Exception as exc:  # noqa: BLE001 — expose the observed, redacted failure
        code = "sku_map_store_error" if isinstance(exc, SkuMapStoreError) else type(exc).__name__
        return _failure(code, _detail(exc))

    return {
        "success": True,
        "status": mutation.status,
        "manifest_revision": mutation.manifest_revision,
    }


__all__ = ["run"]
