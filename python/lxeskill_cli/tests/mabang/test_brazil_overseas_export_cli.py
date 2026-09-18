from __future__ import annotations

from services.agent_cli.mabang import brazil_overseas_export as cli
from services.mabang.brazil_overseas.contracts import BrazilExportKind
from services.mabang.brazil_overseas.workflow import BrazilOverseasWorkflowResult
from services.mabang.errors import MabangAuthError


def test_cli_returns_one_deliverable_path(monkeypatch) -> None:
    async def fake_workflow(*, warehouse: str, export_kind: str):
        assert warehouse == "brazil_overseas"
        assert export_kind == "inventory_sales_snapshot"
        return BrazilOverseasWorkflowResult(
            kind=BrazilExportKind.INVENTORY_SALES_SNAPSHOT,
            xlsx_path="/artifacts/replenish/brazil_overseas/inventory.xlsx",
            source_data_note="平台原始库存文件仅含7/28/42天累计销量",
        )

    monkeypatch.setattr(cli, "export_brazil_overseas", fake_workflow)

    assert cli.run({"warehouse": "brazil_overseas", "export_kind": "inventory_sales_snapshot"}) == {
        "success": True,
        "kind": "inventory_sales_snapshot",
        "xlsx_path": "/artifacts/replenish/brazil_overseas/inventory.xlsx",
        "warehouse_id": "1072376",
        "warehouse_label": "巴西海外仓",
        "source_data_note": "平台原始库存文件仅含7/28/42天累计销量",
    }


def test_cli_preserves_auth_failure_without_requesting_a_retry(monkeypatch) -> None:
    async def fail_workflow(*, warehouse: str, export_kind: str):
        raise MabangAuthError("实际认证错误")

    monkeypatch.setattr(cli, "export_brazil_overseas", fail_workflow)

    assert cli.run({"warehouse": "brazil_overseas", "export_kind": "inventory_sales_snapshot"}) == {
        "success": False,
        "warehouse": "brazil_overseas",
        "export_kind": "inventory_sales_snapshot",
        "exception": "实际认证错误",
        "auth_refresh_required": False,
    }


def test_cli_rejects_missing_structured_parameters() -> None:
    assert cli.run({}) == {
        "success": False,
        "warehouse": "",
        "export_kind": "",
        "exception": "warehouse 和 export_kind 不能为空",
        "auth_refresh_required": False,
    }
