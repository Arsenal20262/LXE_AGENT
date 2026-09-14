from __future__ import annotations

from datetime import date
import inspect
import json
from pathlib import Path

import pytest

import services.yacang.export_executor as executor_module
from services.agent_cli.yacang.export_workflow import run as run_export_workflow_cli
from services.yacang.errors import YacangError
from services.yacang.export_executor import execute_export_plan
from services.yacang.export_intent import normalize_export_intent
from services.yacang.export_workflow import (
    ALL_DATA_TYPES as WORKFLOW_DATA_TYPES,
    EXPORT_PLAN_SCHEMA_VERSION,
    normalize_export_request,
    plan_export_workflow,
    run_export_workflow,
    sales_source_fetch_id,
)
from services.yacang.exports.sales_source import InventorySalesSourceBatch


FIXED_TODAY = lambda: date(2026, 9, 14)


def normalized(text: str) -> dict:
    return normalize_export_intent(text, today=FIXED_TODAY)


def test_workflow_compatibility_wrapper_returns_canonical_inventory_type() -> None:
    request = normalize_export_request("导出当前库存", today=FIXED_TODAY)

    assert WORKFLOW_DATA_TYPES == (
        "sales-monthly",
        "sales-90d",
        "inventory-current-snapshot",
        "inbound-listing-time",
    )
    assert request["data_types"] == ["inventory-current-snapshot"]


def test_plan_orders_tasks_scopes_parameters_and_shared_sales_sources() -> None:
    plan = plan_export_workflow(
        normalized("导出 MY8801、TH8802 的两种销量、当前库存和上架时间"),
        execution_date="2026-09-14",
    )

    assert [(task["data_type"], task.get("warehouse")) for task in plan["logical_tasks"]] == [
        ("sales-monthly", "MY8801"),
        ("sales-monthly", "TH8802"),
        ("sales-90d", "MY8801"),
        ("sales-90d", "TH8802"),
        ("inventory-current-snapshot", "MY8801"),
        ("inventory-current-snapshot", "TH8802"),
        ("inbound-listing-time", None),
    ]
    assert set(plan) == {
        "schema_version",
        "execution_date",
        "requires_clarification",
        "questions",
        "diagnostics",
        "logical_tasks",
        "source_fetches",
    }
    assert plan["schema_version"] == EXPORT_PLAN_SCHEMA_VERSION == "1"
    assert plan["execution_date"] == "2026-09-14"
    assert len(plan["source_fetches"]) == 2

    monthly_my = plan["logical_tasks"][0]
    daily_my = plan["logical_tasks"][2]
    assert monthly_my["source_fetch_id"] == daily_my["source_fetch_id"]
    assert monthly_my["effective_parameters"] == {
        "warehouse": "MY8801",
        "created_date_filter": {
            "mode": "default",
            "created_start_date": "2026-09-07",
            "created_end_date": "2026-09-14",
            "source": "system_default",
            "input_fragments": [],
            "normalization_rules": ["default_execution_day_minus_7"],
        },
    }
    assert plan["logical_tasks"][4]["effective_parameters"] == {"warehouse": "MY8801"}
    assert plan["logical_tasks"][4]["snapshot"] == "current"
    assert plan["logical_tasks"][6]["effective_parameters"] == {}
    assert "warehouse" not in plan["logical_tasks"][6]
    assert "created_date_filter" not in plan["logical_tasks"][6]
    assert plan["logical_tasks"][6]["warehouse_scope"] == "all"
    assert plan["source_fetches"][0]["source_fetch_id"] == sales_source_fetch_id(
        "MY8801", "2026-09-07", "2026-09-14"
    )


def test_ambiguous_intent_stops_before_planning_any_remote_source() -> None:
    plan = plan_export_workflow(normalized("导出库存动销"), execution_date="2026-09-14")

    assert plan["requires_clarification"] is True
    assert plan["questions"]
    assert plan["logical_tasks"] == []
    assert plan["source_fetches"] == []


