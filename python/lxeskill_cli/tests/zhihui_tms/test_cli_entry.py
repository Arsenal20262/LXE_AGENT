from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace
import json
from contextlib import contextmanager

import pytest

from services.agent_cli.zhihui import export_products
from services.zhihui_tms.intent import normalize_product_export_intent
from services.zhihui_tms.planner import plan_product_export
from lxeskill import cli as lxeskill_cli
from lxeskill.business import load_catalog
from shared.process_lock import InterProcessLockTimeout
from shared.repository import repository_root


@pytest.mark.parametrize(
    "wording",
    ["销量月度 7/14/30 天", "销量日度 90 天", "库存月末快照", "入库/上架时间"],
)
def test_report_wording_maps_to_one_truthful_product_export(wording: str) -> None:
    intent = normalize_product_export_intent(wording)
    assert intent.kind == "philippines_product_full_export"
    assert intent.warehouse == "PH"
    assert intent.historical_metrics_available is False


def test_plan_is_fixed_and_preview_is_default() -> None:
    plan = plan_product_export({}, date_label="20260917")
    assert plan.action == "preview"
    assert plan.page_size == 1000
    assert plan.max_pages == 100
    assert plan.max_requests == 200
    assert plan.date_label == "20260917"
    with pytest.raises(ValueError, match="action"):
        plan_product_export({"action": "retry"}, date_label="20260917")


