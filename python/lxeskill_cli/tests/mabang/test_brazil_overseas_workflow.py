from __future__ import annotations

import asyncio

import pytest

from services.mabang.brazil_overseas import workflow
from services.mabang.brazil_overseas.allocation import BrazilOverseasAllocationExportResult
from services.mabang.brazil_overseas.contracts import BrazilExportKind
from services.mabang.brazil_overseas.inventory import BrazilOverseasInventoryExportResult


def test_routes_sales_request_to_one_inventory_sales_export(monkeypatch) -> None:
    calls: list[dict] = []

    async def fake_inventory_export(**kwargs):
        calls.append(kwargs)
        return BrazilOverseasInventoryExportResult(xlsx_path="/artifacts/replenish/brazil_overseas/inventory.xlsx")

    monkeypatch.setattr(workflow, "export_brazil_overseas_inventory_sales_snapshot", fake_inventory_export)

    result = asyncio.run(workflow.export_brazil_overseas_from_request("查询巴西海外仓最近三个月销量"))

    assert result.kind is BrazilExportKind.INVENTORY_SALES_SNAPSHOT
    assert result.xlsx_path == "/artifacts/replenish/brazil_overseas/inventory.xlsx"
    assert result.source_data_note == "平台原始库存文件仅含7/28/42天累计销量"
    assert calls == [{}]


@pytest.mark.parametrize(
    ("request_text", "kind", "expected_path"),
    [
        ("查询巴西海外仓已签收单据", BrazilExportKind.ALLOCATION_SIGNED_ALL, "/artifacts/replenish/brazil_overseas/signed.xlsx"),
        ("查询巴西海外仓三个月待签收单据", BrazilExportKind.ALLOCATION_PENDING_DEFAULT_3M, "/artifacts/replenish/brazil_overseas/pending.xlsx"),
    ],
)
def test_routes_allocation_request_to_its_matching_export(monkeypatch, request_text, kind, expected_path) -> None:
    calls: list[tuple[BrazilExportKind, dict]] = []

    async def fake_allocation_export(actual_kind: BrazilExportKind, **kwargs):
        calls.append((actual_kind, kwargs))
        return BrazilOverseasAllocationExportResult(kind=actual_kind, xlsx_path=expected_path)

    monkeypatch.setattr(workflow, "export_brazil_overseas_allocation", fake_allocation_export)

    result = asyncio.run(workflow.export_brazil_overseas_from_request(request_text))

    assert result.kind is kind
    assert result.xlsx_path == expected_path
    assert calls == [(kind, {})]


def test_returns_actionable_clarification_without_calling_erp() -> None:
    with pytest.raises(workflow.BrazilOverseasRequestClarificationError) as raised:
        asyncio.run(workflow.export_brazil_overseas_from_request("查询巴西海外仓入库情况"))
    assert raised.value.code == "allocation_status_required"
    assert str(raised.value) == "请说明要查询已签收单据，还是默认三个月内待签收单据。"