def test_default_plan_splits_first_three_types_across_all_four_warehouses() -> None:
    plan = plan_export_workflow(normalized("导出雅仓数据"), execution_date="2026-09-14")

    assert [
        task["warehouse"]
        for task in plan["logical_tasks"]
        if task["data_type"] == "sales-monthly"
    ] == ["MY8801", "PH8805", "TH8802", "VN8806"]
    assert [
        task["warehouse"]
        for task in plan["logical_tasks"]
        if task["data_type"] == "sales-90d"
    ] == ["MY8801", "PH8805", "TH8802", "VN8806"]
    assert [
        task["warehouse"]
        for task in plan["logical_tasks"]
        if task["data_type"] == "inventory-current-snapshot"
    ] == ["MY8801", "PH8805", "TH8802", "VN8806"]
    assert len(plan["source_fetches"]) == 4


def test_unsupported_sales_window_keeps_diagnostic_without_creating_sales_task() -> None:
    plan = plan_export_workflow(normalized("导出56天销量"), execution_date="2026-09-14")

    assert plan["requires_clarification"] is False
    assert plan["logical_tasks"] == []
    assert plan["source_fetches"] == []
    assert plan["diagnostics"] == [
        {
            "kind": "unsupported",
            "code": "UNSUPPORTED_SALES_WINDOW",
            "requested_value": {"sales_window_days": 56},
            "message": "当前只支持 7/15/30 汇总销量和日度近 90 天销量",
        }
    ]


def test_historical_inventory_is_failed_locally_while_supported_sales_remain_planned() -> None:
    plan = plan_export_workflow(
        normalized("导出 MY8801 的上个月月底库存和月度销量"),
        execution_date="2026-09-14",
    )

    assert [(task["data_type"], task["status"]) for task in plan["logical_tasks"]] == [
        ("sales-monthly", "not_run"),
        ("inventory-current-snapshot", "failed"),
    ]
    inventory = plan["logical_tasks"][1]
    assert inventory["warehouse"] == "MY8801"
    assert inventory["error_code"] == "UNSUPPORTED_HISTORICAL_INVENTORY"
    assert len(plan["source_fetches"]) == 1
    assert plan["source_fetches"][0]["warehouse"] == "MY8801"


def test_inbound_listing_time_is_one_global_task_without_date_or_warehouse_parameters() -> None:
    plan = plan_export_workflow(normalized("导出什么时候上架"), execution_date="2026-09-14")

    assert plan["logical_tasks"] == [
        {
            "task_id": "inbound-listing-time:global",
            "data_type": "inbound-listing-time",
            "scope": "global",
            "warehouse_scope": "all",
            "status": "not_run",
            "effective_parameters": {},
        }
    ]
    assert plan["source_fetches"] == []


def test_current_inventory_is_per_warehouse_without_created_dates_or_sales_source() -> None:
    plan = plan_export_workflow(normalized("四个仓库还剩多少货"), execution_date="2026-09-14")

    assert [task["task_id"] for task in plan["logical_tasks"]] == [
        "inventory-current-snapshot:MY8801",
        "inventory-current-snapshot:PH8805",
        "inventory-current-snapshot:TH8802",
        "inventory-current-snapshot:VN8806",
    ]
    assert all(
        task["effective_parameters"] == {"warehouse": task["warehouse"]}
        for task in plan["logical_tasks"]
    )
    assert plan["source_fetches"] == []


def test_clarification_short_circuits_before_executor() -> None:
    def unexpected_executor(_plan: dict) -> dict:
        raise AssertionError("executor must not run while clarification is required")

    result = run_export_workflow(
        "导出库存动销",
        today=FIXED_TODAY,
        executor=unexpected_executor,
    )

    assert result["overall_status"] == "needs_clarification"
    assert result["tasks"] == []
    assert result["artifacts"] == []
    assert result["questions"]


