from __future__ import annotations

import contextlib
import os
from pathlib import Path
import re
from typing import Any
from uuid import uuid4

from services.zhihui_tms.client import ZhihuiTmsClient
from services.zhihui_tms.errors import redact_text
from services.zhihui_tms.planner import plan_product_export
from services.zhihui_tms.product_export import export_stockwarehouse_pages
from services.zhihui_tms.xlsx_delivery import deliver_product_exports
from shared.process_lock import InterProcessLockTimeout, interprocess_lock
from shared.workspace import artifact_root


def _existing_pages(output_dir: Path, date_label: str) -> list[dict[str, Any]]:
    if not output_dir.is_dir():
        return []
    pages: list[dict[str, Any]] = []
    candidates: list[tuple[int, Path]] = []
    pattern = re.compile(rf"^智慧tms-商品-第(\d+)页-{date_label}\.xlsx$")
    for path in output_dir.glob(f"智慧tms-商品-第*页-{date_label}.xlsx"):
        match = pattern.fullmatch(path.name)
        if match and path.is_file():
            candidates.append((int(match.group(1)), path))
    for page, path in sorted(candidates):
        if path.is_file():
            pages.append({"path": str(path.resolve()), "kind": "page", "page": page, "total_pages": None})
    return pages


def run(arguments: dict[str, Any]) -> dict[str, Any]:
    """Catalog entrypoint; credentials are process environment only."""
    try:
        plan = plan_product_export(arguments)
    except (TypeError, ValueError) as exc:
        return {"success": False, "code": "tms_plan_invalid", "exception": str(exc), "artifacts": []}

    summary: dict[str, Any] = {
        "action": plan.action,
        "warehouse": plan.intent.warehouse,
        "export_kind": plan.intent.kind,
        "historical_metrics_available": plan.intent.historical_metrics_available,
        "date_label": plan.date_label,
        "page_size": plan.page_size,
        "max_pages": plan.max_pages,
        "max_records": plan.max_records,
        "max_requests": plan.max_requests,
        "max_runtime_seconds": plan.max_runtime,
        "artifacts": [],
    }
    if plan.action == "preview":
        return {"success": True, **summary}

    if os.environ.get("ZHIHUI_TMS_PRODUCTION_ENABLED") != "1":
        return {
            "success": False,
            "code": "tms_production_disabled",
            "exception": "智汇 TMS 生产调用开关未启用",
            **summary,
        }
    account = os.environ.get("ZHIHUI_TMS_ACCOUNT", "").strip()
    password = os.environ.get("ZHIHUI_TMS_PASSWORD", "")
    if not account or not password:
        return {
            "success": False,
            "code": "tms_credentials_missing",
            "exception": "智汇 TMS 运行时账号或密码未配置",
            **summary,
        }

    output_dir = artifact_root() / "zhihui_tms" / uuid4().hex
    client: Any = None
    try:
        with interprocess_lock(artifact_root() / "zhihui_tms" / ".run.lock", timeout_seconds=0):
            client = ZhihuiTmsClient()
            client.login(account, password)
            export_result = export_stockwarehouse_pages(
                client,
                max_pages=plan.max_pages,
                max_records=plan.max_records,
                max_requests=plan.max_requests,
                max_runtime=plan.max_runtime,
            )
            delivery = deliver_product_exports(
                client,
                export_result,
                output_dir=output_dir,
                date_label=plan.date_label,
            )
            artifacts = [
                {"path": item.path, "kind": item.kind, "page": item.page, "total_pages": item.total_pages}
                for item in delivery.artifacts
            ]
            return {
                "success": True,
                **summary,
                "artifacts": artifacts,
                "total_records": export_result.total_records,
                "request_count": export_result.request_count,
                "total_rows": delivery.total_rows,
            }
    except InterProcessLockTimeout:
        return {
            "success": False,
            **summary,
            "code": "tms_export_busy",
            "exception": "智汇 TMS 商品导出正在执行，请等待当前任务结束",
        }
    except Exception as exc:  # noqa: BLE001 — the CLI must return the observed redacted failure
        return {
            "success": False,
            **summary,
            "code": getattr(exc, "code", "tms_export_failed"),
            "exception": redact_text(f"{type(exc).__name__}: {exc}", secrets=(account, password)),
            "artifacts": _existing_pages(output_dir, plan.date_label),
        }
    finally:
        session = getattr(client, "session", None)
        close = getattr(session, "close", None)
        if callable(close):
            with contextlib.suppress(Exception):
                close()


__all__ = ["run"]
