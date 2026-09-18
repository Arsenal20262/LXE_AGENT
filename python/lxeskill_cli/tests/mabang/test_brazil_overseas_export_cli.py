from __future__ import annotations

from services.agent_cli.mabang import brazil_overseas_export as cli
from services.mabang.brazil_overseas.contracts import BrazilExportKind
from services.mabang.brazil_overseas.workflow import BrazilOverseasWorkflowResult
from services.mabang.errors import MabangAuthError


def test_cli_returns_one_deliverable_path(monkeypatch) -> None:
    async def fake_workflow(request_text: str):
        assert request_text == "查询巴西海外仓库存"
        return BrazilOverseasWorkflowResult(
            kind=BrazilExportKind.INVENTORY_SALES_SNAPSHOT,
            xlsx_path="/artifacts/replenish/brazil_overseas/inventory.xlsx",
            source_data_note="平台原始库存文件仅含7/28/42天累计销量",
        )

    monkeypatch.setattr(cli, "export_brazil_overseas_from_request", fake_workflow)

    assert cli.run({"request_text": "查询巴西海外仓库存"}) == {
        "success": True,
        "kind": "inventory_sales_snapshot",
        "xlsx_path": "/artifacts/replenish/brazil_overseas/inventory.xlsx",
        "warehouse_id": "1072376",
        "warehouse_label": "巴西海外仓",
        "source_data_note": "平台原始库存文件仅含7/28/42天累计销量",
    }


def test_cli_preserves_auth_failure_without_requesting_a_retry(monkeypatch) -> None:
    async def fail_workflow(_request_text: str):
        raise MabangAuthError("实际认证错误")

    monkeypatch.setattr(cli, "export_brazil_overseas_from_request", fail_workflow)

    assert cli.run({"request_text": "查询巴西海外仓库存"}) == {
        "success": False,
        "request_text": "查询巴西海外仓库存",
        "exception": "实际认证错误",
        "auth_refresh_required": False,
    }


def test_cli_rejects_empty_request_text() -> None:
    assert cli.run({}) == {
        "success": False,
        "request_text": "",
        "exception": "request_text 不能为空",
        "auth_refresh_required": False,
    }