def test_executor_receives_only_the_frozen_export_plan() -> None:
    captured: dict = {}

    def recording_executor(plan: dict) -> dict:
        captured["plan"] = plan
        return {
            "schema_version": "1",
            "overall_status": "success",
            "tasks": [],
            "artifacts": [],
            "questions": [],
            "diagnostics": [],
        }

    result = run_export_workflow(
        "导出 MY8801 当前库存",
        today=FIXED_TODAY,
        executor=recording_executor,
    )

    assert result["overall_status"] == "success"
    assert set(result) == {
        "schema_version", "overall_status", "tasks", "artifacts", "questions", "diagnostics",
    }
    assert "success" not in result
    assert set(captured["plan"]) == {
        "schema_version",
        "execution_date",
        "requires_clarification",
        "questions",
        "diagnostics",
        "logical_tasks",
        "source_fetches",
    }
    assert "request_text" not in json.dumps(captured["plan"], ensure_ascii=False)


def _successful_export(data_type: str, warehouse: str | None, path: Path) -> dict:
    export = {
        "business_type": data_type,
        "status": "success",
        "output_filename": path.name,
        "xlsx_path": str(path),
        "row_count": 1,
        "source": "fixture",
    }
    if warehouse is not None:
        export["warehouse"] = warehouse
    return {
        "overall_status": "success",
        "exports": [export],
        "xlsx_paths": [str(path)],
    }


def _source_batch(plan: dict, *, failed_warehouse: str | None = None) -> InventorySalesSourceBatch:
    results = []
    for fetch in plan["source_fetches"]:
        failed = fetch["warehouse"] == failed_warehouse
        results.append({
            "source_fetch_id": fetch["source_fetch_id"],
            "warehouse": fetch["warehouse"],
            "status": "failed" if failed else "success",
            "xlsx_path": f"raw-{fetch['warehouse']}.xlsx" if not failed else None,
            "source": "fixture",
            **(
                {
                    "error_code": "EXPORT_POLL_TIMEOUT",
                    "stage": "轮询导出队列",
                    "error_type": "YacangError",
                    "error": "fixture poll timeout",
                }
                if failed
                else {}
            ),
        })
    created = plan["source_fetches"][0]["effective_parameters"]["created_date_filter"]
    return InventorySalesSourceBatch(
        created_start_date=created["created_start_date"],
        created_end_date=created["created_end_date"],
        results=tuple(results),
    )


def test_executor_acquires_shared_sales_source_once_then_projects_both_types(
    monkeypatch,
    tmp_path: Path,
) -> None:
    assert list(inspect.signature(execute_export_plan).parameters) == ["plan"]
    plan = plan_export_workflow(
        normalized("导出 MY8801 两种销量"),
        execution_date="2026-09-14",
    )
    calls: list[object] = []

    def acquire(source_fetches, **_kwargs):
        calls.append(("source", [item["source_fetch_id"] for item in source_fetches]))
        return _source_batch(plan)

    def monthly(_batch, *, warehouses, **_kwargs):
        calls.append(("sales-monthly", warehouses[0]))
        return _successful_export("sales-monthly", warehouses[0], tmp_path / "monthly.xlsx")

    def daily(_batch, *, warehouses, **_kwargs):
        calls.append(("sales-90d", warehouses[0]))
        return _successful_export("sales-90d", warehouses[0], tmp_path / "daily.xlsx")

    monkeypatch.setattr(executor_module, "acquire_inventory_sales_sources", acquire)
    monkeypatch.setattr(executor_module, "project_sales_monthly_sources", monthly)
    monkeypatch.setattr(executor_module, "project_sales_90d_sources", daily)

    result = execute_export_plan(plan)

    assert calls == [
        ("source", [plan["source_fetches"][0]["source_fetch_id"]]),
        ("sales-monthly", "MY8801"),
        ("sales-90d", "MY8801"),
    ]
    assert result["overall_status"] == "success"
    assert [task["status"] for task in result["tasks"]] == ["success", "success"]
    assert [artifact["data_type"] for artifact in result["artifacts"]] == [
        "sales-monthly",
        "sales-90d",
    ]
    assert [artifact["path"] for artifact in result["artifacts"]] == [
        str(tmp_path / "monthly.xlsx"),
        str(tmp_path / "daily.xlsx"),
    ]
    assert all("xlsx_path" not in artifact for artifact in result["artifacts"])
    assert all("raw-" not in artifact["path"] for artifact in result["artifacts"])


