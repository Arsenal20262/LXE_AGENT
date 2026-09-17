from __future__ import annotations

from pathlib import Path

from lxeskill.business import load_catalog
from services.agent_cli.shangman import _workflow, goods_export_preview, goods_export_run


def test_preview_is_deterministic_and_does_not_construct_client(monkeypatch) -> None:
    def fail_constructor(*args, **kwargs):
        raise AssertionError("preview must not construct an HTTP client")

    monkeypatch.setattr(goods_export_preview, "ShangmanClient", fail_constructor, raising=False)

    first = goods_export_preview.run({"request_text": "请导出库存"})
    second = goods_export_preview.run({"request_text": "请导出库存"})

    assert first == second
    assert first["success"] is True
    assert first["status"] == "ready"
    assert first["intent"]["type"] == "goods-export"
    assert first["plan"] == {
        "type": "goods-export",
        "tasks": [{"type": "goods-export"}],
        "source_notice": "该文件保留平台原始商品导出字段，不包含逐日销量、14天销量或历史月末快照。",
    }


def test_catalog_exposes_only_request_text_for_both_public_commands() -> None:
    catalog = load_catalog()
    entries = [
        catalog["shangman_goods_export_preview"],
        catalog["shangman_goods_export_run"],
    ]

    assert [entry["command_path"] for entry in entries] == [
        ["shangman", "export", "preview"],
        ["shangman", "export", "run"],
    ]
    assert all(entry["owner_skills"] == ["shangman-goods-export-workflow-map"] for entry in entries)
    assert all(entry["input_schema"]["required"] == ["request_text"] for entry in entries)
    assert all(set(entry["input_schema"]["properties"]) == {"request_text"} for entry in entries)


def test_preview_maps_all_supported_business_wording_to_one_plan() -> None:
    requests = [
        "导出月度7天销量",
        "导出14天销量和30天销量",
        "查看90天日度销量",
        "导出当前库存",
        "导出月末库存快照",
        "导出入库时间",
        "导出商品上架时间",
    ]

    results = [goods_export_preview.run({"request_text": request}) for request in requests]

    assert all(result["status"] == "ready" for result in results)
    assert {result["intent"]["type"] for result in results} == {"goods-export"}
    assert {str(result["plan"]) for result in results} == {str(results[0]["plan"])}


def test_preview_preserves_original_request_and_rejects_missing_text() -> None:
    result = goods_export_preview.run({})

    assert result["success"] is False
    assert result["status"] == "blocked"
    assert result["error"]["code"] == "request_text_required"


def test_run_stops_at_production_gate_without_network(monkeypatch) -> None:
    monkeypatch.delenv("LXE_SHANGMAN_PROD_ENABLED", raising=False)

    class FailClient:
        def __init__(self, *args, **kwargs):
            raise AssertionError("run must stop before client construction")

    monkeypatch.setattr(_workflow, "ShangmanClient", FailClient)

    result = goods_export_run.run({"request_text": "导出当前库存"})

    assert result == {
        "success": False,
        "status": "blocked",
        "request_text": "导出当前库存",
        "intent": {"type": "goods-export", "request_text": "导出当前库存"},
        "plan": {
            "type": "goods-export",
            "tasks": [{"type": "goods-export"}],
            "source_notice": "该文件保留平台原始商品导出字段，不包含逐日销量、14天销量或历史月末快照。",
        },
        "error": {
            "code": "production_gate_required",
            "message": "LXE_SHANGMAN_PROD_ENABLED must be true before ERP execution",
            "recoverable": True,
        },
    }


def test_run_reports_missing_captcha_after_gate_and_credentials(monkeypatch) -> None:
    monkeypatch.setenv("LXE_SHANGMAN_PROD_ENABLED", "true")
    for name, value in {
        "LXE_SHANGMAN_TENANT_ID": "tenant",
        "LXE_SHANGMAN_USERNAME": "user",
        "LXE_SHANGMAN_PASSWORD": "password",
        "LXE_SHANGMAN_BASIC_USERNAME": "basic-user",
        "LXE_SHANGMAN_BASIC_PASSWORD": "basic-password",
    }.items():
        monkeypatch.setenv(name, value)

    result = goods_export_run.run({"request_text": "导出当前库存"})

    assert result["success"] is False
    assert result["status"] == "blocked"
    assert result["error"]["code"] == "captcha_input_required"
    assert result["error"]["recoverable"] is True


def test_run_reuses_first_stage_client_and_returns_one_artifact(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setenv("LXE_SHANGMAN_PROD_ENABLED", "true")
    for name, value in {
        "LXE_SHANGMAN_TENANT_ID": "tenant",
        "LXE_SHANGMAN_USERNAME": "user",
        "LXE_SHANGMAN_PASSWORD": "password",
        "LXE_SHANGMAN_BASIC_USERNAME": "basic-user",
        "LXE_SHANGMAN_BASIC_PASSWORD": "basic-password",
    }.items():
        monkeypatch.setenv(name, value)
    artifact = tmp_path / "智慧印尼-商品-20260917-150000.xlsx"
    artifact.write_bytes(b"fake xlsx")
    calls: list[dict] = []

    class FakeResult:
        def to_payload(self):
            return {"artifact_path": str(artifact), "source": "shangman_goods_export"}

    class FakeClient:
        def __init__(self, *, credentials, captcha_provider, output_dir=None):
            calls.append({"credentials": credentials, "captcha_provider": captcha_provider})

        async def export_goods(self):
            return FakeResult()

    monkeypatch.setattr(_workflow, "ShangmanClient", FakeClient)

    result = goods_export_run.run({"request_text": "请导出30天销量", "captcha_code": "1234"})

    assert result["success"] is True
    assert result["status"] == "completed"
    assert result["artifact_path"] == str(artifact)
    assert result["plan"]["type"] == "goods-export"
    assert len(calls) == 1


def test_run_redacts_runtime_credentials_but_keeps_client_diagnostic(monkeypatch) -> None:
    monkeypatch.setenv("LXE_SHANGMAN_PROD_ENABLED", "true")
    for name, value in {
        "LXE_SHANGMAN_TENANT_ID": "tenant-secret",
        "LXE_SHANGMAN_USERNAME": "user-secret",
        "LXE_SHANGMAN_PASSWORD": "password-secret",
        "LXE_SHANGMAN_BASIC_USERNAME": "basic-user-secret",
        "LXE_SHANGMAN_BASIC_PASSWORD": "basic-password-secret",
    }.items():
        monkeypatch.setenv(name, value)

    class FailingClient:
        def __init__(self, **kwargs):
            del kwargs

        async def export_goods(self):
            raise RuntimeError("login failed for password-secret: status=502")

    monkeypatch.setattr(_workflow, "ShangmanClient", FailingClient)

    result = goods_export_run.run({"request_text": "导出库存", "captcha_code": "1234"})

    assert result["error"] == {
        "code": "erp_execution_failed",
        "message": "login failed for <redacted>: status=502",
        "recoverable": True,
    }


def test_run_rejects_ambiguous_request_before_gate(monkeypatch) -> None:
    monkeypatch.delenv("LXE_SHANGMAN_PROD_ENABLED", raising=False)

    result = goods_export_run.run({"request_text": "最近卖得怎么样"})

    assert result["success"] is False
    assert result["status"] == "needs_clarification"
    assert result["error"]["code"] == "ambiguous_request"
