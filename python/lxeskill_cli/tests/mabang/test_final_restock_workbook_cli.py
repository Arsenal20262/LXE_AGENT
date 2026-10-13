from __future__ import annotations

from types import SimpleNamespace

from services.agent_cli.mabang import generate_final_restock_recommendation as cli


def test_cli_forwards_the_four_offline_inputs(monkeypatch) -> None:
    expected = {
        "success": False,
        "store_name": "Amazon-Test",
        "source_data_time": "202610131000",
        "output_xlsx_path": "/tmp/final.xlsx",
        "row_count": 4,
        "formula_error_count": 1,
        "formula_error_examples": ["AC3=#VALUE!"],
        "exception": "Office 重算发现 1 个 Excel 错误单元格；实际错误示例: AC3=#VALUE!",
    }
    seen: dict[str, object] = {}

    def fake_generate(store_name: str, **kwargs):
        seen["store_name"] = store_name
        seen.update(kwargs)
        return SimpleNamespace(to_payload=lambda: expected)

    monkeypatch.setattr(cli, "generate_final_restock_recommendation", fake_generate)
    result = cli.run({
        "store_name": " Amazon-Test ",
        "msku_source_xlsx_path": "/inputs/source.xlsx",
        "shenzhen_inventory_report_xlsx_path": "/inputs/shenzhen.xlsx",
        "shenzhen_source_msku_xlsx_path": "/inputs/source.xlsx",
        "unlinked_shipments_snapshot_path": "/inputs/shipments.xlsx",
    })

    assert result == expected
    assert seen == {
        "store_name": "Amazon-Test",
        "msku_source_xlsx_path": "/inputs/source.xlsx",
        "shenzhen_inventory_report_xlsx_path": "/inputs/shenzhen.xlsx",
        "shenzhen_source_msku_xlsx_path": "/inputs/source.xlsx",
        "unlinked_shipments_snapshot_path": "/inputs/shipments.xlsx",
    }


def test_cli_preserves_actual_failure_diagnostic(monkeypatch) -> None:
    def fail(_store_name: str, **_kwargs):
        raise ValueError("深圳库存报告与本次 MSKU 源文件核验批次不一致")

    monkeypatch.setattr(cli, "generate_final_restock_recommendation", fail)
    assert cli.run({"store_name": "Amazon-Test"}) == {
        "success": False,
        "store_name": "Amazon-Test",
        "exception": "深圳库存报告与本次 MSKU 源文件核验批次不一致",
    }