def test_executor_preserves_fixed_type_and_warehouse_execution_order(monkeypatch, tmp_path: Path) -> None:
    plan = plan_export_workflow(normalized("导出雅仓数据"), execution_date="2026-09-14")
    calls: list[str] = []

    monkeypatch.setattr(
        executor_module,
        "acquire_inventory_sales_sources",
        lambda _fetches, **_kwargs: (calls.append("source") or _source_batch(plan)),
    )
    monkeypatch.setattr(
        executor_module,
        "project_sales_monthly_sources",
        lambda _batch, *, warehouses, **_kwargs: (
            calls.append(f"sales-monthly:{warehouses[0]}")
            or _successful_export("sales-monthly", warehouses[0], tmp_path / f"monthly-{warehouses[0]}.xlsx")
        ),
    )
    monkeypatch.setattr(
        executor_module,
        "project_sales_90d_sources",
        lambda _batch, *, warehouses, **_kwargs: (
            calls.append(f"sales-90d:{warehouses[0]}")
            or _successful_export("sales-90d", warehouses[0], tmp_path / f"daily-{warehouses[0]}.xlsx")
        ),
    )
    monkeypatch.setattr(
        executor_module,
        "export_inventory_current_snapshot",
        lambda *, warehouse, **_kwargs: (
            calls.append(f"inventory-current-snapshot:{warehouse}")
            or _successful_export(
                "inventory-current-snapshot", warehouse, tmp_path / f"inventory-{warehouse}.xlsx"
            )
        ),
    )
    monkeypatch.setattr(
        executor_module,
        "export_inbound_listing_time",
        lambda **_kwargs: (
            calls.append("inbound-listing-time:global")
            or _successful_export("inbound-listing-time", None, tmp_path / "inbound.xlsx")
        ),
    )

    result = execute_export_plan(plan)

    assert calls == [
        "source",
        "sales-monthly:MY8801", "sales-monthly:PH8805",
        "sales-monthly:TH8802", "sales-monthly:VN8806",
        "sales-90d:MY8801", "sales-90d:PH8805", "sales-90d:TH8802", "sales-90d:VN8806",
        "inventory-current-snapshot:MY8801", "inventory-current-snapshot:PH8805",
        "inventory-current-snapshot:TH8802", "inventory-current-snapshot:VN8806",
        "inbound-listing-time:global",
    ]
    assert result["overall_status"] == "success"
    assert len(result["tasks"]) == 13
    assert len(result["artifacts"]) == 13


def test_local_source_failure_continues_and_preserves_success_artifacts(monkeypatch, tmp_path: Path) -> None:
    plan = plan_export_workflow(
        normalized("导出 MY8801、TH8802 的两种销量"), execution_date="2026-09-14"
    )
    calls: list[str] = []
    monkeypatch.setattr(
        executor_module,
        "acquire_inventory_sales_sources",
        lambda _fetches, **_kwargs: _source_batch(plan, failed_warehouse="MY8801"),
    )

    def projector(data_type: str, batch, *, warehouses, **_kwargs):
        warehouse = warehouses[0]
        calls.append(f"{data_type}:{warehouse}")
        source = next(item for item in batch.results if item["warehouse"] == warehouse)
        if source["status"] != "success":
            return {"overall_status": "failed", "exports": [dict(source)], "xlsx_paths": []}
        return _successful_export(data_type, warehouse, tmp_path / f"{data_type}-{warehouse}.xlsx")

    monkeypatch.setattr(
        executor_module,
        "project_sales_monthly_sources",
        lambda batch, **kwargs: projector("sales-monthly", batch, **kwargs),
    )
    monkeypatch.setattr(
        executor_module,
        "project_sales_90d_sources",
        lambda batch, **kwargs: projector("sales-90d", batch, **kwargs),
    )

    result = execute_export_plan(plan)

    assert calls == [
        "sales-monthly:MY8801", "sales-monthly:TH8802",
        "sales-90d:MY8801", "sales-90d:TH8802",
    ]
    assert [task["status"] for task in result["tasks"]] == [
        "failed", "success", "failed", "success",
    ]
    assert result["overall_status"] == "partial_success"
    assert len(result["artifacts"]) == 2


