"""Internal, read-only recognition of a Vietnam SKU parameter workbook."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from services.vietnam_replenishment.sku_map_store import SkuMapStoreError, probe_sku_map
from services.yacang.errors import safe_remote_detail


def _failure(code: str, message: str) -> dict[str, Any]:
    return {"success": False, "error": {"code": code, "message": message}}


def run(arguments: dict[str, Any]) -> dict[str, Any]:
    """Return only a match flag; callers must verify attachment provenance first."""
    if set(arguments) != {"source_path"}:
        return _failure("invalid_arguments", "只接受 source_path")
    raw_path = arguments["source_path"]
    if not isinstance(raw_path, str) or not raw_path or not Path(raw_path).is_absolute():
        return _failure("invalid_arguments", "source_path 必须是绝对文件路径")
    source = Path(raw_path)
    try:
        matches = probe_sku_map(source)
    except Exception as exc:  # noqa: BLE001 — do not expose local paths or workbook values
        secrets = tuple(os.getenv(name, "") for name in ("LXE_YACANG_MOBILE", "LXE_YACANG_PASSWORD"))
        detail = safe_remote_detail(f"{type(exc).__name__}: {exc}", secrets=secrets, limit=2000)
        detail = detail.replace(raw_path, "[source_path]")
        if source.name:
            detail = detail.replace(source.name, "[source_path]")
        code = "sku_probe_error" if isinstance(exc, SkuMapStoreError) else type(exc).__name__
        return _failure(code, detail)
    return {"success": True, "matches": matches}


__all__ = ["run"]
