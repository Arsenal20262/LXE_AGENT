"""The formal offline command accepts only three local Vietnam source reports."""

from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace

from openpyxl import Workbook
import pytest

from lxeskill import cli as lxeskill
from lxeskill.business import load_catalog
from services.agent_cli.vietnam_replenishment import generate_offline
from services.vietnam_replenishment import workflow, yacang_sources
from services.vietnam_replenishment.workbook import RecommendationConfig
from services.yacang.validation import (
    INVENTORY_LIST_HEADERS, INVENTORY_SALES_HEADERS, WAREHOUSE_PRODUCTS_HEADERS,
)
from shared import input_assets


COMMAND = ["vietnam", "stock", "generate"]


def _book(path: Path, headers: tuple[str, ...], row: dict[str, object]) -> str:
    book = Workbook()
    try:
        book.active.append(headers)
        book.active.append([row.get(name) for name in headers])
        book.save(path)
    finally:
        book.close()
    return str(path)


def _paths(tmp_path: Path) -> list[str]:
    return [
        _book(tmp_path / "one.xlsx", INVENTORY_SALES_HEADERS, {"SKU": "VN-A", "仓库": "VN8806"}),
        _book(tmp_path / "two.xlsx", INVENTORY_LIST_HEADERS, {"SKU": "VN-A", "仓库": "VN8806"}),
        _book(tmp_path / "three.xlsx", WAREHOUSE_PRODUCTS_HEADERS,
              {"SKU": "VN-A", "创建时间": "2026-09-23 10:00"}),
    ]


def _result(capsys) -> dict:
    records = [json.loads(line) for line in capsys.readouterr().out.splitlines() if line.strip()]
    return next(record for record in reversed(records) if record["type"] == "result")


def test_catalog_declares_three_managed_xlsx_and_one_final_deliverable() -> None:
    entry = load_catalog()["vietnam_replenishment_generate_offline"]
    assert entry["module"] == "services.agent_cli.vietnam_replenishment.generate_offline"
    assert entry["command_path"] == COMMAND
    assert entry["owner_skills"] == ["vietnam-stock-recommendation"]
    assert entry["managed_execution"] == {"attachment_argument": "source_xlsx", "attachment_count": 3}
    assert entry["artifact_paths"] == [{"field": "output_xlsx", "role": "deliverable"}]
    field = entry["input_schema"]["properties"]["source_xlsx"]
    assert entry["input_schema"]["required"] == ["source_xlsx"]
    assert field["type"] == "array" and field["minItems"] == field["maxItems"] == 3
    assert field["items"]["type"] == "string"
    assert field["x-lxe-file-input"]["accepted_extensions"] == [".xlsx"]


@pytest.mark.parametrize("count", [0, 1, 2, 4])
def test_business_command_rejects_wrong_count_without_workflow(
    count: int, monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(generate_offline, "generate_offline_vietnam_recommendation",
                        lambda _: (_ for _ in ()).throw(AssertionError("workflow called")))
    result = generate_offline.run({"source_xlsx": ["synthetic.xlsx"] * count})
    assert result["success"] is False
    assert result["error"]["code"] == "invalid_arguments"
    assert "output_xlsx" not in result


def test_direct_cli_repeated_flags_deliver_only_final_xlsx(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys,
) -> None:
    paths = _paths(tmp_path)
    workspace = tmp_path / "workspace"
    output = workspace / ".lxeagent" / "artifacts" / "vietnam" / "recommendations" / "final.xlsx"
    output.parent.mkdir(parents=True)
    output.write_bytes(b"synthetic final workbook")
    monkeypatch.setenv("LXE_WORKSPACE_ROOT", str(workspace))
    monkeypatch.setenv("LXE_DATA_ROOT", str(tmp_path / "state"))
    received: list[list[str]] = []

    def fake_workflow(raw_paths: list[str]) -> SimpleNamespace:
        received.append(raw_paths)
        return SimpleNamespace(
            output_xlsx=output, sku_count=1,
            config=RecommendationConfig(), config_source="default",
        )

    monkeypatch.setattr(generate_offline, "generate_offline_vietnam_recommendation", fake_workflow)
    assert lxeskill.main([*COMMAND, *(part for path in reversed(paths)
                                      for part in ("--source-xlsx", path))]) == 0
    record = _result(capsys)
    assert received == [list(reversed(paths))]
    assert record["ok"] is True
    assert record["files"] == [str(output)]
    assert record["data"]["output_xlsx"] == str(output)


def test_direct_cli_business_rejects_invalid_report_without_online_fallback(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys,
) -> None:
    paths = _paths(tmp_path)
    paths[2] = _book(tmp_path / "wrong.xlsx", ("SKU", "not-a-report"), {"SKU": "VN-A"})
    monkeypatch.setenv("LXE_WORKSPACE_ROOT", str(tmp_path / "workspace"))
    monkeypatch.setenv("LXE_DATA_ROOT", str(tmp_path / "state"))
    calls: list[str] = []

    def forbidden_yacang(_arguments: object) -> None:
        calls.append("Yacang")
        raise AssertionError("offline CLI called Yacang")

    monkeypatch.setattr(yacang_sources.yacang_workflow, "run", forbidden_yacang)
    assert lxeskill.main([*COMMAND, *(part for path in paths
                                      for part in ("--source-xlsx", path))]) == lxeskill.EXIT_BUSINESS
    record = _result(capsys)
    assert record["ok"] is False and record["files"] == []
    assert "output_xlsx" not in record["data"]
    assert calls == []


def test_missing_current_fails_without_online_call_or_delivery(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    paths = _paths(tmp_path)
    monkeypatch.setattr(input_assets, "input_root", lambda: tmp_path / "inputs")
    calls: list[str] = []
    monkeypatch.setattr(yacang_sources.yacang_workflow, "run", lambda _: calls.append("Yacang"))
    result = generate_offline.run({"source_xlsx": paths})
    assert result["success"] is False
    assert result["error"]["code"] == "sku_parameter_map_required"
    assert "output_xlsx" not in result
    assert calls == []


def test_failure_preserves_diagnostic_but_redacts_input_paths(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    paths = _paths(tmp_path)
    monkeypatch.setattr(generate_offline, "generate_offline_vietnam_recommendation",
                        lambda _: (_ for _ in ()).throw(RuntimeError(f"Office failed at {paths[1]}")))
    result = generate_offline.run({"source_xlsx": paths})
    assert result["success"] is False
    assert "Office failed" in result["error"]["message"]
    assert all(path not in json.dumps(result) for path in paths)
    assert "output_xlsx" not in result