def test_global_source_status_stops_later_logical_tasks(monkeypatch, tmp_path: Path) -> None:
    plan = plan_export_workflow(
        normalized("导出 MY8801、TH8802 的两种销量"), execution_date="2026-09-14"
    )
    batch = _source_batch(plan)
    source_results = [dict(item) for item in batch.results]
    source_results[1].update({
        "status": "failed",
        "xlsx_path": None,
        "error_code": "EXPORT_STATUS_UNKNOWN",
        "stage": "读取导出队列",
        "error_type": "YacangError",
        "error": "fixture unknown queue status",
    })
    batch = InventorySalesSourceBatch(
        created_start_date=batch.created_start_date,
        created_end_date=batch.created_end_date,
        results=tuple(source_results),
    )
    calls: list[str] = []
    monkeypatch.setattr(
        executor_module,
        "acquire_inventory_sales_sources",
        lambda _fetches, **_kwargs: batch,
    )

    def projector(data_type: str, source_batch, *, warehouses, **_kwargs):
        warehouse = warehouses[0]
        calls.append(f"{data_type}:{warehouse}")
        source = next(item for item in source_batch.results if item["warehouse"] == warehouse)
        if source["status"] != "success":
            return {"overall_status": "failed", "exports": [dict(source)], "xlsx_paths": []}
        return _successful_export(data_type, warehouse, tmp_path / f"{data_type}-{warehouse}.xlsx")

    monkeypatch.setattr(
        executor_module,
        "project_sales_monthly_sources",
        lambda source_batch, **kwargs: projector("sales-monthly", source_batch, **kwargs),
    )
    monkeypatch.setattr(
        executor_module,
        "project_sales_90d_sources",
        lambda source_batch, **kwargs: projector("sales-90d", source_batch, **kwargs),
    )

    result = execute_export_plan(plan)

    assert calls == ["sales-monthly:MY8801", "sales-monthly:TH8802"]
    assert [task["status"] for task in result["tasks"]] == [
        "success", "failed", "skipped", "skipped",
    ]
    assert result["overall_status"] == "partial_success"
    assert len(result["artifacts"]) == 1


@pytest.mark.parametrize(
    "error_code",
    [
        "YACANG_CREDENTIALS_MISSING",
        "YACANG_AUTH_EXPIRED",
        "YACANG_FORBIDDEN",
        "YACANG_RATE_LIMITED",
        "EXPORT_SUBMIT_UNKNOWN",
        "EXPORT_STATUS_UNKNOWN",
        "YACANG_REMOTE_ERROR",
    ],
)
def test_global_error_stops_later_tasks_and_keeps_prior_artifact(
    monkeypatch,
    tmp_path: Path,
    error_code: str,
) -> None:
    plan = plan_export_workflow(
        normalized("导出 MY8801、TH8802 当前库存和上架时间"), execution_date="2026-09-14"
    )
    calls: list[str] = []

    def inventory(*, warehouse, **_kwargs):
        calls.append(warehouse)
        if warehouse == "TH8802":
            raise YacangError(
                "提交库存导出",
                "HTTP 403",
                code=error_code,
                http_status=403,
                scope="global",
            )
        return _successful_export(
            "inventory-current-snapshot", warehouse, tmp_path / f"inventory-{warehouse}.xlsx"
        )

    monkeypatch.setattr(executor_module, "export_inventory_current_snapshot", inventory)
    monkeypatch.setattr(
        executor_module,
        "export_inbound_listing_time",
        lambda **_kwargs: calls.append("inbound") or _successful_export(
            "inbound-listing-time", None, tmp_path / "inbound.xlsx"
        ),
    )

    result = execute_export_plan(plan)

    assert calls == ["MY8801", "TH8802"]
    assert [task["status"] for task in result["tasks"]] == ["success", "failed", "skipped"]
    assert result["overall_status"] == "partial_success"
    assert len(result["artifacts"]) == 1
    assert result["diagnostics"][-1]["code"] == "EXPORT_SKIPPED"


