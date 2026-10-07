"""Collect one online VN8806 Yacang export run, then use local parsing."""

from __future__ import annotations

from typing import Mapping

from services.yacang import workflow as yacang_workflow

from .source_parser import (
    VIETNAM_REPORTS, VietnamSourceError, VietnamSources, load_vietnam_sources,
)


def export_vietnam_sources() -> VietnamSources:
    """Use the existing Yacang workflow for one three-report VN8806 run."""
    result = yacang_workflow.run({
        "params": {"reports": list(VIETNAM_REPORTS), "warehouses": ["VN8806"]},
    })
    if not isinstance(result, Mapping):
        raise VietnamSourceError(f"雅仓导出返回非对象结果: {type(result).__name__}")
    if result.get("success") is not True or result.get("status") != "completed":
        error = result.get("error")
        detail = error.get("message") if isinstance(error, Mapping) else None
        if not detail:
            detail = f"返回状态 {result.get('status')!r}，没有错误诊断"
        raise VietnamSourceError(f"雅仓三类导出未完成: {detail}")
    return load_vietnam_sources(result.get("artifacts"))


__all__ = [
    "VietnamSourceError", "VietnamSources", "load_vietnam_sources",
    "export_vietnam_sources",
]
