from __future__ import annotations

import json
from types import SimpleNamespace

from lxeskill import cli as lxeskill
from lxeskill.business import load_catalog
from services.agent_cli.mabang import generate_final_restock_recommendation as cli


def test_cli_forwards_the_three_offline_files(monkeypatch) -> None:
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
        "unlinked_shipments_snapshot_path": "/inputs/shipments.xlsx",
        "peak_boost_enabled": False, "peak_boost_days": None,
    })

    assert result == expected
    assert seen == {
        "store_name": "Amazon-Test",
        "msku_source_xlsx_path": "/inputs/source.xlsx",
        "shenzhen_inventory_report_xlsx_path": "/inputs/shenzhen.xlsx",
        "unlinked_shipments_snapshot_path": "/inputs/shipments.xlsx",
        "peak_boost_enabled": False, "peak_boost_days": None,
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


def test_catalog_has_four_inputs_and_rejects_the_removed_flag(monkeypatch, capsys) -> None:
    entry = load_catalog()["mabang_generate_final_restock_recommendation"]
    required = ["store_name", "msku_source_xlsx_path", "shenzhen_inventory_report_xlsx_path",
                "unlinked_shipments_snapshot_path"]
    assert entry["input_schema"]["required"] == required
    assert list(entry["input_schema"]["properties"]) == [*required, "peak_boost_enabled", "peak_boost_days"]
    monkeypatch.delenv("LXESKILL_SKILL_SCOPE", raising=False)
    assert lxeskill.main([
        "replenish", "final-restock", "generate", "--shenzhen-source-msku-xlsx-path", "source.xlsx",
    ]) == lxeskill.EXIT_USAGE
    terminal = json.loads(capsys.readouterr().out)
    assert terminal["error"]["code"] == "invalid_arguments"
    assert terminal["error"]["message"] == "unknown option: --shenzhen-source-msku-xlsx-path"
    assert terminal["files"] == []