def test_preview_does_not_construct_client_or_create_artifacts(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setattr(export_products, "artifact_root", lambda: tmp_path)
    monkeypatch.setattr(export_products, "ZhihuiTmsClient", lambda: pytest.fail("preview opened network client"))
    result = export_products.run({"request": "库存月末快照"})
    assert result["success"] is True
    assert result["action"] == "preview"
    assert result["historical_metrics_available"] is False
    assert result["artifacts"] == []
    assert list(tmp_path.iterdir()) == []


def test_preview_and_disabled_execute_emit_no_misleading_progress(monkeypatch) -> None:
    events: list[dict[str, object]] = []
    monkeypatch.delenv("ZHIHUI_TMS_PRODUCTION_ENABLED", raising=False)
    assert export_products.run_with_events({"action": "preview"}, events.append)["success"] is True
    assert export_products.run_with_events({"action": "execute"}, events.append)["success"] is False
    assert events == []


def test_execute_requires_explicit_gate_and_runtime_secrets(monkeypatch) -> None:
    monkeypatch.delenv("ZHIHUI_TMS_PRODUCTION_ENABLED", raising=False)
    monkeypatch.delenv("ZHIHUI_TMS_ACCOUNT", raising=False)
    monkeypatch.delenv("ZHIHUI_TMS_PASSWORD", raising=False)
    monkeypatch.setattr(export_products, "ZhihuiTmsClient", lambda: pytest.fail("gate opened network client"))

    blocked = export_products.run({"action": "execute"})
    assert blocked["success"] is False
    assert blocked["code"] == "tms_production_disabled"

    monkeypatch.setenv("ZHIHUI_TMS_PRODUCTION_ENABLED", "1")
    missing = export_products.run({"action": "execute"})
    assert missing["success"] is False
    assert missing["code"] == "tms_credentials_missing"


def test_execute_refuses_second_concurrent_run_before_login(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setenv("ZHIHUI_TMS_PRODUCTION_ENABLED", "1")
    monkeypatch.setenv("ZHIHUI_TMS_ACCOUNT", "fixture-account")
    monkeypatch.setenv("ZHIHUI_TMS_PASSWORD", "fixture-secret")
    monkeypatch.setattr(export_products, "artifact_root", lambda: tmp_path)
    monkeypatch.setattr(export_products, "ZhihuiTmsClient", lambda: pytest.fail("busy run opened network client"))

    @contextmanager
    def busy_lock(_path, *, timeout_seconds):
        assert timeout_seconds == 0
        raise InterProcessLockTimeout("another export owns lock")
        yield

    monkeypatch.setattr(export_products, "interprocess_lock", busy_lock)
    events: list[dict[str, object]] = []
    result = export_products.run_with_events({"action": "execute"}, events.append)
    assert result["success"] is False
    assert result["code"] == "tms_export_busy"
    assert result["artifacts"] == []
    assert events == []


def test_account_lock_is_shared_across_workspaces_without_exposing_account(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setenv("LXE_DATA_ROOT", str(tmp_path / "desktop-data"))
    monkeypatch.setattr(export_products, "artifact_root", lambda: tmp_path / "workspace-a")
    first = export_products._account_lock_path("fixture-account")
    monkeypatch.setattr(export_products, "artifact_root", lambda: tmp_path / "workspace-b")
    second = export_products._account_lock_path("fixture-account")
    other = export_products._account_lock_path("another-account")
    assert first == second
    assert first != other
    assert "fixture-account" not in str(first)
    assert first.is_relative_to(tmp_path / "desktop-data")


def test_execute_composes_login_export_and_delivery_with_artifact_paths(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setenv("ZHIHUI_TMS_PRODUCTION_ENABLED", "1")
    monkeypatch.setenv("ZHIHUI_TMS_ACCOUNT", "fixture-account")
    monkeypatch.setenv("ZHIHUI_TMS_PASSWORD", "fixture-secret")
    monkeypatch.setattr(export_products, "artifact_root", lambda: tmp_path)
    calls: list[object] = []

    class FakeClient:
        def login(self, account: str, password: str) -> None:
            calls.append(("login", account, password))

    client = FakeClient()
    monkeypatch.setattr(export_products, "ZhihuiTmsClient", lambda: client)

    def fake_export(actual_client, **limits):
        assert actual_client is client
        calls.append(("export", limits))
        return SimpleNamespace(pages=(object(),), total_records=2, request_count=2)

    def fake_delivery(actual_client, export_result, *, output_dir, date_label):
        assert actual_client is client
        assert export_result.total_records == 2
        output_dir.mkdir(parents=True)
        merged = output_dir / f"智慧tms-商品-合并-{date_label}.xlsx"
        merged.write_bytes(b"merged")
        calls.append(("delivery", output_dir))
        return SimpleNamespace(
            artifacts=(
                SimpleNamespace(path=str(merged), kind="merged", page=None, total_pages=1),
            ),
            total_rows=2,
        )

    monkeypatch.setattr(export_products, "export_stockwarehouse_pages", fake_export)
    monkeypatch.setattr(export_products, "deliver_product_exports", fake_delivery)

    result = export_products.run({"action": "execute"})
    assert result["success"] is True
    assert result["total_records"] == 2
    assert len(result["artifacts"]) == 1
    assert all(Path(item["path"]).is_absolute() for item in result["artifacts"])
    assert calls[0] == ("login", "fixture-account", "fixture-secret")
    assert calls[1][0] == "export"
    assert calls[2][0] == "delivery"
    assert "fixture-secret" not in str(result)


def test_execute_failure_reports_only_partial_merge_and_redacts_secret(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setenv("ZHIHUI_TMS_PRODUCTION_ENABLED", "1")
    monkeypatch.setenv("ZHIHUI_TMS_ACCOUNT", "fixture-account")
    monkeypatch.setenv("ZHIHUI_TMS_PASSWORD", "fixture-secret")
    monkeypatch.setattr(export_products, "artifact_root", lambda: tmp_path)
    monkeypatch.setattr(export_products, "ZhihuiTmsClient", lambda: SimpleNamespace(login=lambda *_: None))
    monkeypatch.setattr(
        export_products, "export_stockwarehouse_pages",
        lambda *_args, **_kwargs: SimpleNamespace(pages=(object(),), total_records=1, request_count=2),
    )

    def fail_delivery(_client, _result, *, output_dir, date_label, on_event):
        output_dir.mkdir(parents=True)
        partial = output_dir / f"智慧tms-商品-部分合并-{date_label}.xlsx"
        partial.write_bytes(b"merged")
        on_event({"stage": "downloaded", "page": 1, "total_pages": 1, "rows": 1})
        error = RuntimeError("fixture-secret workbook error")
        error.partial_artifacts = (SimpleNamespace(path=str(partial), kind="merged_partial", page=None, total_pages=1),)
        error.partial_pages = 1
        error.partial_rows = 1
        raise error

    monkeypatch.setattr(export_products, "deliver_product_exports", fail_delivery)
    events: list[dict[str, object]] = []
    result = export_products.run_with_events({"action": "execute"}, events.append)
    assert result["success"] is False
    assert len(result["artifacts"]) == 1
    assert result["artifacts"][0]["kind"] == "merged_partial"
    assert result["partial_pages"] == 1
    assert result["partial_rows"] == 1
    assert "fixture-secret" not in str(result)
    assert "[REDACTED]" in result["exception"]
    assert [event["stage"] for event in events] == [
        "login_started", "authenticated", "delivery_started", "downloaded",
    ]
    assert "fixture-secret" not in str(events)


def test_catalog_and_cli_preview_keep_credentials_out_of_arguments(monkeypatch, capsys) -> None:
    entry = load_catalog()["zhihui_export_products"]
    assert entry["artifact_paths"] == [{"field": "artifacts[].path", "role": "deliverable"}]
    assert set(entry["input_schema"]["properties"]) == {"action", "request"}
    monkeypatch.setattr(export_products, "ZhihuiTmsClient", lambda: pytest.fail("preview opened network client"))

    assert lxeskill_cli.main(["tms", "philippines", "products-export", "--action", "preview"]) == 0
    records = [json.loads(line) for line in capsys.readouterr().out.splitlines() if line.strip()]
    assert records[-1]["ok"] is True
    assert records[-1]["data"]["action"] == "preview"
    assert records[-1]["files"] == []


def test_zhihui_skill_manifest_covers_natural_product_export_wording() -> None:
    text = (repository_root() / "skills" / "zhihui-tms-product-export" / "SKILL.md").read_text(encoding="utf-8")
    for phrase in ("导出智汇商品", "下载智汇商品资料", "商品 SKU", "智汇商品 Excel/XLSX", "只说“菲律宾库存”"):
        assert phrase in text
    assert "用户请求必须明确指向“智汇”或“TMS”" in text
    assert "不处理订单、物流、发货、采购、财务报表" in text
