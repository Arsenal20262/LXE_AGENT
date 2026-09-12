from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
from openpyxl import Workbook

from services.agent_cli.yacang.export_inventory_sales import run
from services.yacang.errors import YacangError, safe_remote_detail
from services.yacang.inventory_sales_export import (
    EXPECTED_HEADERS,
    ExportRequest,
    WAREHOUSES,
    export_inventory_sales,
    task_matches_request,
    validate_workbook,
    YacangRiskController,
)


def _write_xlsx(path: Path, warehouse: str) -> None:
    workbook = Workbook()
    sheet = workbook.active
    sheet.append(EXPECTED_HEADERS)
    sheet.append(("SKU-1", "商品", warehouse, 1, 2, 3, 4, 5, 6, 10, 0, 0, 0, 10, 0, "2026-09-01"))
    workbook.save(path)
    workbook.close()


class FakeClient:
    def __init__(self, root: Path) -> None:
        self.root = root
        self.login_calls: list[tuple[str, str]] = []
        self.submissions: list[int] = []
        self.current: int | None = None

    def login(self, mobile: str, password: str) -> None:
        self.login_calls.append((mobile, password))

    def list_downloads(self, *, limit: int = 50) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = [{"id": "old", "name": "库存动销导出", "type": "10"}]
        if self.current is not None:
            rows.insert(0, {
                "id": f"new-{self.current}",
                "name": "库存动销导出",
                "type": "10",
                "path": f"https://oss-accelerate.seaya.cn/test/{self.current}.xlsx",
                "param_where": json.dumps([["warehouse_id", "in", [str(self.current)]]]),
            })
        return rows

    def create_inventory_sales_export(self, *, warehouse_id: int, start_date: str, end_date: str) -> str:
        assert start_date == "2026-09-01"
        assert end_date == "2026-09-13"
        self.current = warehouse_id
        self.submissions.append(warehouse_id)
        return f"request-{warehouse_id}"

    def download_xlsx(self, url: str, destination: Path) -> None:
        warehouse = next(code for code, warehouse_id in WAREHOUSES if str(warehouse_id) in url)
        _write_xlsx(destination, warehouse)


def test_task_match_uses_param_where_not_outer_warehouse_id() -> None:
    request = ExportRequest("MY8801", 26, "2026-09-01", "2026-09-13")
    task = {
        "name": "库存动销导出",
        "type": "10",
        "warehouse_id": "0",
        "param_where": '[["warehouse_id","in",["26"]]]',
    }
    assert task_matches_request(task, request)
    assert not task_matches_request(task, ExportRequest("PH8805", 46, "2026-09-01", "2026-09-13"))


def test_risk_controller_rejects_unknown_and_duplicate_warehouse_writes() -> None:
    risk = YacangRiskController(sleep=lambda _seconds: None)
    request = ExportRequest("MY8801", 26, "2026-09-01", "2026-09-13")
    risk.before_submission(request)
    with pytest.raises(YacangError, match="已提交仓库"):
        risk.before_submission(request)
    with pytest.raises(YacangError, match="未授权仓库映射"):
        YacangRiskController().before_submission(
            ExportRequest("UNKNOWN", 999, "2026-09-01", "2026-09-13")
        )


def test_export_logs_in_once_and_exports_four_warehouses_serially(tmp_path: Path) -> None:
    client = FakeClient(tmp_path)
    result = export_inventory_sales(
        start_date="2026-09-01",
        end_date="2026-09-13",
        mobile="account",
        password="secret",
        output_dir=tmp_path,
        cache_max_age_seconds=0,
        client=client,  # type: ignore[arg-type]
        sleep=lambda _seconds: None,
    )
    assert result["success"] is True
    assert result["sales_window_days"] == 15
    assert result["warehouse_count"] == 4
    assert client.login_calls == [("account", "secret")]
    assert client.submissions == [26, 46, 47, 80]
    assert [item["warehouse"] for item in result["exports"]] == ["MY8801", "PH8805", "TH8802", "VN8806"]
    assert all(Path(path).is_file() for path in result["xlsx_paths"])


def test_fresh_valid_files_are_reused_without_login(tmp_path: Path) -> None:
    for warehouse, _warehouse_id in WAREHOUSES:
        _write_xlsx(tmp_path / f"yacang_inventory_sales_{warehouse}_2026-09-01_2026-09-13.xlsx", warehouse)
    client = FakeClient(tmp_path)
    result = export_inventory_sales(
        start_date="2026-09-01",
        end_date="2026-09-13",
        mobile="account",
        password="secret",
        output_dir=tmp_path,
        cache_max_age_seconds=300,
        client=client,  # type: ignore[arg-type]
    )
    assert client.login_calls == []
    assert client.submissions == []
    assert {item["source"] for item in result["exports"]} == {"cache"}


def test_workbook_rejects_cross_warehouse_rows(tmp_path: Path) -> None:
    path = tmp_path / "wrong.xlsx"
    _write_xlsx(path, "TH8802")
    with pytest.raises(YacangError, match="其他仓库"):
        validate_workbook(path, warehouse_code="MY8801")


def test_error_detail_redacts_credentials_and_captcha() -> None:
    detail = safe_remote_detail({
        "message": "invalid",
        "token": "secret-token",
        "nested": {"password": "secret-password", "captcha": "data:image/jpeg;base64,secret"},
    })
    assert "invalid" in detail
    assert "secret-token" not in detail
    assert "secret-password" not in detail
    assert "base64" not in detail


def test_cli_failure_is_factual_and_does_not_echo_credentials(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("LXE_YACANG_MOBILE", raising=False)
    monkeypatch.delenv("LXE_YACANG_PASSWORD", raising=False)
    result = run({"start_date": "2026-09-01", "end_date": "2026-09-13"})
    assert result["success"] is False
    assert "缺少雅仓账号或密码" in result["exception"]
    assert "password" not in result