@pytest.mark.parametrize(
    "error_code",
    ["EXPORT_POLL_TIMEOUT", "XLSX_DOWNLOAD_NETWORK_ERROR", "XLSX_MIME_INVALID"],
)
def test_local_inventory_error_continues_later_tasks(monkeypatch, tmp_path: Path, error_code: str) -> None:
    plan = plan_export_workflow(
        normalized("导出 MY8801、TH8802 当前库存和上架时间"), execution_date="2026-09-14"
    )
    calls: list[str] = []

    def inventory(*, warehouse, **_kwargs):
        calls.append(warehouse)
        if warehouse == "MY8801":
            raise YacangError("库存导出", "fixture local failure", code=error_code)
        return _successful_export(
            "inventory-current-snapshot", warehouse, tmp_path / f"inventory-{warehouse}.xlsx"
        )

    monkeypatch.setattr(executor_module, "export_inventory_current_snapshot", inventory)
    monkeypatch.setattr(
        executor_module,
        "export_inbound_listing_time",
        lambda **_kwargs: (
            calls.append("inbound")
            or _successful_export("inbound-listing-time", None, tmp_path / "inbound.xlsx")
        ),
    )

    result = execute_export_plan(plan)

    assert calls == ["MY8801", "TH8802", "inbound"]
    assert [task["status"] for task in result["tasks"]] == ["failed", "success", "success"]
    assert result["overall_status"] == "partial_success"
    assert len(result["artifacts"]) == 2


def test_unsupported_only_fails_without_calling_any_exporter(monkeypatch) -> None:
    plan = plan_export_workflow(normalized("导出56天销量"), execution_date="2026-09-14")
    monkeypatch.setattr(
        executor_module,
        "acquire_inventory_sales_sources",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(AssertionError("must not fetch")),
    )

    result = execute_export_plan(plan)

    assert result["overall_status"] == "failed"
    assert result["tasks"] == []
    assert result["artifacts"] == []
    assert result["diagnostics"][0]["code"] == "UNSUPPORTED_SALES_WINDOW"


def test_mixed_supported_and_unsupported_is_partial_success(monkeypatch, tmp_path: Path) -> None:
    plan = plan_export_workflow(
        normalized("导出 MY8801 当前库存和56天销量"), execution_date="2026-09-14"
    )
    monkeypatch.setattr(
        executor_module,
        "export_inventory_current_snapshot",
        lambda *, warehouse, **_kwargs: _successful_export(
            "inventory-current-snapshot", warehouse, tmp_path / "inventory.xlsx"
        ),
    )

    result = execute_export_plan(plan)

    assert result["overall_status"] == "partial_success"
    assert [task["status"] for task in result["tasks"]] == ["success"]
    assert result["artifacts"][0]["path"] == str(tmp_path / "inventory.xlsx")
    assert "xlsx_path" not in result["artifacts"][0]
    assert result["diagnostics"][0]["code"] == "UNSUPPORTED_SALES_WINDOW"
    assert result["diagnostics"][0]["requested_value"] == {"sales_window_days": 56}
    assert all(
        "requested_value" not in task.get("effective_parameters", {})
        for task in result["tasks"]
    )


def test_unified_cli_returns_canonical_clarification_envelope() -> None:
    result = run_export_workflow_cli({"request_text": "导出库存动销"})

    assert result["success"] is False
    assert set(result).issuperset({
        "success",
        "schema_version",
        "overall_status",
        "tasks",
        "artifacts",
        "questions",
        "diagnostics",
    })
    assert result["overall_status"] == "needs_clarification"
    assert result["tasks"] == []
    assert result["artifacts"] == []
