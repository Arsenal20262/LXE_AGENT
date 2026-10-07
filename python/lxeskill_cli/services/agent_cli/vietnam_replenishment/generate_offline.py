"""Generate one Vietnam recommendation from three existing local reports."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from services.vietnam_replenishment.workflow import generate_offline_vietnam_recommendation
from services.yacang.errors import safe_remote_detail
from shared.filesystem import display_path


def _failure(code: str, message: str) -> dict[str, Any]:
    return {"success": False, "status": "failed", "error": {"code": code, "message": message}}


def _detail(exc: BaseException, paths: list[str]) -> str:
    observed = f"{type(exc).__name__}: {exc}"
    for raw in paths:
        try:
            resolved = str(Path(raw).resolve(strict=False))
        except (OSError, RuntimeError):
            resolved = raw
        for value in (raw, resolved):
            observed = observed.replace(value, "[source_xlsx]")
    secrets = tuple(os.getenv(name, "") for name in ("LXE_YACANG_MOBILE", "LXE_YACANG_PASSWORD"))
    return safe_remote_detail(observed, secrets=secrets)


def run(arguments: dict[str, Any]) -> dict[str, Any]:
    """Validate at the business boundary even when called without the managed Tool."""
    if set(arguments) != {"source_xlsx"}:
        return _failure("invalid_arguments", "只接受 source_xlsx")
    paths = arguments["source_xlsx"]
    if (not isinstance(paths, list) or len(paths) != 3
            or any(not isinstance(path, str) or not path.strip() for path in paths)):
        return _failure("invalid_arguments", "source_xlsx 必须恰好包含三份 .xlsx 文件路径")

    try:
        result = generate_offline_vietnam_recommendation(paths)
        output = Path(result.output_xlsx).resolve(strict=True)
        if not output.is_file() or output.suffix.lower() != ".xlsx" or output.stat().st_size == 0:
            raise ValueError(f"最终 XLSX 无效: {output}")
    except Exception as exc:  # noqa: BLE001 — return the observed redacted failure
        return _failure(str(getattr(exc, "code", type(exc).__name__)), _detail(exc, paths))

    return {
        "success": True,
        "status": "completed",
        "warehouse": "VN8806",
        "sku_count": result.sku_count,
        "output_xlsx": str(display_path(output)),
        "config": {
            "weight_30d": str(result.config.weight_30d),
            "weight_15d": str(result.config.weight_15d),
            "weight_7d": str(result.config.weight_7d),
            "exchange_rate": str(result.config.exchange_rate),
        },
        "config_source": result.config_source,
    }
